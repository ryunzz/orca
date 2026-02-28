from __future__ import annotations

import math
from typing import Any

import networkx as nx

from .graph import build_graph, build_building_graph, apply_fire_data, apply_structural_data


class RouteSolver:
    def estimate_cost(self, origin: tuple[float, float], destination: tuple[float, float], vehicle_type: str) -> int:
        """Estimate vehicle travel cost between two geographic points."""
        try:
            straight = math.dist(origin, destination)
            return int(straight * 120)
        except Exception:
            return 9999

    def solve(self, origin: str, destination: str) -> nx.DiGraph | None:
        """Find path on the basic stub graph."""
        graph = build_graph()
        if graph.has_node(origin) and graph.has_node(destination):
            return graph
        return None

    def solve_fire_aware(
        self,
        origin: str,
        destination: str,
        fire_data: dict[str, Any] | None = None,
        structural_data: dict[str, Any] | None = None,
        rooms: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """Find the safest path between two rooms, accounting for fire and structural hazards.

        Uses Dijkstra's algorithm on a weighted graph where edge weights reflect danger.

        Args:
            origin: Starting room name
            destination: Target room name
            fire_data: Fire severity team output
            structural_data: Structural analysis team output
            rooms: Building room layout (optional, defaults to Siebel Center)

        Returns:
            Dict with path, total_cost, risk_level, and per-room risks.
        """
        graph = build_building_graph(rooms)

        if fire_data:
            graph = apply_fire_data(graph, fire_data)
        if structural_data:
            graph = apply_structural_data(graph, structural_data)

        if origin not in graph.nodes or destination not in graph.nodes:
            return {
                "path": [],
                "total_cost": float("inf"),
                "risk_level": "blocked",
                "room_risks": {},
                "error": f"Unknown room: {origin if origin not in graph.nodes else destination}",
            }

        try:
            path = nx.dijkstra_path(graph, origin, destination, weight="weight")
            cost = nx.dijkstra_path_length(graph, origin, destination, weight="weight")
        except nx.NetworkXNoPath:
            return {
                "path": [],
                "total_cost": float("inf"),
                "risk_level": "blocked",
                "room_risks": {},
            }

        # Compute per-room risk
        room_risks = {}
        max_risk = 0.0
        for room in path:
            node = graph.nodes[room]
            fire = node.get("fire_intensity", 0.0)
            structural = node.get("structural_risk", 0.0)
            smoke = node.get("smoke_risk", 0.0)
            combined = max(fire, structural, smoke)
            max_risk = max(max_risk, combined)
            room_risks[room] = {
                "fire_risk": round(fire, 2),
                "structural_risk": round(structural, 2),
                "smoke_risk": round(smoke, 2),
                "combined_risk": round(combined, 2),
            }

        if max_risk < 0.2:
            risk_level = "safe"
        elif max_risk < 0.5:
            risk_level = "caution"
        elif max_risk < 0.8:
            risk_level = "dangerous"
        else:
            risk_level = "blocked"

        return {
            "path": path,
            "total_cost": round(cost, 2),
            "risk_level": risk_level,
            "room_risks": room_risks,
        }

    def find_all_exits(
        self,
        start: str,
        fire_data: dict[str, Any] | None = None,
        structural_data: dict[str, Any] | None = None,
        rooms: list[dict[str, Any]] | None = None,
    ) -> list[dict[str, Any]]:
        """Find all paths from a starting room to any exterior exit.

        Returns list of routes sorted by safety (lowest cost first).
        """
        graph = build_building_graph(rooms)

        if fire_data:
            graph = apply_fire_data(graph, fire_data)
        if structural_data:
            graph = apply_structural_data(graph, structural_data)

        exits = [n for n, data in graph.nodes(data=True) if data.get("is_exterior")]
        if not exits:
            return []

        routes = []
        for exit_room in exits:
            result = self.solve_fire_aware(start, exit_room, fire_data, structural_data, rooms)
            if result["path"]:
                result["exit"] = exit_room
                routes.append(result)

        routes.sort(key=lambda r: r["total_cost"])
        return routes
