from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ..services.routing import optimize_vehicle_route

router = APIRouter(prefix="/routing", tags=["routing"])


class RoutingRequest(BaseModel):
    simulation_id: str
    origin: dict[str, float]
    destination: dict[str, float]
    vehicle_type: str


@router.post("/optimize")
async def optimize(payload: RoutingRequest):
    route = await optimize_vehicle_route(payload.origin, payload.destination, payload.vehicle_type)
    if not route:
        raise HTTPException(status_code=500, detail="routing failed")
    return route
