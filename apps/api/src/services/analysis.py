from __future__ import annotations

import asyncio
import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Import world-models modules using a namespace alias to avoid conflict with api's src/
_here = Path(__file__).resolve()
_repo_root = _here
while _repo_root != _repo_root.parent:
    if (_repo_root / "packages" / "world-models").is_dir():
        break
    _repo_root = _repo_root.parent
_wm_src = _repo_root / "packages" / "world-models" / "src"

import importlib.util as _ilu  # noqa: E402


def _load_wm_module(name: str):
    """Load a module from packages/world-models/src/ by name."""
    spec = _ilu.spec_from_file_location(
        f"wm_{name}", _wm_src / f"{name}.py",
        submodule_search_locations=[str(_wm_src)],
    )
    mod = _ilu.module_from_spec(spec)
    sys.modules[f"wm_{name}"] = mod
    spec.loader.exec_module(mod)
    return mod


_vision = _load_wm_module("vision")
_fire_sim = _load_wm_module("fire_sim")

analyze_frame = _vision.analyze_frame
build_spread_timeline = _fire_sim.build_spread_timeline


async def run_full_analysis(
    simulation_id: str,
    frame_path: str,
    frame_id: str = "frame_0",
    building_layout: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Run the complete 4-team analysis pipeline on a single frame.

    This is the main integration point that Ryun's orchestrator calls.
    It runs all 4 agent teams in sequence, each consuming the previous teams' outputs.

    Args:
        simulation_id: UUID of the simulation
        frame_path: Path to the image file to analyze
        frame_id: Identifier for this frame
        building_layout: Optional building layout for fire spread and routing

    Returns:
        Dict with all 4 teams' results plus spread timeline
    """
    results: dict[str, Any] = {
        "simulation_id": simulation_id,
        "frame_id": frame_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "teams": {},
    }

    # Team 1: Fire Severity (no context needed)
    fire_result = await analyze_frame(frame_path, "fire_severity", context=None, frame_id=frame_id)
    results["teams"]["fire_severity"] = fire_result

    # Team 2: Structural Analysis (consumes fire severity)
    structural_result = await analyze_frame(
        frame_path, "structural",
        context={"fire_severity": fire_result},
        frame_id=frame_id,
    )
    results["teams"]["structural"] = structural_result

    # Team 3: Evacuation Routes (consumes fire + structural)
    evacuation_result = await analyze_frame(
        frame_path, "evacuation",
        context={"fire_severity": fire_result, "structural": structural_result},
        frame_id=frame_id,
    )
    results["teams"]["evacuation"] = evacuation_result

    # Team 4: Personnel Recommendation (consumes all)
    personnel_result = await analyze_frame(
        frame_path, "personnel",
        context={
            "fire_severity": fire_result,
            "structural": structural_result,
            "evacuation": evacuation_result,
        },
        frame_id=frame_id,
    )
    results["teams"]["personnel"] = personnel_result

    # Bonus: fire spread timeline
    results["spread_timeline"] = build_spread_timeline(fire_result, building_layout)

    return results


async def run_single_team(
    frame_path: str,
    team_type: str,
    context: dict[str, Any] | None = None,
    frame_id: str = "frame_0",
) -> dict[str, Any]:
    """Run a single agent team's analysis. Used when teams run independently."""
    return await analyze_frame(frame_path, team_type, context=context, frame_id=frame_id)
