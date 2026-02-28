from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class FireState:
    intensity: float


# --- Tunable constants (based on NFPA fire behavior guidelines) ---

BASE_SPREAD_RATE = 0.05          # intensity increase per minute in same room
DOOR_ADJACENCY_FACTOR = 0.7     # how much fire spreads through open doorways
FUEL_ACCELERATION = {
    "low": 1.0,
    "medium": 1.5,
    "high": 2.5,
}
VERTICAL_SPREAD_MULTIPLIER = 1.8  # stairwells accelerate vertical spread
SMOKE_SPREAD_RATE = 2.0          # smoke moves faster than fire (rooms/min)
FLASHOVER_THRESHOLD = 0.8        # intensity above which flashover risk exists


@dataclass
class Room:
    name: str
    fire_intensity: float = 0.0
    has_door_to: list[str] = field(default_factory=list)
    has_stairwell: bool = False
    fuel_level: str = "low"  # "low", "medium", "high"
    is_exterior: bool = False


@dataclass
class SpreadPrediction:
    room_name: str
    current_intensity: float
    predicted_intensity_5min: float
    predicted_intensity_10min: float
    time_to_danger_min: int | None  # minutes until intensity > 0.6
    time_to_flashover_min: int | None  # minutes until intensity > 0.8
    risk_factors: list[str]


def advance_fire(grid: list[list[float]], steps: int = 1) -> list[list[float]]:
    """Original grid-based fire spread (kept for backwards compatibility)."""
    out = [row[:] for row in grid]
    for _ in range(steps):
        out = [[min(1.0, cell + BASE_SPREAD_RATE) for cell in row] for row in out]
    return out


def compute_room_spread_rate(room: Room, adjacent_rooms: list[Room]) -> float:
    """Compute fire spread rate for a room based on fuel, adjacency, and geometry."""
    base = BASE_SPREAD_RATE
    fuel_mult = FUEL_ACCELERATION.get(room.fuel_level, 1.0)
    rate = base * fuel_mult

    # Adjacent fire contribution
    for adj in adjacent_rooms:
        if adj.fire_intensity > 0.3:
            contribution = adj.fire_intensity * DOOR_ADJACENCY_FACTOR * base
            if room.has_stairwell or adj.has_stairwell:
                contribution *= VERTICAL_SPREAD_MULTIPLIER
            rate += contribution

    return rate


def predict_fire_spread(
    rooms: list[Room],
    time_steps_min: int = 10,
) -> list[SpreadPrediction]:
    """Predict fire spread across rooms over time. Returns per-room predictions.

    This is deterministic and rule-based:
    - Fire grows at BASE_SPREAD_RATE * fuel_multiplier per minute
    - Fire spreads through doorways at DOOR_ADJACENCY_FACTOR rate
    - Stairwells multiply vertical spread by VERTICAL_SPREAD_MULTIPLIER
    - High fuel loads (furniture, paper) accelerate spread
    """
    room_map = {r.name: r for r in rooms}
    predictions: list[SpreadPrediction] = []

    for room in rooms:
        adjacent = [room_map[adj_name] for adj_name in room.has_door_to if adj_name in room_map]

        intensities = [room.fire_intensity]
        current = room.fire_intensity

        for _ in range(time_steps_min):
            rate = compute_room_spread_rate(
                Room(
                    name=room.name,
                    fire_intensity=current,
                    has_door_to=room.has_door_to,
                    has_stairwell=room.has_stairwell,
                    fuel_level=room.fuel_level,
                    is_exterior=room.is_exterior,
                ),
                adjacent,
            )
            current = min(1.0, current + rate)
            intensities.append(current)

        time_to_danger = None
        time_to_flashover = None
        for t, intensity in enumerate(intensities):
            if time_to_danger is None and intensity > 0.6:
                time_to_danger = t
            if time_to_flashover is None and intensity > FLASHOVER_THRESHOLD:
                time_to_flashover = t

        risk_factors = []
        if room.fuel_level == "high":
            risk_factors.append("high fuel load accelerates spread")
        if room.has_stairwell:
            risk_factors.append("stairwell enables vertical spread")
        if any(adj.fire_intensity > 0.5 for adj in adjacent):
            risk_factors.append("adjacent room has active fire")
        if room.fire_intensity > FLASHOVER_THRESHOLD:
            risk_factors.append("flashover risk — room fully involved")

        predictions.append(SpreadPrediction(
            room_name=room.name,
            current_intensity=room.fire_intensity,
            predicted_intensity_5min=intensities[min(5, len(intensities) - 1)],
            predicted_intensity_10min=intensities[min(10, len(intensities) - 1)],
            time_to_danger_min=time_to_danger,
            time_to_flashover_min=time_to_flashover,
            risk_factors=risk_factors,
        ))

    return predictions


def build_spread_timeline(
    fire_severity_data: dict[str, Any],
    building_layout: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Convert fire severity analysis + building layout into spread timeline predictions.

    This bridges vision model output (fire_severity schema) into the rule-based spread model.

    Args:
        fire_severity_data: Output from analyze_fire_severity() matching fire_severity.json schema
        building_layout: Optional building layout with room connectivity. If None, uses default layout.

    Returns:
        List of per-room spread predictions as dicts for JSON serialization.
    """
    severity = fire_severity_data.get("severity", 0)
    fire_locations = fire_severity_data.get("fire_locations", [])
    fuel_sources = fire_severity_data.get("fuel_sources", [])

    # Build default rooms if no layout provided
    if building_layout and "rooms" in building_layout:
        rooms_data = building_layout["rooms"]
    else:
        rooms_data = _default_building_rooms()

    rooms: list[Room] = []
    for rd in rooms_data:
        # Determine fuel level from detected fuel sources near this room
        room_fuel = "low"
        for fs in fuel_sources:
            loc = fs.get("location_label", "").lower()
            if rd["name"].lower() in loc or loc in rd["name"].lower():
                room_fuel = fs.get("flammability", "medium")
                break

        # Determine fire intensity from detected fire locations
        room_intensity = 0.0
        for fl in fire_locations:
            label = fl.get("label", "").lower()
            if rd["name"].lower() in label or label in rd["name"].lower():
                room_intensity = max(room_intensity, fl.get("intensity", 0.0))

        # If no specific match but overall severity is high, distribute some intensity
        if room_intensity == 0.0 and severity >= 5:
            room_intensity = severity / 20.0  # ambient heat

        rooms.append(Room(
            name=rd["name"],
            fire_intensity=room_intensity,
            has_door_to=rd.get("adjacent", []),
            has_stairwell=rd.get("has_stairwell", False),
            fuel_level=room_fuel,
            is_exterior=rd.get("is_exterior", False),
        ))

    predictions = predict_fire_spread(rooms)
    return [
        {
            "room": p.room_name,
            "current_intensity": round(p.current_intensity, 3),
            "intensity_5min": round(p.predicted_intensity_5min, 3),
            "intensity_10min": round(p.predicted_intensity_10min, 3),
            "time_to_danger_min": p.time_to_danger_min,
            "time_to_flashover_min": p.time_to_flashover_min,
            "risk_factors": p.risk_factors,
        }
        for p in predictions
    ]


def _default_building_rooms() -> list[dict[str, Any]]:
    """Default Siebel Center-like building layout for demo."""
    return [
        {"name": "Lobby", "adjacent": ["Hallway A", "Stairwell A"], "has_stairwell": False, "is_exterior": True},
        {"name": "Hallway A", "adjacent": ["Lobby", "Room 101", "Room 102", "Hallway B"], "has_stairwell": False},
        {"name": "Room 101", "adjacent": ["Hallway A"], "has_stairwell": False},
        {"name": "Room 102", "adjacent": ["Hallway A"], "has_stairwell": False},
        {"name": "Hallway B", "adjacent": ["Hallway A", "Room 201", "Room 202", "Stairwell A"], "has_stairwell": False},
        {"name": "Room 201", "adjacent": ["Hallway B"], "has_stairwell": False},
        {"name": "Room 202", "adjacent": ["Hallway B"], "has_stairwell": False},
        {"name": "Stairwell A", "adjacent": ["Lobby", "Hallway B", "Floor 2 Landing"], "has_stairwell": True},
        {"name": "Floor 2 Landing", "adjacent": ["Stairwell A", "Hallway C"], "has_stairwell": True},
        {"name": "Hallway C", "adjacent": ["Floor 2 Landing", "Room 301", "Room 302"], "has_stairwell": False},
        {"name": "Room 301", "adjacent": ["Hallway C"], "has_stairwell": False},
        {"name": "Room 302", "adjacent": ["Hallway C"], "has_stairwell": False},
    ]
