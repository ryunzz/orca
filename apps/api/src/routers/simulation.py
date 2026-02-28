from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models.simulation import Simulation
from ..models.telemetry import TelemetryEvent
from ..models.analysis import AnalysisResult, SpreadPrediction
from ..services.world_model import EnvironmentPayload, world_model_service

router = APIRouter(prefix="/simulation", tags=["simulation"])


@router.post("/create")
async def create_simulation(payload: dict, session: AsyncSession = Depends(get_session)):
    environment_type = payload.get("environment_type")
    name = payload.get("name", "Emergency Scenario")
    config = payload.get("world_model_config", {})

    if not environment_type:
        raise HTTPException(status_code=400, detail="environment_type is required")

    record = Simulation(
        name=name,
        environment_type=environment_type,
        world_model_config=config,
        status="generating",
    )
    session.add(record)
    await session.commit()
    await session.refresh(record)

    env = await world_model_service.generate_environment(
        record.id,
        EnvironmentPayload(name=record.name, environment_type=record.environment_type, world_model_config=config),
    )
    return {"id": str(record.id), "state": env}


@router.get("/{simulation_id}")
async def get_simulation(simulation_id: str, session: AsyncSession = Depends(get_session)):
    stmt = select(Simulation).where(Simulation.id == uuid.UUID(simulation_id))
    result = await session.execute(stmt)
    sim = result.scalar_one_or_none()
    if not sim:
        raise HTTPException(status_code=404, detail="simulation not found")
    return {
        "id": str(sim.id),
        "name": sim.name,
        "environment_type": sim.environment_type,
        "status": sim.status,
        "world_model_config": sim.world_model_config,
        "metadata": sim.extra,
    }


@router.get("/{simulation_id}/telemetry")
async def get_simulation_telemetry(simulation_id: str, session: AsyncSession = Depends(get_session)):
    stmt = select(TelemetryEvent).where(TelemetryEvent.simulation_id == uuid.UUID(simulation_id))
    result = await session.execute(stmt)
    events = result.scalars().all()
    return {
        "simulation_id": simulation_id,
        "count": len(events),
        "events": [
            {
                "user_id": e.user_id,
                "position": e.position,
                "rotation": e.rotation,
                "action": e.action,
                "timestamp_ms": e.timestamp_ms,
            }
            for e in events
        ],
    }


@router.get("/{simulation_id}/export")
async def export_simulation_data(simulation_id: str, session: AsyncSession = Depends(get_session)):
    """Export all analysis results for a simulation as a structured dataset.

    This is the 'sellable dataset' — what fire departments and AI labs would buy.
    Returns all agent team results, spread predictions, and metadata.
    """
    sim_uuid = uuid.UUID(simulation_id)

    # Get simulation info
    sim_stmt = select(Simulation).where(Simulation.id == sim_uuid)
    sim_result = await session.execute(sim_stmt)
    sim = sim_result.scalar_one_or_none()
    if not sim:
        raise HTTPException(status_code=404, detail="simulation not found")

    # Get all analysis results
    analysis_stmt = select(AnalysisResult).where(AnalysisResult.simulation_id == sim_uuid)
    analysis_result = await session.execute(analysis_stmt)
    analyses = analysis_result.scalars().all()

    # Get spread predictions
    spread_stmt = select(SpreadPrediction).where(SpreadPrediction.simulation_id == sim_uuid)
    spread_result = await session.execute(spread_stmt)
    spreads = spread_result.scalars().all()

    return {
        "simulation": {
            "id": str(sim.id),
            "name": sim.name,
            "environment_type": sim.environment_type,
            "config": sim.world_model_config,
        },
        "analysis_results": [
            {
                "id": str(a.id),
                "frame_id": a.frame_id,
                "team_type": a.team_type,
                "result": a.result,
                "model_used": a.model_used,
                "confidence": a.confidence,
                "processing_time_ms": a.processing_time_ms,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in analyses
        ],
        "spread_predictions": [
            {
                "id": str(s.id),
                "frame_id": s.frame_id,
                "timeline": s.timeline,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
            for s in spreads
        ],
        "dataset_meta": {
            "total_frames_analyzed": len(set(a.frame_id for a in analyses)),
            "total_analysis_records": len(analyses),
            "team_types_present": list(set(a.team_type for a in analyses)),
            "export_format": "json",
            "schema_version": "1.0",
        },
    }
