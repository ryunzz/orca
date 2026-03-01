"""Observability metrics for fire scene analysis.

Computes three real-time metrics in parallel with agent analysis:
1. Optimized Path — safest firefighter route via Dijkstra
2. Survivability Window — minutes until the optimal path becomes impassable
3. Cumulative Heat Exposure — integrated fire intensity along the path
"""
from __future__ import annotations

import importlib.util as _ilu
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Module loaders for packages outside the API's src/ tree
# ---------------------------------------------------------------------------

_here = Path(__file__).resolve()
_repo_root = _here
while _repo_root != _repo_root.parent:
    if (_repo_root / "packages").is_dir():
        break
    _repo_root = _repo_root.parent

_wm_src = _repo_root / "packages" / "world-models" / "src"
_routing_src = _repo_root / "packages" / "routing" / "src"


def _load_module(name: str, src_dir: Path):
    """Load a Python module from an arbitrary directory by name."""
    cache_key = f"_metrics_{name}"
    if cache_key in sys.modules:
        return sys.modules[cache_key]
    spec = _ilu.spec_from_file_location(
        cache_key,
        src_dir / f"{name}.py",
        submodule_search_locations=[str(src_dir)],
    )
    mod = _ilu.module_from_spec(spec)  # type: ignore[arg-type]
    sys.modules[cache_key] = mod
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------

@dataclass
class OptimizedPath:
    path: list[str]
    total_cost: float
    risk_level: str  # safe | caution | dangerous | blocked
    room_count: int
    room_risks: dict[str, dict[str, float]] = field(default_factory=dict)


@dataclass
class SurvivabilityWindow:
    minutes_remaining: int | None  # None = path stays viable beyond sim horizon
    viable: bool
    worst_room: str | None
    worst_room_intensity: float


@dataclass
class CumulativeHeatExposure:
    total_score: float
    classification: str  # minimal | moderate | severe | lethal
    per_room: dict[str, float] = field(default_factory=dict)


@dataclass
class MetricsSnapshot:
    optimized_path: OptimizedPath
    survivability: SurvivabilityWindow
    heat_exposure: CumulativeHeatExposure

    def to_dict(self) -> dict[str, Any]:
        return {
            "optimized_path": asdict(self.optimized_path),
            "survivability": asdict(self.survivability),
            "heat_exposure": asdict(self.heat_exposure),
        }


# ---------------------------------------------------------------------------
# Danger threshold — room is impassable above this fire intensity
# ---------------------------------------------------------------------------

DANGER_THRESHOLD = 0.6
SIM_HORIZON_MIN = 30  # max minutes to simulate forward


# ---------------------------------------------------------------------------
# Core compute functions
# ---------------------------------------------------------------------------

def compute_optimized_path(
    origin: str,
    destination: str,
    fire_data: dict[str, Any] | None = None,
    structural_data: dict[str, Any] | None = None,
    rooms: list[dict[str, Any]] | None = None,
) -> OptimizedPath:
    """Compute the safest route between two rooms using Dijkstra with fire-weighted edges."""
    _optimizer = _load_module("optimizer", _routing_src)
    solver = _optimizer.RouteSolver()
    result = solver.solve_fire_aware(origin, destination, fire_data, structural_data, rooms)

    path = result.get("path", [])
    return OptimizedPath(
        path=path,
        total_cost=result.get("total_cost", float("inf")),
        risk_level=result.get("risk_level", "blocked"),
        room_count=len(path),
        room_risks=result.get("room_risks", {}),
    )


def compute_survivability_window(
    path: list[str],
    fire_data: dict[str, Any],
    rooms_data: list[dict[str, Any]] | None = None,
) -> SurvivabilityWindow:
    """Determine how many minutes until the worst room on the path exceeds the danger threshold.

    Walks the fire spread simulation forward minute-by-minute and checks every room on the path.
    """
    if not path:
        return SurvivabilityWindow(
            minutes_remaining=0,
            viable=False,
            worst_room=None,
            worst_room_intensity=0.0,
        )

    _fire_sim = _load_module("fire_sim", _wm_src)
    _building_gen = _load_module("building_gen", _wm_src)

    if rooms_data is None:
        rooms_data = _building_gen.siebel_center_rooms()

    # Build Room objects matching fire_sim expectations
    fire_locations = fire_data.get("fire_locations", [])
    fuel_sources = fire_data.get("fuel_sources", [])
    severity = fire_data.get("severity", 0)

    rooms: list = []
    for rd in rooms_data:
        # Match fuel level from fire_data fuel_sources
        room_fuel = "low"
        for fs in fuel_sources:
            loc = fs.get("location_label", "").lower()
            if rd["name"].lower() in loc or loc in rd["name"].lower():
                room_fuel = fs.get("flammability", "medium")
                break

        # Match fire intensity from fire_data fire_locations
        room_intensity = 0.0
        for fl in fire_locations:
            label = fl.get("label", "").lower()
            if rd["name"].lower() in label or label in rd["name"].lower():
                room_intensity = max(room_intensity, fl.get("intensity", 0.0))

        if room_intensity == 0.0 and severity >= 5:
            room_intensity = severity / 20.0

        rooms.append(_fire_sim.Room(
            name=rd["name"],
            fire_intensity=room_intensity,
            has_door_to=rd.get("adjacent", []),
            has_stairwell=rd.get("has_stairwell", False),
            fuel_level=room_fuel,
            is_exterior=rd.get("is_exterior", False),
        ))

    path_set = set(path)
    predictions = _fire_sim.predict_fire_spread(rooms, time_steps_min=SIM_HORIZON_MIN)

    # Find the worst room on the path by time-to-danger
    worst_room: str | None = None
    worst_intensity = 0.0
    earliest_danger: int | None = None

    for pred in predictions:
        if pred.room_name not in path_set:
            continue
        if pred.time_to_danger_min is not None:
            if earliest_danger is None or pred.time_to_danger_min < earliest_danger:
                earliest_danger = pred.time_to_danger_min
                worst_room = pred.room_name
                worst_intensity = pred.current_intensity
        if pred.current_intensity > worst_intensity and worst_room is None:
            worst_intensity = pred.current_intensity
            worst_room = pred.room_name

    viable = earliest_danger is None or earliest_danger > 0
    return SurvivabilityWindow(
        minutes_remaining=earliest_danger,
        viable=viable,
        worst_room=worst_room,
        worst_room_intensity=round(worst_intensity, 3),
    )


def compute_heat_exposure(
    path: list[str],
    fire_data: dict[str, Any],
    structural_data: dict[str, Any] | None = None,
    rooms_data: list[dict[str, Any]] | None = None,
) -> CumulativeHeatExposure:
    """Sum fire intensity + smoke contribution for every room on the path."""
    if not path:
        return CumulativeHeatExposure(
            total_score=0.0,
            classification="minimal",
            per_room={},
        )

    _graph_mod = _load_module("graph", _routing_src)
    _building_gen = _load_module("building_gen", _wm_src)

    if rooms_data is None:
        rooms_data = _building_gen.siebel_center_rooms()

    graph = _graph_mod.build_building_graph(rooms_data)
    if fire_data:
        graph = _graph_mod.apply_fire_data(graph, fire_data)
    if structural_data:
        graph = _graph_mod.apply_structural_data(graph, structural_data)

    total = 0.0
    per_room: dict[str, float] = {}

    for room_name in path:
        if room_name not in graph.nodes:
            continue
        node = graph.nodes[room_name]
        fire_intensity = node.get("fire_intensity", 0.0)
        smoke = node.get("smoke_risk", 0.0)
        exposure = fire_intensity + smoke * 0.3
        per_room[room_name] = round(exposure, 3)
        total += exposure

    total = round(total, 3)

    if total < 0.5:
        classification = "minimal"
    elif total < 2.0:
        classification = "moderate"
    elif total < 5.0:
        classification = "severe"
    else:
        classification = "lethal"

    return CumulativeHeatExposure(
        total_score=total,
        classification=classification,
        per_room=per_room,
    )


# ---------------------------------------------------------------------------
# Orchestrator — computes all three metrics from fire + structural data
# ---------------------------------------------------------------------------

def compute_all_metrics(
    fire_data: dict[str, Any],
    structural_data: dict[str, Any] | None = None,
    origin: str = "Lobby",
    destination: str = "1302",
    rooms: list[dict[str, Any]] | None = None,
) -> MetricsSnapshot:
    """Compute all three observability metrics for a given fire scene.

    Falls back to a reasonable destination if the requested one doesn't exist in the graph.
    """
    _building_gen = _load_module("building_gen", _wm_src)
    if rooms is None:
        rooms = _building_gen.siebel_center_rooms()

    room_names = {r["name"] for r in rooms}

    # Validate origin/destination, fall back to known rooms
    if origin not in room_names:
        origin = "Lobby"
    if destination not in room_names:
        # Pick a room near the fire (first fire location match) or a default
        for fl in fire_data.get("fire_locations", []):
            label = fl.get("label", "")
            for name in room_names:
                if name.lower() in label.lower() or label.lower() in name.lower():
                    destination = name
                    break
            else:
                continue
            break
        else:
            destination = "1302" if "1302" in room_names else next(iter(room_names))

    path_result = compute_optimized_path(origin, destination, fire_data, structural_data, rooms)
    survivability = compute_survivability_window(path_result.path, fire_data, rooms)
    heat_exposure = compute_heat_exposure(path_result.path, fire_data, structural_data, rooms)

    return MetricsSnapshot(
        optimized_path=path_result,
        survivability=survivability,
        heat_exposure=heat_exposure,
    )
