"""ORCA Swarm Registry - One agent spawns sub-agents across all teams.

Architecture:
    External Agent (OpenClaw)
         │
         ▼ POST /spawn-swarm
    ┌────────────────────────────────────┐
    │         ORCA Network               │
    │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐  │
    │  │fire │ │struc│ │evac │ │pers │  │
    │  │ x3  │ │ x3  │ │ x3  │ │ x3  │  │
    │  └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘  │
    │     │       │       │       │      │
    │     └───────┴───────┴───────┘      │
    │              │                      │
    │     Network Aggregation             │
    │     (consensus + heat map)          │
    └─────────────────┬──────────────────┘
                      ▼
              Normalized Result

One command to spawn 12 sub-agents (3 per team):
    curl -X POST https://orca-swarm--spawn.modal.run \
      -d '{"name":"openclaw-1","instances_per_team":3}'
"""
from __future__ import annotations

import json
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

import modal

app = modal.App("orca-swarm")

image = modal.Image.debian_slim(python_version="3.11").pip_install("redis>=5.0.0")

# Network state
SWARMS: dict[str, dict] = {}  # swarm_id -> swarm metadata
AGENTS: dict[str, dict] = {}  # agent_id -> agent metadata
TASKS: dict[str, dict] = {}   # task_id -> task data
RESULTS: dict[str, list[dict]] = defaultdict(list)  # task_id -> [results from all agents]
HEAT_MAP: dict[str, dict] = {}  # simulation_id -> aggregated heat map

TEAMS = ["fire_severity", "structural", "evacuation", "personnel"]


@app.function(image=image, timeout=30)
@modal.web_endpoint(method="POST")
def spawn_swarm(request: dict) -> dict[str, Any]:
    """Spawn a swarm of sub-agents across all teams.

    POST: {
        "name": "openclaw-1",
        "instances_per_team": 3,  # default 3
        "capabilities": ["vision", "reasoning"]
    }

    Returns swarm_id and all sub-agent IDs.
    """
    swarm_id = str(uuid.uuid4())[:8]
    name = request.get("name", f"swarm-{swarm_id}")
    instances_per_team = request.get("instances_per_team", 3)
    capabilities = request.get("capabilities", ["vision"])

    # Spawn sub-agents for each team
    sub_agents = {}
    for team in TEAMS:
        sub_agents[team] = []
        for i in range(instances_per_team):
            agent_id = f"{swarm_id}_{team}_{i}"
            AGENTS[agent_id] = {
                "id": agent_id,
                "swarm_id": swarm_id,
                "team": team,
                "instance": i,
                "capabilities": capabilities,
                "status": "active",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            sub_agents[team].append(agent_id)

    SWARMS[swarm_id] = {
        "id": swarm_id,
        "name": name,
        "instances_per_team": instances_per_team,
        "total_agents": instances_per_team * len(TEAMS),
        "sub_agents": sub_agents,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    return {
        "status": "swarm_spawned",
        "swarm_id": swarm_id,
        "name": name,
        "total_agents": instances_per_team * len(TEAMS),
        "sub_agents": sub_agents,
        "poll_url": f"https://orca-swarm--poll-tasks.modal.run?swarm_id={swarm_id}",
        "submit_url": "https://orca-swarm--submit-batch.modal.run",
        "heat_map_url": f"https://orca-swarm--get-heat-map.modal.run?swarm_id={swarm_id}",
    }


@app.function(image=image, timeout=30)
@modal.web_endpoint(method="GET")
def poll_tasks(swarm_id: str) -> dict[str, Any]:
    """Get all pending tasks for a swarm's sub-agents.

    Returns tasks grouped by team, so the swarm can dispatch internally.
    """
    if swarm_id not in SWARMS:
        return {"error": "Swarm not registered"}

    swarm = SWARMS[swarm_id]
    pending_tasks = {team: [] for team in TEAMS}

    for task_id, task in TASKS.items():
        if task.get("status") == "pending":
            team = task.get("team_type", "fire_severity")
            pending_tasks[team].append(task)

    return {
        "swarm_id": swarm_id,
        "pending_tasks": pending_tasks,
        "total_pending": sum(len(t) for t in pending_tasks.values()),
    }


@app.function(image=image, timeout=60)
@modal.web_endpoint(method="POST")
def submit_batch(request: dict) -> dict[str, Any]:
    """Submit batch results from a swarm.

    POST: {
        "swarm_id": "...",
        "results": [
            {"task_id": "...", "agent_id": "...", "team": "fire_severity", "result": {...}},
            {"task_id": "...", "agent_id": "...", "team": "structural", "result": {...}},
            ...
        ]
    }
    """
    swarm_id = request.get("swarm_id")
    results = request.get("results", [])

    if not swarm_id or swarm_id not in SWARMS:
        return {"error": "Invalid swarm_id"}

    accepted = 0
    for r in results:
        task_id = r.get("task_id")
        if task_id:
            RESULTS[task_id].append({
                "agent_id": r.get("agent_id"),
                "team": r.get("team"),
                "result": r.get("result", {}),
                "swarm_id": swarm_id,
                "submitted_at": datetime.now(timezone.utc).isoformat(),
            })
            accepted += 1

    # Trigger aggregation if we have results from all teams
    _update_heat_map(swarm_id)

    return {"status": "accepted", "swarm_id": swarm_id, "results_accepted": accepted}


@app.function(image=image, timeout=30)
@modal.web_endpoint(method="POST")
def queue_analysis(request: dict) -> dict[str, Any]:
    """Queue a frame for analysis by the network.

    POST: {
        "simulation_id": "...",
        "frame_base64": "...",
        "frame_id": "frame_001"
    }

    Creates tasks for ALL teams. Swarms poll and process.
    """
    simulation_id = request.get("simulation_id", str(uuid.uuid4())[:8])
    frame_base64 = request.get("frame_base64", "")
    frame_id = request.get("frame_id", "unknown")

    task_ids = {}
    for team in TEAMS:
        task_id = f"{simulation_id}_{team}_{frame_id}"
        TASKS[task_id] = {
            "task_id": task_id,
            "simulation_id": simulation_id,
            "team_type": team,
            "frame_base64": frame_base64,
            "frame_id": frame_id,
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        task_ids[team] = task_id

    return {
        "status": "queued",
        "simulation_id": simulation_id,
        "task_ids": task_ids,
    }


def _update_heat_map(swarm_id: str) -> None:
    """Aggregate results across all agents into a heat map."""
    swarm = SWARMS.get(swarm_id, {})
    simulation_results = defaultdict(lambda: defaultdict(list))

    # Collect all results by simulation and team
    for task_id, result_list in RESULTS.items():
        for r in result_list:
            if r.get("swarm_id") == swarm_id:
                parts = task_id.split("_")
                if len(parts) >= 2:
                    sim_id = parts[0]
                    team = r.get("team", "unknown")
                    simulation_results[sim_id][team].append(r.get("result", {}))

    # Build heat map with aggregated scores
    for sim_id, team_results in simulation_results.items():
        heat_map = {
            "simulation_id": sim_id,
            "swarm_id": swarm_id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "teams": {},
            "network_consensus": {},
        }

        for team, results in team_results.items():
            if not results:
                continue

            # Aggregate confidence scores
            confidences = [r.get("confidence", 0.5) for r in results if "confidence" in r]
            avg_confidence = sum(confidences) / len(confidences) if confidences else 0.5

            # Aggregate severity scores (for fire_severity)
            severities = [r.get("severity_score", 0) for r in results if "severity_score" in r]
            avg_severity = sum(severities) / len(severities) if severities else 0

            # Aggregate integrity scores (for structural)
            integrities = [r.get("integrity_score", 1) for r in results if "integrity_score" in r]
            avg_integrity = sum(integrities) / len(integrities) if integrities else 1

            # Count votes for categorical fields
            severity_votes = defaultdict(int)
            for r in results:
                if "overall_severity" in r:
                    severity_votes[r["overall_severity"]] += 1

            heat_map["teams"][team] = {
                "num_agents": len(results),
                "avg_confidence": round(avg_confidence, 3),
                "avg_severity_score": round(avg_severity, 3) if severities else None,
                "avg_integrity_score": round(avg_integrity, 3) if integrities else None,
                "severity_votes": dict(severity_votes) if severity_votes else None,
                "consensus_confidence": round(avg_confidence * (1 - _variance(confidences)), 3) if len(confidences) > 1 else avg_confidence,
            }

        # Network-wide consensus
        all_confidences = []
        for team_data in heat_map["teams"].values():
            if team_data.get("avg_confidence"):
                all_confidences.append(team_data["avg_confidence"])

        heat_map["network_consensus"] = {
            "total_agents_contributed": sum(t.get("num_agents", 0) for t in heat_map["teams"].values()),
            "avg_network_confidence": round(sum(all_confidences) / len(all_confidences), 3) if all_confidences else 0,
            "teams_reporting": list(heat_map["teams"].keys()),
        }

        HEAT_MAP[sim_id] = heat_map


def _variance(values: list[float]) -> float:
    """Calculate variance of a list of values."""
    if len(values) < 2:
        return 0
    mean = sum(values) / len(values)
    return sum((x - mean) ** 2 for x in values) / len(values)


@app.function(image=image, timeout=30)
@modal.web_endpoint(method="GET")
def get_heat_map(simulation_id: str = None, swarm_id: str = None) -> dict[str, Any]:
    """Get the aggregated heat map for a simulation.

    Shows network-wide consensus across all contributing agents.
    """
    if simulation_id and simulation_id in HEAT_MAP:
        return HEAT_MAP[simulation_id]

    # Return all heat maps for this swarm
    if swarm_id:
        relevant = {k: v for k, v in HEAT_MAP.items() if v.get("swarm_id") == swarm_id}
        return {"swarm_id": swarm_id, "heat_maps": relevant}

    return {"error": "No heat map found", "available": list(HEAT_MAP.keys())}


@app.function(image=image)
@modal.web_endpoint(method="GET")
def network_status() -> dict[str, Any]:
    """Get overall network status."""
    return {
        "total_swarms": len(SWARMS),
        "total_agents": len(AGENTS),
        "pending_tasks": sum(1 for t in TASKS.values() if t.get("status") == "pending"),
        "completed_results": sum(len(r) for r in RESULTS.values()),
        "heat_maps_generated": len(HEAT_MAP),
        "swarms": [
            {
                "id": s["id"],
                "name": s["name"],
                "agents": s["total_agents"],
            }
            for s in SWARMS.values()
        ],
    }


@app.function(image=image)
@modal.web_endpoint(method="GET")
def docs() -> dict[str, Any]:
    """API documentation."""
    return {
        "name": "ORCA Swarm Network",
        "description": "One agent spawns sub-agents across all teams, results aggregated into heat maps",
        "endpoints": {
            "POST /spawn-swarm": "Spawn sub-agents across all 4 teams",
            "GET /poll-tasks?swarm_id=X": "Get pending tasks for your swarm",
            "POST /submit-batch": "Submit batch results from all sub-agents",
            "POST /queue-analysis": "Queue a frame for network analysis",
            "GET /get-heat-map?simulation_id=X": "Get aggregated heat map",
            "GET /network-status": "Overall network stats",
        },
        "quick_start": 'curl -X POST https://orca-swarm--spawn-swarm.modal.run -H "Content-Type: application/json" -d \'{"name":"my-swarm","instances_per_team":3}\'',
    }
