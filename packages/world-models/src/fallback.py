from __future__ import annotations

"""Pre-computed fallback results for demo reliability.

If Ollama is unavailable or the vision pipeline is too slow,
the system falls back to these pre-computed results for the Siebel Center demo.
These match the shared/schemas/ exactly.
"""

import copy
from datetime import datetime, timezone
from typing import Any


SIEBEL_FIRE_SEVERITY: dict[str, Any] = {
    "severity": 7,
    "fire_locations": [
        {"label": "Room 201", "intensity": 0.85, "x": 0.45, "y": 0.35, "radius": 0.25},
        {"label": "Hallway B", "intensity": 0.35, "x": 0.30, "y": 0.50, "radius": 0.10},
    ],
    "fuel_sources": [
        {"material": "furniture", "flammability": "high", "location_label": "Room 201"},
        {"material": "carpet", "flammability": "medium", "location_label": "Hallway B"},
        {"material": "paper", "flammability": "high", "location_label": "Room 201"},
    ],
    "smoke_density": "moderate",
    "confidence": 0.91,
}

SIEBEL_STRUCTURAL: dict[str, Any] = {
    "objects": [
        {"type": "door", "condition": "intact", "location_label": "Lobby entrance", "x": 0.15, "y": 0.90, "notes": "Main entry point"},
        {"type": "door", "condition": "damaged", "location_label": "Room 201 entrance", "x": 0.40, "y": 0.50, "notes": "Heat damage to frame"},
        {"type": "wall", "condition": "damaged", "location_label": "Room 201 south wall", "x": 0.55, "y": 0.75, "notes": "Cracking visible"},
        {"type": "stairwell", "condition": "intact", "location_label": "Stairwell A", "x": 0.10, "y": 0.85, "notes": ""},
        {"type": "window", "condition": "compromised", "location_label": "Room 201 east window", "x": 0.70, "y": 0.25, "notes": "Glass broken from heat"},
        {"type": "fire_extinguisher", "condition": "intact", "location_label": "Hallway A south wall", "x": 0.25, "y": 0.60, "notes": ""},
        {"type": "exit_sign", "condition": "intact", "location_label": "Hallway A", "x": 0.20, "y": 0.55, "notes": ""},
        {"type": "furniture", "condition": "destroyed", "location_label": "Room 201 desk area", "x": 0.50, "y": 0.30, "notes": "Fully engulfed"},
    ],
    "integrity_score": 6,
    "blocked_passages": [
        {"passage": "Room 201 entrance", "reason": "fire", "severity": "partial"},
    ],
    "collapse_risk": "low",
    "degradation_timeline": {
        "minutes_to_concern": 12,
        "minutes_to_critical": 25,
        "factors": ["active fire near load-bearing wall", "high fuel load"],
    },
}


def _stamp(result: dict[str, Any], frame_id: str) -> dict[str, Any]:
    result["frame_id"] = frame_id
    result["timestamp"] = datetime.now(timezone.utc).isoformat()
    return result


def get_fallback_fire_severity(frame_id: str = "unknown") -> dict[str, Any]:
    return _stamp(copy.deepcopy(SIEBEL_FIRE_SEVERITY), frame_id)


def get_fallback_structural(frame_id: str = "unknown") -> dict[str, Any]:
    return _stamp(copy.deepcopy(SIEBEL_STRUCTURAL), frame_id)


def get_all_fallbacks(frame_id: str = "unknown") -> dict[str, Any]:
    """Return pre-computed results for all 4 teams.

    Evacuation and personnel are computed from the static fire/structural data
    so they stay consistent. This avoids duplicating those constants.
    """
    from .evacuation import compute_evacuation_routes
    from .personnel import recommend_personnel

    fire = get_fallback_fire_severity(frame_id)
    structural = get_fallback_structural(frame_id)
    evacuation = compute_evacuation_routes(fire, structural, frame_id)
    personnel = recommend_personnel(
        {"fire_severity": fire, "structural": structural, "evacuation": evacuation},
        frame_id,
    )
    return {
        "fire_severity": fire,
        "structural": structural,
        "evacuation": evacuation,
        "personnel": personnel,
    }
