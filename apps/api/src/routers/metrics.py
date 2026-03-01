"""REST endpoints for on-demand metrics computation and CUA path comparison."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..services.metrics import (
    compute_all_metrics,
    compute_heat_exposure,
    compute_optimized_path,
    compute_survivability_window,
)

router = APIRouter(prefix="/metrics", tags=["metrics"])


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class ComputeMetricsRequest(BaseModel):
    simulation_id: str = "demo"
    origin: str = "Lobby"
    destination: str = "1302"
    fire_data: dict[str, Any] | None = None
    structural_data: dict[str, Any] | None = None


class CuaPathRequest(BaseModel):
    simulation_id: str = "demo"
    cua_path: list[str] = Field(..., min_length=1)
    origin: str | None = None
    destination: str | None = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/compute")
async def compute_metrics(req: ComputeMetricsRequest) -> dict[str, Any]:
    """Compute all three observability metrics for a simulation.

    If fire_data/structural_data are not provided, uses the demo fallback data.
    """
    fire_data = req.fire_data
    structural_data = req.structural_data

    if fire_data is None:
        from ..services.analysis import _load_wm_module
        _fallback = _load_wm_module("fallback")
        fire_data = _fallback.get_fallback_fire_severity(req.simulation_id)
        if structural_data is None:
            structural_data = _fallback.get_fallback_structural(req.simulation_id)

    snapshot = compute_all_metrics(
        fire_data,
        structural_data,
        origin=req.origin,
        destination=req.destination,
    )
    return {"simulation_id": req.simulation_id, "metrics": snapshot.to_dict()}


@router.get("/{simulation_id}")
async def get_cached_metrics(simulation_id: str) -> dict[str, Any]:
    """Return cached metrics from Redis. Falls back to computing fresh if uncached."""
    from ..redis_client import redis_client

    cached = None
    try:
        cached = await redis_client.client.get(f"metrics:{simulation_id}")
    except Exception:
        pass

    if cached:
        import json
        return {"simulation_id": simulation_id, "metrics": json.loads(cached), "cached": True}

    # Compute fresh with fallback data
    from ..services.analysis import _load_wm_module
    _fallback = _load_wm_module("fallback")
    fire_data = _fallback.get_fallback_fire_severity(simulation_id)
    structural_data = _fallback.get_fallback_structural(simulation_id)

    snapshot = compute_all_metrics(fire_data, structural_data)
    return {"simulation_id": simulation_id, "metrics": snapshot.to_dict(), "cached": False}


@router.post("/cua/path")
async def compare_cua_path(req: CuaPathRequest) -> dict[str, Any]:
    """Compare a CUA-submitted traversal path against the optimal route.

    The CUA agent calls this with its chosen path. We compute metrics for both
    the CUA path and the optimal path, then return an efficiency ratio.
    """
    from ..services.analysis import _load_wm_module
    _fallback = _load_wm_module("fallback")

    fire_data = _fallback.get_fallback_fire_severity(req.simulation_id)
    structural_data = _fallback.get_fallback_structural(req.simulation_id)

    # Determine origin/destination from CUA path if not specified
    origin = req.origin or req.cua_path[0]
    destination = req.destination or req.cua_path[-1]

    # Compute optimal metrics
    optimal = compute_all_metrics(fire_data, structural_data, origin=origin, destination=destination)

    # Compute CUA path metrics (use the CUA path directly)
    cua_survivability = compute_survivability_window(req.cua_path, fire_data)
    cua_heat = compute_heat_exposure(req.cua_path, fire_data, structural_data)

    # Efficiency ratio: lower is better for CUA (1.0 = as good as optimal)
    optimal_score = optimal.heat_exposure.total_score
    cua_score = cua_heat.total_score
    if optimal_score > 0:
        efficiency_ratio = round(cua_score / optimal_score, 3)
    else:
        efficiency_ratio = 1.0 if cua_score == 0 else float("inf")

    return {
        "simulation_id": req.simulation_id,
        "optimal": optimal.to_dict(),
        "cua": {
            "path": req.cua_path,
            "room_count": len(req.cua_path),
            "survivability": {
                "minutes_remaining": cua_survivability.minutes_remaining,
                "viable": cua_survivability.viable,
                "worst_room": cua_survivability.worst_room,
                "worst_room_intensity": cua_survivability.worst_room_intensity,
            },
            "heat_exposure": {
                "total_score": cua_heat.total_score,
                "classification": cua_heat.classification,
                "per_room": cua_heat.per_room,
            },
        },
        "efficiency_ratio": efficiency_ratio,
    }
