"""ORCA Agent Registry - Simple agent onboarding.

Any agent can join the network with one command:
    curl -X POST https://orca-vision--register.modal.run -d '{"name":"my-agent","team":"fire_severity"}'

Then poll for tasks and submit results.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

import modal

app = modal.App("orca-vision")

image = modal.Image.debian_slim(python_version="3.11").pip_install("redis>=5.0.0")

# In-memory registry (use Redis in production)
AGENTS: dict[str, dict] = {}
TASK_QUEUE: dict[str, list[dict]] = {}  # team_type -> [tasks]
RESULTS: dict[str, dict] = {}  # task_id -> result


@app.function(image=image, timeout=30)
@modal.web_endpoint(method="POST")
def register(request: dict) -> dict[str, Any]:
    """Register an agent to join the network.

    POST: {"name": "my-agent", "team": "fire_severity", "capabilities": [...]}

    Returns agent_id and WebSocket URL for receiving tasks.
    """
    agent_id = str(uuid.uuid4())[:8]
    team = request.get("team", "fire_severity")
    name = request.get("name", f"agent-{agent_id}")

    AGENTS[agent_id] = {
        "id": agent_id,
        "name": name,
        "team": team,
        "capabilities": request.get("capabilities", ["vision"]),
        "status": "active",
        "registered_at": datetime.now(timezone.utc).isoformat(),
    }

    return {
        "status": "registered",
        "agent_id": agent_id,
        "team": team,
        "poll_url": f"https://orca-vision--poll-task.modal.run?agent_id={agent_id}",
        "submit_url": "https://orca-vision--submit-result.modal.run",
        "instructions": "Poll for tasks, analyze frames, submit results. See /docs for full API.",
    }


@app.function(image=image, timeout=30)
@modal.web_endpoint(method="GET")
def poll_task(agent_id: str) -> dict[str, Any]:
    """Poll for next task assigned to this agent.

    GET: ?agent_id=<your-agent-id>

    Returns task with frame to analyze, or {"status": "no_task"}.
    """
    if agent_id not in AGENTS:
        return {"error": "Agent not registered", "register_url": "https://orca-vision--register.modal.run"}

    agent = AGENTS[agent_id]
    team = agent["team"]

    # Check for pending tasks for this team
    if team in TASK_QUEUE and TASK_QUEUE[team]:
        task = TASK_QUEUE[team].pop(0)
        task["assigned_to"] = agent_id
        task["assigned_at"] = datetime.now(timezone.utc).isoformat()
        return {"status": "task_assigned", "task": task}

    return {"status": "no_task", "message": "No pending tasks. Poll again in 1-5 seconds."}


@app.function(image=image, timeout=60)
@modal.web_endpoint(method="POST")
def submit_result(request: dict) -> dict[str, Any]:
    """Submit analysis result for a task.

    POST: {"task_id": "...", "agent_id": "...", "result": {...}}
    """
    task_id = request.get("task_id")
    agent_id = request.get("agent_id")
    result = request.get("result", {})

    if not task_id or not agent_id:
        return {"error": "task_id and agent_id required"}

    RESULTS[task_id] = {
        "task_id": task_id,
        "agent_id": agent_id,
        "result": result,
        "submitted_at": datetime.now(timezone.utc).isoformat(),
    }

    return {"status": "accepted", "task_id": task_id}


@app.function(image=image, timeout=30)
@modal.web_endpoint(method="POST")
def queue_task(request: dict) -> dict[str, Any]:
    """Queue a task for agents to process (called by orchestrator).

    POST: {
        "simulation_id": "...",
        "team_type": "fire_severity",
        "frame_base64": "...",
        "frame_id": "frame_001",
        "context": {...}
    }
    """
    task_id = str(uuid.uuid4())[:8]
    team = request.get("team_type", "fire_severity")

    task = {
        "task_id": task_id,
        "simulation_id": request.get("simulation_id"),
        "team_type": team,
        "frame_base64": request.get("frame_base64"),
        "frame_id": request.get("frame_id", "unknown"),
        "context": request.get("context"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    if team not in TASK_QUEUE:
        TASK_QUEUE[team] = []
    TASK_QUEUE[team].append(task)

    return {"status": "queued", "task_id": task_id, "team": team}


@app.function(image=image, timeout=30)
@modal.web_endpoint(method="GET")
def get_result(task_id: str) -> dict[str, Any]:
    """Get result for a task (called by orchestrator)."""
    if task_id in RESULTS:
        return RESULTS[task_id]
    return {"status": "pending", "task_id": task_id}


@app.function(image=image)
@modal.web_endpoint(method="GET")
def agents() -> dict[str, Any]:
    """List all registered agents."""
    return {"agents": list(AGENTS.values()), "count": len(AGENTS)}


@app.function(image=image)
@modal.web_endpoint(method="GET")
def docs() -> dict[str, Any]:
    """API documentation."""
    return {
        "name": "ORCA Agent Network",
        "version": "1.0.0",
        "endpoints": {
            "POST /register": "Register as an agent",
            "GET /poll-task?agent_id=X": "Get next task",
            "POST /submit-result": "Submit analysis result",
            "GET /agents": "List all agents",
            "GET /docs": "This documentation",
        },
        "quick_start": "curl -X POST https://orca-vision--register.modal.run -H 'Content-Type: application/json' -d '{\"name\":\"my-agent\",\"team\":\"fire_severity\"}'",
    }
