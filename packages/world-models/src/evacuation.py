from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .fire_sim import _default_building_rooms


def _build_adjacency(rooms_data: list[dict[str, Any]]) -> dict[str, list[str]]:
    """Build adjacency map from rooms data."""
    adj: dict[str, list[str]] = {}
    for r in rooms_data:
        adj[r["name"]] = r.get("adjacent", [])
    return adj


def _compute_room_risk(
    room_name: str,
    fire_data: dict[str, Any] | None,
    structural_data: dict[str, Any] | None,
) -> dict[str, float]:
    """Compute per-room risk scores from fire and structural data."""
    fire_risk = 0.0
    structural_risk = 0.0
    smoke_risk = 0.0

    if fire_data:
        for fl in fire_data.get("fire_locations", []):
            if room_name.lower() in fl.get("label", "").lower():
                fire_risk = max(fire_risk, fl.get("intensity", 0.0))

        smoke = fire_data.get("smoke_density", "none")
        smoke_map = {"none": 0.0, "light": 0.2, "moderate": 0.5, "heavy": 0.8, "zero_visibility": 1.0}
        smoke_risk = smoke_map.get(smoke, 0.0)

    if structural_data:
        for bp in structural_data.get("blocked_passages", []):
            if room_name.lower() in bp.get("passage", "").lower():
                structural_risk = 1.0 if bp.get("severity") == "complete" else 0.6

        collapse = structural_data.get("collapse_risk", "none")
        collapse_map = {"none": 0.0, "low": 0.1, "moderate": 0.3, "high": 0.7, "imminent": 1.0}
        structural_risk = max(structural_risk, collapse_map.get(collapse, 0.0))

    combined = max(fire_risk, structural_risk, smoke_risk)
    return {
        "fire_risk": round(fire_risk, 2),
        "structural_risk": round(structural_risk, 2),
        "smoke_risk": round(smoke_risk, 2),
        "combined_risk": round(combined, 2),
    }


def _find_paths(
    start: str,
    targets: set[str],
    adjacency: dict[str, list[str]],
    risk_scores: dict[str, dict[str, float]],
    max_risk: float = 0.8,
) -> list[list[str]]:
    """BFS pathfinding that avoids high-risk rooms. Returns list of paths."""
    paths: list[list[str]] = []
    visited: set[str] = set()
    queue: list[list[str]] = [[start]]

    while queue:
        path = queue.pop(0)
        current = path[-1]

        if current in targets:
            paths.append(path)
            if len(paths) >= 3:
                break
            continue

        if current in visited:
            continue
        visited.add(current)

        neighbors = adjacency.get(current, [])
        # Sort neighbors by risk (prefer lower risk)
        neighbors_sorted = sorted(
            neighbors,
            key=lambda n: risk_scores.get(n, {}).get("combined_risk", 0.0),
        )

        for neighbor in neighbors_sorted:
            if neighbor not in visited:
                neighbor_risk = risk_scores.get(neighbor, {}).get("combined_risk", 0.0)
                if neighbor_risk <= max_risk or neighbor in targets:
                    queue.append(path + [neighbor])

    return paths


def _classify_route_risk(path: list[str], risk_scores: dict[str, dict[str, float]]) -> str:
    """Classify overall route risk level."""
    max_risk = max(
        risk_scores.get(room, {}).get("combined_risk", 0.0)
        for room in path
    )
    if max_risk < 0.2:
        return "safe"
    elif max_risk < 0.5:
        return "caution"
    elif max_risk < 0.8:
        return "dangerous"
    return "blocked"


def _estimate_traversal_time(path: list[str]) -> int:
    """Estimate traversal time in seconds (rough: 15 seconds per room/waypoint)."""
    return len(path) * 15


def _get_hazards(path: list[str], fire_data: dict[str, Any] | None, structural_data: dict[str, Any] | None) -> list[str]:
    """List hazards along a path."""
    hazards: list[str] = []
    if not fire_data and not structural_data:
        return hazards

    for room in path:
        if fire_data:
            for fl in fire_data.get("fire_locations", []):
                if room.lower() in fl.get("label", "").lower():
                    hazards.append(f"fire in {room} (intensity {fl.get('intensity', 0):.1f})")
            smoke = fire_data.get("smoke_density", "none")
            if smoke in ("heavy", "zero_visibility"):
                hazards.append(f"heavy smoke in {room}")

        if structural_data:
            for bp in structural_data.get("blocked_passages", []):
                if room.lower() in bp.get("passage", "").lower():
                    hazards.append(f"{bp['reason']} blocking {bp['passage']}")

    return list(dict.fromkeys(hazards))  # dedupe preserving order


def compute_evacuation_routes(
    fire_data: dict[str, Any] | None,
    structural_data: dict[str, Any] | None,
    frame_id: str = "unknown",
    building_layout: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Evacuation Route Team brain.

    Synthesizes fire severity + structural data + floor layout to compute safest paths.
    Demonstrates cross-team orchestration: this team NEEDS the other teams' data.

    Args:
        fire_data: Fire severity team output
        structural_data: Structural analysis team output
        frame_id: Frame identifier
        building_layout: Optional building layout override

    Returns:
        Dict matching evacuation_routes.json schema
    """
    rooms_data = (building_layout or {}).get("rooms", _default_building_rooms())
    adjacency = _build_adjacency(rooms_data)

    # Compute per-room risk scores
    risk_scores: dict[str, dict[str, float]] = {}
    for r in rooms_data:
        risk_scores[r["name"]] = _compute_room_risk(r["name"], fire_data, structural_data)

    # Find exterior rooms (exits)
    exits = {r["name"] for r in rooms_data if r.get("is_exterior", False)}
    if not exits:
        exits = {"Lobby"}

    # Find fire source rooms (firefighter targets)
    fire_rooms: set[str] = set()
    if fire_data:
        for fl in fire_data.get("fire_locations", []):
            label = fl.get("label", "")
            for r in rooms_data:
                if r["name"].lower() in label.lower() or label.lower() in r["name"].lower():
                    fire_rooms.add(r["name"])
    if not fire_rooms:
        fire_rooms = {"Room 201"}  # default for demo

    # --- Civilian exit routes ---
    # Start from interior rooms, find paths to exits
    civilian_routes: list[dict[str, Any]] = []
    interior_rooms = [r["name"] for r in rooms_data if not r.get("is_exterior", False)]
    # Pick a representative starting room (deepest interior)
    start_rooms = [r for r in interior_rooms if r not in exits]
    if not start_rooms:
        start_rooms = interior_rooms[:1]

    for start in start_rooms[:3]:
        paths = _find_paths(start, exits, adjacency, risk_scores, max_risk=0.9)
        for i, path in enumerate(paths[:2]):
            civilian_routes.append({
                "route_id": f"civ_{start}_{i}",
                "path": path,
                "risk_level": _classify_route_risk(path, risk_scores),
                "estimated_time_seconds": _estimate_traversal_time(path),
                "hazards": _get_hazards(path, fire_data, structural_data),
                "recommended": i == 0,
            })

    # --- Firefighter entry routes ---
    ff_routes: list[dict[str, Any]] = []
    for target in list(fire_rooms)[:2]:
        paths = _find_paths("Lobby", {target}, adjacency, risk_scores, max_risk=1.0)
        for i, path in enumerate(paths[:2]):
            equipment: list[str] = ["SCBA", "thermal_imaging_camera"]
            route_risk = _classify_route_risk(path, risk_scores)
            if route_risk in ("dangerous", "blocked"):
                equipment.append("halligan_tool")

            ff_routes.append({
                "route_id": f"ff_{target}_{i}",
                "path": path,
                "risk_level": route_risk,
                "objective": f"Fire source in {target}",
                "equipment_needed": equipment,
                "recommended": i == 0,
            })

    return {
        "civilian_exits": civilian_routes,
        "firefighter_entries": ff_routes,
        "risk_scores": risk_scores,
        "frame_id": frame_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
