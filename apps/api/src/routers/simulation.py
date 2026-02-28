from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models.simulation import Simulation
from ..models.telemetry import TelemetryEvent
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
        "metadata": sim.metadata,
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
