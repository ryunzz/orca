from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import List

router = APIRouter(prefix="/telemetry", tags=["telemetry"])


class TelemetryItem(BaseModel):
    simulation_id: str
    user_id: str
    position: dict
    rotation: dict
    action: str | None = None
    timestamp_ms: int


class TelemetryBatch(BaseModel):
    simulation_id: str
    user_id: str
    events: List[TelemetryItem] = Field(default_factory=list)


@router.post("/batch")
async def batch(payload: TelemetryBatch):
    # Hackathon-safe stub: persistence happens from websocket worker in real-time path.
    return {"accepted": len(payload.events)}
