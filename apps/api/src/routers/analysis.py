from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any

from ..services.analysis import run_full_analysis, run_single_team, _load_wm_module

router = APIRouter(prefix="/analysis", tags=["analysis"])


class FullAnalysisRequest(BaseModel):
    simulation_id: str
    frame_path: str
    frame_id: str = "frame_0"


class AnalysisResponse(BaseModel):
    simulation_id: str
    frame_id: str
    timestamp: str
    teams: dict[str, Any]
    spread_timeline: list[dict[str, Any]] | None = None


class SingleTeamRequest(BaseModel):
    frame_path: str
    team_type: str
    context: dict[str, Any] | None = None
    frame_id: str = "frame_0"


@router.post("/run", response_model=AnalysisResponse)
async def run_analysis(request: FullAnalysisRequest):
    """Run the full 4-team analysis pipeline on a frame.

    This triggers all 4 agent teams in sequence:
    1. Fire Severity -> 2. Structural Analysis -> 3. Evacuation Routes -> 4. Personnel Rec
    """
    try:
        result = await run_full_analysis(
            request.simulation_id, request.frame_path, request.frame_id,
        )
        return result
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Frame not found: {request.frame_path}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/team")
async def run_team(request: SingleTeamRequest):
    """Run a single agent team's analysis.

    team_type must be one of: fire_severity, structural, evacuation, personnel
    """
    valid_types = {"fire_severity", "structural", "evacuation", "personnel"}
    if request.team_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid team_type: {request.team_type}. Must be one of {valid_types}",
        )
    try:
        result = await run_single_team(
            request.frame_path,
            request.team_type,
            request.context,
            request.frame_id,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/demo")
async def demo_analysis(frame_id: str = "siebel_demo_001"):
    """Return a complete demo analysis using pre-computed fallback data.

    No image or API key required. Returns all 4 teams' results plus fire spread
    timeline for the Siebel Center scenario. Use this for frontend development
    and live demos.
    """
    _fallback = _load_wm_module("fallback")
    _fire_sim = _load_wm_module("fire_sim")

    results = _fallback.get_all_fallbacks(frame_id)
    return {
        "simulation_id": "demo",
        "frame_id": frame_id,
        "teams": results,
        "spread_timeline": _fire_sim.build_spread_timeline(results["fire_severity"]),
    }
