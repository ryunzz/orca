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

import asyncio
import csv
import io
import json
import uuid
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models.simulation import AgentResult, Dataset, Simulation
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
    session: AsyncSession = Depends(get_session)
) -> dict[str, Any]:
    """Create a new simulation.

    Creates database record and initializes Redis state.
    """
    record = Simulation(
        name=payload.name,
        location=payload.location,
        environment_type=payload.environment_type,
        world_model_config=payload.world_model_config,
        status="pending",
    )
    session.add(record)
    await session.commit()
    await session.refresh(record)

    # Initialize Redis state
    await redis_client.set_simulation_status(str(record.id), "pending")

    return {
        "id": str(record.id),
        "name": record.name,
        "location": record.location,
        "environment_type": record.environment_type,
        "status": record.status,
    }


@router.get("/{simulation_id}")
async def get_simulation(
    simulation_id: str,
    session: AsyncSession = Depends(get_session)
) -> dict[str, Any]:
    """Get simulation state and metadata."""
    stmt = select(Simulation).where(Simulation.id == uuid.UUID(simulation_id))
    result = await session.execute(stmt)
    sim = result.scalar_one_or_none()

    if not sim:
        raise HTTPException(status_code=404, detail="Simulation not found")

    # Get current status from Redis (more up-to-date)
    redis_status = await redis_client.get_simulation_status(simulation_id)
    team_statuses = await redis_client.get_team_statuses(simulation_id)

    return {
        "id": str(sim.id),
        "name": sim.name,
        "location": sim.location,
        "environment_type": sim.environment_type,
        "status": redis_status or sim.status,
        "world_model_config": sim.world_model_config,
        "metadata": sim.extra,
        "created_at": sim.created_at.isoformat() if sim.created_at else None,
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
    session: AsyncSession = Depends(get_session)
) -> dict[str, Any]:
    """Trigger agent swarm analysis for a simulation.

    Runs in background and updates Redis with progress.
    Poll /results or use WebSocket to get updates.
    """
    # Verify simulation exists
    stmt = select(Simulation).where(Simulation.id == uuid.UUID(simulation_id))
    result = await session.execute(stmt)
    sim = result.scalar_one_or_none()

    if not sim:
        raise HTTPException(status_code=404, detail="Simulation not found")

    # Check if already running
    current_status = await redis_client.get_simulation_status(simulation_id)
    if current_status == "analyzing":
        raise HTTPException(status_code=409, detail="Simulation is already running")

    # Get frames - use provided or generate default
    frames = payload.frames
    if not frames:
        # Default stub frames for testing
        frames = [
            f"assets/frames/{sim.location or 'default'}/frame_001.png",
            f"assets/frames/{sim.location or 'default'}/frame_002.png",
        ]

    # Update database status
    sim.status = "analyzing"
    await session.commit()

    # Run orchestrator in background
    async def run_pipeline():
        try:
            results = await orchestrator.run_simulation(simulation_id, frames)
            # Store results in database
            async with AsyncSession(session.get_bind()) as db_session:
                for team_type, result_data in results.items():
                    agent_result = AgentResult(
                        simulation_id=uuid.UUID(simulation_id),
                        team_type=team_type,
                        instance_id="consensus",
                        result_json=result_data,
                        is_consensus=True,
                    )
                    db_session.add(agent_result)
                # Update simulation status
                stmt = select(Simulation).where(Simulation.id == uuid.UUID(simulation_id))
                res = await db_session.execute(stmt)
                sim_record = res.scalar_one_or_none()
                if sim_record:
                    sim_record.status = "complete"
                await db_session.commit()
        except Exception as e:
            async with AsyncSession(session.get_bind()) as db_session:
                stmt = select(Simulation).where(Simulation.id == uuid.UUID(simulation_id))
                res = await db_session.execute(stmt)
                sim_record = res.scalar_one_or_none()
                if sim_record:
                    sim_record.status = "error"
                    sim_record.extra = {**sim_record.extra, "error": str(e)}
                await db_session.commit()

    background_tasks.add_task(run_pipeline)

    return {
        "simulation_id": simulation_id,
        "status": "analyzing",
        "message": "Agent analysis started. Poll /results or use WebSocket for updates.",
        "frames": frames,
    }


@router.get("/{simulation_id}/results")
async def get_simulation_results(simulation_id: str) -> dict[str, Any]:
    """Get current results from all agent teams.

    Returns team statuses and any available data.
    Frontend should poll this endpoint or use WebSocket.
    """
    results = await orchestrator.get_simulation_results(simulation_id)
    return results


@router.get("/{simulation_id}/results/{team}")
async def get_team_results(
    simulation_id: str,
    team: str
) -> dict[str, Any]:
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
    session: AsyncSession = Depends(get_session)
) -> StreamingResponse:
    """Export simulation results as JSON or CSV dataset.

    This packages all agent results, frames, and metadata for download.
    """
    # Verify simulation exists
    stmt = select(Simulation).where(Simulation.id == uuid.UUID(simulation_id))
    result = await session.execute(stmt)
    sim = result.scalar_one_or_none()

    if not sim:
        raise HTTPException(status_code=404, detail="Simulation not found")

    # Get all results
    all_results = await orchestrator.get_simulation_results(simulation_id)

    # Get agent results from database
    stmt = select(AgentResult).where(AgentResult.simulation_id == uuid.UUID(simulation_id))
    result = await session.execute(stmt)
    agent_results = result.scalars().all()

    # Build export data
    export_data = {
        "simulation": {
            "id": str(sim.id),
            "name": sim.name,
            "location": sim.location,
            "environment_type": sim.environment_type,
            "status": all_results.get("status"),
            "created_at": sim.created_at.isoformat() if sim.created_at else None,
        },
        "teams": all_results.get("teams", {}),
        "agent_results": [
            {
                "id": str(ar.id),
                "team_type": ar.team_type,
                "instance_id": ar.instance_id,
                "is_consensus": ar.is_consensus,
                "result": ar.result_json,
                "created_at": ar.created_at.isoformat() if ar.created_at else None,
            }
            for ar in agent_results
        ],
        "metadata": sim.extra,
    }

    if format == "csv":
        # Flatten to CSV
        output = io.StringIO()
        writer = csv.writer(output)

        # Header
        writer.writerow([
            "simulation_id", "team_type", "instance_id", "is_consensus",
            "result_json", "created_at"
        ])

        # Rows
        for ar in agent_results:
            writer.writerow([
                str(sim.id),
                ar.team_type,
                ar.instance_id,
                ar.is_consensus,
                json.dumps(ar.result_json),
                ar.created_at.isoformat() if ar.created_at else "",
            ])

        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=orca_export_{simulation_id}.csv"
            }
        )

    else:
        # JSON export
        return StreamingResponse(
            iter([json.dumps(export_data, indent=2)]),
            media_type="application/json",
            headers={
                "Content-Disposition": f"attachment; filename=orca_export_{simulation_id}.json"
            }
        )


@router.delete("/{simulation_id}")
async def delete_simulation(
    simulation_id: str,
    session: AsyncSession = Depends(get_session)
) -> dict[str, str]:
    """Delete a simulation and all associated data."""
    stmt = select(Simulation).where(Simulation.id == uuid.UUID(simulation_id))
    result = await session.execute(stmt)
    sim = result.scalar_one_or_none()

    if not sim:
        raise HTTPException(status_code=404, detail="Simulation not found")

    # Delete from database
    await session.delete(sim)
    await session.commit()

    # Cleanup Redis
    await redis_client.cleanup_simulation(simulation_id)

    return {"status": "deleted", "simulation_id": simulation_id}
