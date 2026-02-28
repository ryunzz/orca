"""ORCA Agent API — OpenClaw integration.

Endpoints for external agents (OpenClaw or custom) to register, poll for
tasks, and submit analysis results.  All state lives in Redis so it
persists across restarts and is shared with the orchestrator pipeline.

Flow:
    1. POST /api/agents/register   → get agent_id
    2. GET  /api/agents/poll       → get next task for your team
    3. POST /api/agents/submit     → submit analysis result
    4. GET  /api/agents/status     → list agents & queue depths
"""
from __future__ import annotations

import asyncio
import base64
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel

from ..redis_client import redis_client
from ..services.orchestrator import TeamType, orchestrator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agents", tags=["agents"])

# ─────────────────────────────────────────────────────────────────────
# Request / Response Models
# ─────────────────────────────────────────────────────────────────────


class RegisterRequest(BaseModel):
    name: str = "openclaw-agent"
    team: str = "fire_severity"
    capabilities: list[str] = ["vision"]


class SubmitRequest(BaseModel):
    task_id: str
    agent_id: str
    result: dict[str, Any]


class SpawnRequest(BaseModel):
    node_type: str
    wallet_address: str | None = None
    compute_specs: dict | None = None


# ─────────────────────────────────────────────────────────────────────
# Agent Registration
# ─────────────────────────────────────────────────────────────────────


@router.post("/register")
async def register_agent(payload: RegisterRequest) -> dict[str, Any]:
    """Register an external agent to join the ORCA network.

    Returns an agent_id and the URLs for polling and submitting.
    """
    agent_id = str(uuid.uuid4())[:8]
    agent_data = {
        "id": agent_id,
        "name": payload.name,
        "team": payload.team,
        "capabilities": payload.capabilities,
        "status": "active",
        "registered_at": datetime.now(timezone.utc).isoformat(),
    }

    await redis_client.register_agent(agent_id, agent_data)
    logger.info(f"Agent registered: {agent_id} ({payload.name}) → team {payload.team}")

    return {
        "status": "registered",
        "agent_id": agent_id,
        "team": payload.team,
        "poll_url": f"/api/agents/poll?agent_id={agent_id}",
        "submit_url": "/api/agents/submit",
    }


# ─────────────────────────────────────────────────────────────────────
# Task Polling
# ─────────────────────────────────────────────────────────────────────


@router.get("/poll")
async def poll_task(agent_id: str) -> dict[str, Any]:
    """Poll for the next task assigned to this agent's team.

    Returns a task with frame_base64 and team_type, or {"status": "no_task"}.
    """
    agent = await redis_client.get_agent(agent_id)
    if not agent:
        return {"error": "Agent not registered. POST /api/agents/register first."}

    team = agent["team"]
    task = await redis_client.poll_task(team)

    if task:
        task["assigned_to"] = agent_id
        task["assigned_at"] = datetime.now(timezone.utc).isoformat()
        logger.info(f"Task {task['task_id']} assigned to agent {agent_id} (team={team})")
        return {"status": "task_assigned", "task": task}

    return {"status": "no_task", "team": team, "message": "No pending tasks. Poll again in 2-5 seconds."}


# ─────────────────────────────────────────────────────────────────────
# Result Submission
# ─────────────────────────────────────────────────────────────────────


@router.post("/submit")
async def submit_result(
    payload: SubmitRequest,
    background_tasks: BackgroundTasks,
) -> dict[str, Any]:
    """Submit analysis result for a task.

    Stores the result in Redis and triggers downstream teams if all
    upstream dependencies are now satisfied.
    """
    agent = await redis_client.get_agent(payload.agent_id)
    if not agent:
        return {"error": "Agent not registered."}

    await redis_client.submit_task_result(
        payload.task_id, payload.agent_id, payload.result
    )
    logger.info(f"Result submitted: task={payload.task_id} agent={payload.agent_id}")

    # Task IDs follow convention: <simulation_id>_<team_type>
    # Team types can contain underscores (e.g. fire_severity), so we find
    # the team suffix by checking against known team types.
    sim_id = None
    team_type = None
    for tt in ["fire_severity", "structural", "evacuation", "personnel"]:
        if payload.task_id.endswith(f"_{tt}"):
            sim_id = payload.task_id[: -(len(tt) + 1)]
            team_type = tt
            break

    if sim_id and team_type:
        # Store result as the team consensus in Redis (orchestrator reads this)
        await redis_client.set_team_result(sim_id, team_type, payload.result)
        await redis_client.set_team_status(sim_id, team_type, "complete")

        # Check if downstream teams can now be queued
        background_tasks.add_task(_maybe_queue_downstream, sim_id, team_type)

    return {"status": "accepted", "task_id": payload.task_id}


async def _maybe_queue_downstream(simulation_id: str, completed_team: str) -> None:
    """After a team completes, check if any downstream team has all deps satisfied.

    If so, queue tasks for that team automatically.
    """
    team_order = TeamType.execution_order()

    for team_type in team_order:
        deps = team_type.dependencies()
        if not deps:
            continue  # fire_severity has no deps

        # Check if all deps are complete
        all_ready = True
        for dep in deps:
            result = await redis_client.get_team_result(simulation_id, dep.value)
            if not result:
                all_ready = False
                break

        if not all_ready:
            continue

        # Check if this team already has tasks queued or is complete
        status_map = await redis_client.get_team_statuses(simulation_id)
        if status_map.get(team_type.value) in ("processing", "complete"):
            continue

        # Queue tasks for this team
        logger.info(f"Auto-queuing tasks for team {team_type.value} (all deps ready)")
        await _queue_team_tasks(simulation_id, team_type.value)


async def _queue_team_tasks(simulation_id: str, team_type: str) -> None:
    """Queue analysis tasks for a team, including upstream context and frame data."""
    # Get frames for this simulation
    frames = await redis_client.get_simulation_frames(simulation_id)
    if not frames:
        frames = ["default_frame"]

    # Gather upstream context
    context = {}
    try:
        tt = TeamType(team_type)
        for dep in tt.dependencies():
            result = await redis_client.get_team_result(simulation_id, dep.value)
            if result:
                context[dep.value] = result
    except ValueError:
        pass

    # Load frame data and encode as base64
    frame_b64 = ""
    if frames:
        frame_path = Path(frames[0])
        if frame_path.exists():
            frame_b64 = base64.standard_b64encode(frame_path.read_bytes()).decode()

    task_id = f"{simulation_id}_{team_type}"
    task = {
        "task_id": task_id,
        "simulation_id": simulation_id,
        "team_type": team_type,
        "frame_base64": frame_b64,
        "frame_id": frames[0] if frames else "unknown",
        "context": context,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    await redis_client.queue_task(team_type, task)
    await redis_client.set_team_status(simulation_id, team_type, "processing")
    logger.info(f"Queued task {task_id} for team {team_type}")


# ─────────────────────────────────────────────────────────────────────
# Kick off a simulation for OpenClaw agents
# ─────────────────────────────────────────────────────────────────────


@router.post("/run/{simulation_id}")
async def run_openclaw_simulation(
    simulation_id: str,
    frames: list[str] | None = None,
) -> dict[str, Any]:
    """Start a simulation that external OpenClaw agents will process.

    Queues fire_severity tasks immediately. Downstream teams auto-queue
    as their upstream dependencies complete.
    """
    if not frames:
        frames = [
            "assets/frames/house_fire_flames.jpg",
            "assets/frames/structure_fire_exterior.jpg",
        ]

    # Store simulation state
    await redis_client.set_simulation_status(simulation_id, "analyzing")
    await redis_client.set_simulation_frames(simulation_id, frames)

    # Initialize all teams as waiting
    for team_type in TeamType.execution_order():
        await redis_client.set_team_status(simulation_id, team_type.value, "waiting")

    # Queue the first team (fire_severity has no deps)
    await _queue_team_tasks(simulation_id, "fire_severity")

    return {
        "status": "queued",
        "simulation_id": simulation_id,
        "message": "fire_severity tasks queued. Downstream teams auto-queue as deps complete.",
        "teams": {
            "fire_severity": "processing",
            "structural": "waiting (needs fire_severity)",
            "evacuation": "waiting (needs fire_severity + structural)",
            "personnel": "waiting (needs all)",
        },
        "agent_instructions": {
            "1_register": "POST /api/agents/register",
            "2_poll": "GET /api/agents/poll?agent_id=<id>",
            "3_submit": "POST /api/agents/submit",
        },
    }


# ─────────────────────────────────────────────────────────────────────
# Status & Monitoring
# ─────────────────────────────────────────────────────────────────────


@router.get("/status")
async def agent_status() -> dict[str, Any]:
    """Get all registered agents and queue depths."""
    agents = await redis_client.list_agents()
    queues = await redis_client.get_queue_lengths()
    return {
        "agents": agents,
        "agent_count": len(agents),
        "task_queues": queues,
        "nodes": orchestrator.active_nodes,
    }


@router.post("/spawn")
async def spawn_agent(payload: SpawnRequest):
    """Spawn an internal agent node (legacy endpoint)."""
    data = orchestrator.spawn_node(
        payload.node_type, payload.wallet_address, payload.compute_specs
    )
    return data
