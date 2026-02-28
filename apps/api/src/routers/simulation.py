"""ORCA Simulation API endpoints.

Endpoints:
- POST /api/simulation/create - Create new simulation
- GET /api/simulation/:id - Get simulation state
- POST /api/simulation/:id/run - Trigger agent analysis
- GET /api/simulation/:id/results - Get all team results
- GET /api/simulation/:id/results/:team - Get specific team results
- GET /api/simulation/:id/export - Export dataset
"""
from __future__ import annotations

import csv
import io
import json
import uuid
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from supabase import Client

from ..db import get_db
from ..redis_client import redis_client
from ..services.orchestrator import orchestrator

router = APIRouter(prefix="/simulation", tags=["simulation"])


class CreateSimulationRequest(BaseModel):
    """Request body for creating a simulation."""
    name: str = "Emergency Scenario"
    location: str | None = None
    environment_type: str
    world_model_config: dict[str, Any] = {}


class RunSimulationRequest(BaseModel):
    """Request body for running simulation analysis."""
    frames: list[str] | None = None


@router.post("/create")
async def create_simulation(
    payload: CreateSimulationRequest,
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    """Create a new simulation."""
    sim_id = str(uuid.uuid4())
    row = {
        "id": sim_id,
        "name": payload.name,
        "location": payload.location,
        "environment_type": payload.environment_type,
        "world_model_config": payload.world_model_config,
        "status": "pending",
        "metadata": {},
    }
    result = db.table("simulations").insert(row).execute()
    record = result.data[0]

    await redis_client.set_simulation_status(sim_id, "pending")

    return {
        "id": record["id"],
        "name": record["name"],
        "location": record.get("location"),
        "environment_type": record["environment_type"],
        "status": record["status"],
    }


@router.get("/{simulation_id}")
async def get_simulation(
    simulation_id: str,
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    """Get simulation state and metadata."""
    result = db.table("simulations").select("*").eq("id", simulation_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Simulation not found")

    sim = result.data[0]
    redis_status = await redis_client.get_simulation_status(simulation_id)
    team_statuses = await redis_client.get_team_statuses(simulation_id)

    return {
        "id": sim["id"],
        "name": sim["name"],
        "location": sim.get("location"),
        "environment_type": sim["environment_type"],
        "status": redis_status or sim["status"],
        "world_model_config": sim.get("world_model_config"),
        "metadata": sim.get("metadata", {}),
        "created_at": sim.get("created_at"),
        "teams": {
            team: {"status": status}
            for team, status in team_statuses.items()
        } if team_statuses else None,
    }


@router.post("/{simulation_id}/run")
async def run_simulation(
    simulation_id: str,
    payload: RunSimulationRequest,
    background_tasks: BackgroundTasks,
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    """Trigger agent swarm analysis for a simulation."""
    result = db.table("simulations").select("*").eq("id", simulation_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Simulation not found")

    sim = result.data[0]

    current_status = await redis_client.get_simulation_status(simulation_id)
    if current_status == "analyzing":
        raise HTTPException(status_code=409, detail="Simulation is already running")

    frames = payload.frames
    if not frames:
        location = sim.get("location") or "default"
        frames = [
            f"assets/frames/{location}/frame_001.png",
            f"assets/frames/{location}/frame_002.png",
        ]

    db.table("simulations").update({"status": "analyzing"}).eq("id", simulation_id).execute()

    async def run_pipeline():
        try:
            results = await orchestrator.run_simulation(simulation_id, frames)
            for team_type, result_data in results.items():
                db.table("agent_results").insert({
                    "id": str(uuid.uuid4()),
                    "simulation_id": simulation_id,
                    "team_type": team_type,
                    "instance_id": "consensus",
                    "result_json": result_data,
                    "is_consensus": True,
                    "metadata": {},
                }).execute()
            db.table("simulations").update({"status": "complete"}).eq("id", simulation_id).execute()
        except Exception as e:
            db.table("simulations").update({
                "status": "error",
                "metadata": {**sim.get("metadata", {}), "error": str(e)},
            }).eq("id", simulation_id).execute()

    background_tasks.add_task(run_pipeline)

    return {
        "simulation_id": simulation_id,
        "status": "analyzing",
        "message": "Agent analysis started. Poll /results or use WebSocket for updates.",
        "frames": frames,
    }


@router.get("/{simulation_id}/results")
async def get_simulation_results(simulation_id: str) -> dict[str, Any]:
    """Get current results from all agent teams."""
    return await orchestrator.get_simulation_results(simulation_id)


@router.get("/{simulation_id}/results/{team}")
async def get_team_results(simulation_id: str, team: str) -> dict[str, Any]:
    """Get results for a specific team."""
    valid_teams = ["fire_severity", "structural", "evacuation", "personnel"]
    if team not in valid_teams:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid team. Must be one of: {valid_teams}"
        )

    team_result = await redis_client.get_team_result(simulation_id, team)
    team_statuses = await redis_client.get_team_statuses(simulation_id)

    return {
        "simulation_id": simulation_id,
        "team": team,
        "status": team_statuses.get(team, "waiting"),
        "data": team_result,
    }


@router.get("/{simulation_id}/export")
async def export_simulation(
    simulation_id: str,
    format: str = "json",
    db: Client = Depends(get_db),
) -> StreamingResponse:
    """Export simulation results as JSON or CSV dataset."""
    result = db.table("simulations").select("*").eq("id", simulation_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Simulation not found")

    sim = result.data[0]
    all_results = await orchestrator.get_simulation_results(simulation_id)

    ar_result = db.table("agent_results").select("*").eq("simulation_id", simulation_id).execute()
    agent_results = ar_result.data or []

    export_data = {
        "simulation": {
            "id": sim["id"],
            "name": sim["name"],
            "location": sim.get("location"),
            "environment_type": sim["environment_type"],
            "status": all_results.get("status"),
            "created_at": sim.get("created_at"),
        },
        "teams": all_results.get("teams", {}),
        "agent_results": [
            {
                "id": ar["id"],
                "team_type": ar["team_type"],
                "instance_id": ar["instance_id"],
                "is_consensus": ar["is_consensus"],
                "result": ar["result_json"],
                "created_at": ar.get("created_at"),
            }
            for ar in agent_results
        ],
        "metadata": sim.get("metadata", {}),
    }

    if format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "simulation_id", "team_type", "instance_id", "is_consensus",
            "result_json", "created_at"
        ])
        for ar in agent_results:
            writer.writerow([
                sim["id"],
                ar["team_type"],
                ar["instance_id"],
                ar["is_consensus"],
                json.dumps(ar["result_json"]),
                ar.get("created_at", ""),
            ])
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=orca_export_{simulation_id}.csv"},
        )

    return StreamingResponse(
        iter([json.dumps(export_data, indent=2)]),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename=orca_export_{simulation_id}.json"},
    )


@router.delete("/{simulation_id}")
async def delete_simulation(
    simulation_id: str,
    db: Client = Depends(get_db),
) -> dict[str, str]:
    """Delete a simulation and all associated data."""
    result = db.table("simulations").select("id").eq("id", simulation_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Simulation not found")

    db.table("agent_results").delete().eq("simulation_id", simulation_id).execute()
    db.table("simulations").delete().eq("id", simulation_id).execute()
    await redis_client.cleanup_simulation(simulation_id)

    return {"status": "deleted", "simulation_id": simulation_id}
