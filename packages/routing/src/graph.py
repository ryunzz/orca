from __future__ import annotations

from typing import Any

import networkx as nx


def build_graph() -> nx.DiGraph:
    """Original stub graph for backwards compatibility."""
    graph = nx.DiGraph()
    graph.add_weighted_edges_from(
        [
            ("A", "B", 8),
            ("B", "C", 4),
            ("A", "C", 20),
            ("C", "D", 1),
            ("B", "D", 7),
        ]
    )
    return graph


def build_building_graph(rooms: list[dict[str, Any]] | None = None) -> nx.DiGraph:
    """Build a graph representing building rooms and their connections.

    Each node is a room with attributes (fire_intensity, structural_risk, etc.).
    Each edge has a weight representing traversal cost (higher = more dangerous).

    Args:
        rooms: List of room dicts with keys: name, adjacent, fire_intensity,
               structural_risk, smoke_risk. If None, uses default Siebel layout.
    """
    if rooms is None:
        rooms = _default_rooms()

    graph = nx.DiGraph()

    for room in rooms:
        graph.add_node(
            room["name"],
            fire_intensity=room.get("fire_intensity", 0.0),
            structural_risk=room.get("structural_risk", 0.0),
            smoke_risk=room.get("smoke_risk", 0.0),
            is_exterior=room.get("is_exterior", False),
            has_stairwell=room.get("has_stairwell", False),
        )

    for room in rooms:
        for adj_name in room.get("adjacent", []):
            if any(r["name"] == adj_name for r in rooms):
                # Edge weight = danger of destination room
                dest = next(r for r in rooms if r["name"] == adj_name)
                fire = dest.get("fire_intensity", 0.0)
                structural = dest.get("structural_risk", 0.0)
                smoke = dest.get("smoke_risk", 0.0)
                # Combined danger weight: higher = more dangerous
                weight = 1.0 + (fire * 10) + (structural * 5) + (smoke * 3)
                graph.add_edge(room["name"], adj_name, weight=weight)

    return graph


def apply_fire_data(graph: nx.DiGraph, fire_data: dict[str, Any]) -> nx.DiGraph:
    """Update graph node attributes and edge weights with live fire analysis data."""
    for fl in fire_data.get("fire_locations", []):
        label = fl.get("label", "")
        intensity = fl.get("intensity", 0.0)
        for node in graph.nodes:
            if node.lower() in label.lower() or label.lower() in node.lower():
                graph.nodes[node]["fire_intensity"] = max(
                    graph.nodes[node].get("fire_intensity", 0.0), intensity,
                )

    # Recalculate edge weights
    for u, v in graph.edges:
        fire = graph.nodes[v].get("fire_intensity", 0.0)
        structural = graph.nodes[v].get("structural_risk", 0.0)
        smoke = graph.nodes[v].get("smoke_risk", 0.0)
        graph.edges[u, v]["weight"] = 1.0 + (fire * 10) + (structural * 5) + (smoke * 3)

    return graph


def apply_structural_data(graph: nx.DiGraph, structural_data: dict[str, Any]) -> nx.DiGraph:
    """Update graph with structural analysis data (blocked passages, collapse risk)."""
    for bp in structural_data.get("blocked_passages", []):
        passage = bp.get("passage", "")
        severity = bp.get("severity", "partial")
        for node in graph.nodes:
            if node.lower() in passage.lower():
                if severity == "complete":
                    graph.nodes[node]["structural_risk"] = 1.0
                else:
                    graph.nodes[node]["structural_risk"] = max(
                        graph.nodes[node].get("structural_risk", 0.0), 0.6,
                    )

    # Apply collapse risk globally
    collapse = structural_data.get("collapse_risk", "none")
    collapse_map = {"none": 0.0, "low": 0.1, "moderate": 0.3, "high": 0.7, "imminent": 1.0}
    global_risk = collapse_map.get(collapse, 0.0)
    for node in graph.nodes:
        graph.nodes[node]["structural_risk"] = max(
            graph.nodes[node].get("structural_risk", 0.0), global_risk,
        )

    # Recalculate edge weights
    for u, v in graph.edges:
        fire = graph.nodes[v].get("fire_intensity", 0.0)
        structural = graph.nodes[v].get("structural_risk", 0.0)
        smoke = graph.nodes[v].get("smoke_risk", 0.0)
        graph.edges[u, v]["weight"] = 1.0 + (fire * 10) + (structural * 5) + (smoke * 3)

    return graph


def _default_rooms() -> list[dict[str, Any]]:
    """Default Siebel Center building layout."""
    return [
        {"name": "Lobby", "adjacent": ["Hallway A", "Stairwell A"], "is_exterior": True},
        {"name": "Hallway A", "adjacent": ["Lobby", "Room 101", "Room 102", "Hallway B"]},
        {"name": "Room 101", "adjacent": ["Hallway A"]},
        {"name": "Room 102", "adjacent": ["Hallway A"]},
        {"name": "Hallway B", "adjacent": ["Hallway A", "Room 201", "Room 202", "Stairwell A"]},
        {"name": "Room 201", "adjacent": ["Hallway B"]},
        {"name": "Room 202", "adjacent": ["Hallway B"]},
        {"name": "Stairwell A", "adjacent": ["Lobby", "Hallway B", "Floor 2 Landing"], "has_stairwell": True},
        {"name": "Floor 2 Landing", "adjacent": ["Stairwell A", "Hallway C"], "has_stairwell": True},
        {"name": "Hallway C", "adjacent": ["Floor 2 Landing", "Room 301", "Room 302"]},
        {"name": "Room 301", "adjacent": ["Hallway C"]},
        {"name": "Room 302", "adjacent": ["Hallway C"]},
    ]
