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
    """Siebel Center for Computer Science — real floor plan layout.

    L-shaped building, floors 1-4. Corridor spine per floor:
    C{f}100 (west) → C{f}200 (south) → C{f}300 (central) → C{f}400 (angled) → C{f}500 (east)
    Two stairwells per floor connecting vertically.
    Three exterior exits on floor 1: Lobby, West_Exit, East_Exit.
    """
    rooms: list[dict[str, Any]] = []
    floors = 4

    def add(name: str, adjacent: list[str], **kw: Any) -> None:
        rooms.append({
            "name": name,
            "adjacent": adjacent,
            "has_stairwell": kw.get("has_stairwell", False),
            "is_exterior": kw.get("is_exterior", False),
        })

    for f in range(1, floors + 1):
        ground = f == 1

        # West wing
        add(f"C{f}100", [
            f"Stairwell_NW_{f}", f"{f}111", f"{f}113",
            f"{f}109", f"{f}104", f"C{f}200",
        ])
        add(f"{f}111", [f"C{f}100"])
        add(f"{f}113", [f"C{f}100"])
        add(f"{f}109", [f"C{f}100"])
        add(f"{f}104", [f"C{f}100"])

        nw_adj: list[str] = [f"C{f}100", f"{f}124"]
        if f > 1:
            nw_adj.append(f"Stairwell_NW_{f - 1}")
        if f < floors:
            nw_adj.append(f"Stairwell_NW_{f + 1}")
        add(f"Stairwell_NW_{f}", nw_adj, has_stairwell=True, is_exterior=ground)
        add(f"{f}124", [f"Stairwell_NW_{f}"])

        # South wing
        c200_adj = [
            f"C{f}100", f"{f}210", f"{f}214",
            f"{f}225", f"Elevator_{f}", f"C{f}300",
        ]
        if ground:
            c200_adj.append("West_Exit")
        add(f"C{f}200", c200_adj)
        add(f"{f}210", [f"C{f}200"])
        add(f"{f}214", [f"C{f}200"])
        add(f"{f}225", [f"C{f}200"])
        add(f"Elevator_{f}", [f"C{f}200"])

        # Central section
        c300_adj = [
            f"C{f}200", f"{f}302", f"{f}304",
            f"Stairwell_C_{f}", f"C{f}400",
        ]
        if ground:
            c300_adj.append("Lobby")
        add(f"C{f}300", c300_adj)
        add(f"{f}302", [f"C{f}300"])
        add(f"{f}304", [f"C{f}300"])

        c_adj: list[str] = [f"C{f}300"]
        if f > 1:
            c_adj.append(f"Stairwell_C_{f - 1}")
        if f < floors:
            c_adj.append(f"Stairwell_C_{f + 1}")
        add(f"Stairwell_C_{f}", c_adj, has_stairwell=True)

        # East angled section
        add(f"C{f}400", [f"C{f}300", f"{f}403", f"{f}405", f"C{f}500"])
        add(f"{f}403", [f"C{f}400"])
        add(f"{f}405", [f"C{f}400"])

        # Far east wing
        c500_adj: list[str] = [f"C{f}400", f"{f}521", f"{f}532"]
        if ground:
            c500_adj.extend(["East_Exit", "1500"])
        add(f"C{f}500", c500_adj)
        add(f"{f}521", [f"C{f}500"])
        add(f"{f}532", [f"C{f}500"])

    # Ground-floor exits and landmarks
    add("Lobby", ["C1300"], is_exterior=True)
    add("West_Exit", ["C1200"], is_exterior=True)
    add("East_Exit", ["C1500"], is_exterior=True)
    add("1500", ["C1500"])

    # Ensure bidirectional adjacency
    name_set = {r["name"] for r in rooms}
    adj_map: dict[str, set[str]] = {r["name"]: set(r["adjacent"]) for r in rooms}
    for room in rooms:
        for adj in room["adjacent"]:
            if adj in name_set:
                adj_map[adj].add(room["name"])
    for room in rooms:
        room["adjacent"] = sorted(adj_map[room["name"]])

    return rooms
