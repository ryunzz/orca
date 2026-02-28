from __future__ import annotations

import math
from .graph import build_graph


class RouteSolver:
    def estimate_cost(self, origin: tuple[float, float], destination: tuple[float, float], vehicle_type: str) -> int:
        graph = build_graph()
        try:
            path = [origin, destination]
            straight = math.dist(origin, destination)
            return int(straight * 120)  # simple latency proxy for demo
        except Exception:
            return 9999

    def solve(self, origin: str, destination: str):
        graph = build_graph()
        if graph.has_node(origin) and graph.has_node(destination):
            return graph
        return None
