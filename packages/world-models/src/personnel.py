from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


# NFPA-based heuristics for personnel deployment
# Reference: NFPA 1710 (career fire departments) and NFPA 1720 (volunteer)

ALARM_THRESHOLDS = {
    1: {"severity_max": 3, "description": "Minor incident - single engine company"},
    2: {"severity_max": 5, "description": "Working fire - full first alarm assignment"},
    3: {"severity_max": 7, "description": "Multiple alarm - additional resources"},
    4: {"severity_max": 9, "description": "Major incident - mutual aid requested"},
    5: {"severity_max": 10, "description": "Catastrophic - all available resources"},
}

# Firefighters per alarm level (NFPA 1710 minimums)
FIREFIGHTERS_BY_ALARM = {1: 4, 2: 10, 3: 18, 4: 28, 5: 40}

# Truck composition by alarm level
TRUCKS_BY_ALARM: dict[int, list[dict[str, Any]]] = {
    1: [{"type": "engine", "count": 1}],
    2: [{"type": "engine", "count": 2}, {"type": "ladder", "count": 1}],
    3: [{"type": "engine", "count": 3}, {"type": "ladder", "count": 1}, {"type": "rescue", "count": 1}],
    4: [{"type": "engine", "count": 4}, {"type": "ladder", "count": 2}, {"type": "rescue", "count": 1}, {"type": "tanker", "count": 1}],
    5: [{"type": "engine", "count": 5}, {"type": "ladder", "count": 2}, {"type": "rescue", "count": 2}, {"type": "tanker", "count": 1}, {"type": "hazmat", "count": 1}],
}

# Base equipment always needed
BASE_EQUIPMENT = [
    {"item": "SCBA", "quantity": 4, "priority": "critical"},
    {"item": "hose_line", "quantity": 2, "priority": "critical"},
    {"item": "halligan_tool", "quantity": 2, "priority": "critical"},
    {"item": "thermal_imaging_camera", "quantity": 1, "priority": "critical"},
]

# Additional equipment by scenario
SCENARIO_EQUIPMENT: dict[str, list[dict[str, Any]]] = {
    "high_rise": [
        {"item": "portable_ladder", "quantity": 2, "priority": "recommended"},
        {"item": "standpipe_kit", "quantity": 1, "priority": "critical"},
    ],
    "structural_compromise": [
        {"item": "shoring_equipment", "quantity": 1, "priority": "critical"},
        {"item": "rope_rescue_kit", "quantity": 1, "priority": "recommended"},
    ],
    "heavy_smoke": [
        {"item": "positive_pressure_ventilator", "quantity": 2, "priority": "critical"},
        {"item": "SCBA", "quantity": 4, "priority": "critical"},  # extra SCBA
    ],
    "hazmat": [
        {"item": "hazmat_suit", "quantity": 4, "priority": "critical"},
        {"item": "decontamination_kit", "quantity": 1, "priority": "critical"},
    ],
}


def _determine_alarm_level(severity: int, num_fire_locations: int, integrity_score: int | None) -> int:
    """Determine NFPA alarm level from aggregate data."""
    alarm = 1
    for level, info in ALARM_THRESHOLDS.items():
        if severity <= info["severity_max"]:
            alarm = level
            break
    else:
        alarm = 5

    # Escalate if multiple fire locations
    if num_fire_locations >= 3:
        alarm = min(5, alarm + 1)

    # Escalate if structural integrity is compromised
    if integrity_score is not None and integrity_score <= 4:
        alarm = min(5, alarm + 1)

    return alarm


def _estimate_containment_time(severity: int, alarm_level: int, num_fire_locations: int) -> int:
    """Estimate time to containment in minutes based on NFPA guidelines."""
    base_time = severity * 3  # rough: 3 minutes per severity point
    if num_fire_locations > 1:
        base_time += num_fire_locations * 2
    # Higher alarm = more resources = slightly faster containment
    resource_factor = max(0.5, 1.0 - (alarm_level - 1) * 0.1)
    return max(5, int(base_time * resource_factor))


def _build_strategy(
    severity: int,
    alarm_level: int,
    fire_locations: list[dict[str, Any]],
    structural_data: dict[str, Any] | None,
    evacuation_data: dict[str, Any] | None,
) -> str:
    """Build tactical strategy string."""
    parts = []

    # Attack mode
    if severity <= 3:
        parts.append("Offensive interior attack")
    elif severity <= 6:
        parts.append("Transitional attack — exterior knockdown then interior advance")
    elif severity <= 8:
        parts.append("Defensive operations — surround and drown")
    else:
        parts.append("Defensive operations — protect exposures, no interior operations")

    # Entry point
    if evacuation_data and evacuation_data.get("firefighter_entries"):
        primary_entry = evacuation_data["firefighter_entries"][0]
        if primary_entry.get("path"):
            parts.append(f"via {primary_entry['path'][0]}")

    # Ventilation
    if severity >= 4:
        parts.append("ventilate roof")

    # Water supply
    parts.append("establish water supply from nearest hydrant")

    # Structural considerations
    if structural_data:
        if structural_data.get("collapse_risk") in ("high", "imminent"):
            parts.append("WARNING: collapse risk — establish collapse zone")
        blocked = structural_data.get("blocked_passages", [])
        if blocked:
            blocked_names = [b["passage"] for b in blocked[:2]]
            parts.append(f"avoid blocked passages: {', '.join(blocked_names)}")

    return ", ".join(parts)


def _build_priority_actions(
    severity: int,
    alarm_level: int,
    fire_locations: list[dict[str, Any]],
    structural_data: dict[str, Any] | None,
) -> list[str]:
    """Build ordered list of priority actions."""
    actions = ["Establish incident command"]

    if severity >= 7:
        actions.append("Request additional alarm — upgrade to mutual aid")

    if structural_data and structural_data.get("collapse_risk") in ("high", "imminent"):
        actions.append("Establish collapse zone — no interior operations")
    elif severity <= 6:
        if fire_locations:
            primary = fire_locations[0].get("label", "primary fire location")
            actions.append(f"Deploy attack line to {primary}")
        actions.append("Conduct primary search and rescue")
    else:
        actions.append("Initiate defensive operations — master streams")

    actions.append("Establish water supply")

    if severity >= 4:
        actions.append("Request ventilation — open roof or positive pressure")

    actions.append("Account for all personnel — PAR check")

    return actions


def recommend_personnel(
    context: dict[str, Any] | None,
    frame_id: str = "unknown",
) -> dict[str, Any]:
    """Personnel Recommendation Team brain.

    Consumes outputs from all other teams to produce deployment recommendations.

    Args:
        context: Dict with keys "fire_severity", "structural", "evacuation" containing
                 other teams' results.
        frame_id: Frame identifier.

    Returns:
        Dict matching personnel_recommendation.json schema.
    """
    fire_data = (context or {}).get("fire_severity", {})
    structural_data = (context or {}).get("structural", {})
    evacuation_data = (context or {}).get("evacuation", {})

    severity = fire_data.get("severity", 5)
    fire_locations = fire_data.get("fire_locations", [])
    integrity_score = structural_data.get("integrity_score")
    num_fires = len(fire_locations)

    alarm_level = _determine_alarm_level(severity, num_fires, integrity_score)
    firefighters = FIREFIGHTERS_BY_ALARM[alarm_level]
    trucks = TRUCKS_BY_ALARM[alarm_level]
    eta = _estimate_containment_time(severity, alarm_level, num_fires)

    # Build equipment list
    equipment = list(BASE_EQUIPMENT)
    # Scale SCBA with firefighter count
    equipment[0] = {"item": "SCBA", "quantity": firefighters, "priority": "critical"}
    # Add scenario-specific equipment
    smoke = fire_data.get("smoke_density", "none")
    if smoke in ("heavy", "zero_visibility"):
        equipment.extend(SCENARIO_EQUIPMENT["heavy_smoke"])
    if structural_data.get("collapse_risk") in ("moderate", "high", "imminent"):
        equipment.extend(SCENARIO_EQUIPMENT["structural_compromise"])

    strategy = _build_strategy(severity, alarm_level, fire_locations, structural_data, evacuation_data)
    priority_actions = _build_priority_actions(severity, alarm_level, fire_locations, structural_data)

    return {
        "firefighters": firefighters,
        "trucks": trucks,
        "equipment": equipment,
        "eta_containment_min": eta,
        "strategy": strategy,
        "alarm_level": alarm_level,
        "staging_location": "100m upwind of building entrance",
        "priority_actions": priority_actions,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
