from __future__ import annotations

from typing import Any

# Siebel Center for Computer Science — Building #0563, UIUC
# Layout derived from official Facilities & Services floor plans (31 MAR 2014).
# L-shaped building: west wing (N-S) meets south/east wing (E-W) that angles NE.

SIEBEL_FLOORS = 4
SIEBEL_ADDRESS = "201 N Goodwin Ave, Urbana, IL 61801"
SIEBEL_COORDS = (40.1138, -88.2249)

_FUEL_BY_TYPE: dict[str, str] = {
    "corridor": "low",
    "stairwell": "low",
    "elevator": "low",
    "exit": "low",
    "lobby": "low",
    "office": "medium",
    "lecture_hall": "high",
    "auditorium": "high",
    "lab": "medium",
}


def siebel_center_rooms() -> list[dict[str, Any]]:
    """Full Siebel Center room graph across floors 1-4.

    Each room dict has: name, adjacent, has_stairwell, is_exterior,
    floor, room_type, fuel_level.

    Corridor spine per floor: C{f}100 → C{f}200 → C{f}300 → C{f}400 → C{f}500
    Two stairwells per floor: Stairwell_NW_{f} (northwest), Stairwell_C_{f} (central)
    Three exterior exits on floor 1: Lobby (south), West_Exit, East_Exit
    """
    rooms: list[dict[str, Any]] = []

    def add(name: str, adjacent: list[str], **kw: Any) -> None:
        rooms.append({
            "name": name,
            "adjacent": adjacent,
            "has_stairwell": kw.get("has_stairwell", False),
            "is_exterior": kw.get("is_exterior", False),
            "floor": kw.get("floor", 1),
            "room_type": kw.get("room_type", "office"),
            "fuel_level": _FUEL_BY_TYPE.get(kw.get("room_type", "office"), "low"),
        })

    for f in range(1, SIEBEL_FLOORS + 1):
        ground = f == 1

        # ── West Wing (N-S corridor with offices on both sides) ──

        add(f"C{f}100", [
            f"Stairwell_NW_{f}", f"{f}111", f"{f}113",
            f"{f}109", f"{f}104", f"C{f}200",
        ], floor=f, room_type="corridor")

        add(f"{f}111", [f"C{f}100"], floor=f, room_type="office")
        add(f"{f}113", [f"C{f}100"], floor=f, room_type="office")
        add(f"{f}109", [f"C{f}100"], floor=f, room_type="office")
        add(f"{f}104", [f"C{f}100"], floor=f, room_type="office")

        # NW stairwell — connects to adjacent floors
        nw_adj: list[str] = [f"C{f}100", f"{f}124"]
        if f > 1:
            nw_adj.append(f"Stairwell_NW_{f - 1}")
        if f < SIEBEL_FLOORS:
            nw_adj.append(f"Stairwell_NW_{f + 1}")
        add(f"Stairwell_NW_{f}", nw_adj,
            floor=f, has_stairwell=True, is_exterior=ground, room_type="stairwell")

        add(f"{f}124", [f"Stairwell_NW_{f}"], floor=f, room_type="office")

        # ── South Wing (E-W corridor with offices) ──

        c200_adj = [
            f"C{f}100", f"{f}210", f"{f}214",
            f"{f}225", f"Elevator_{f}", f"C{f}300",
        ]
        if ground:
            c200_adj.append("West_Exit")
        add(f"C{f}200", c200_adj, floor=f, room_type="corridor")

        add(f"{f}210", [f"C{f}200"], floor=f, room_type="office")
        add(f"{f}214", [f"C{f}200"], floor=f, room_type="office")
        add(f"{f}225", [f"C{f}200"], floor=f, room_type="office")
        add(f"Elevator_{f}", [f"C{f}200"], floor=f, room_type="elevator")

        # ── Central Section (where the L bends) ──

        c300_adj = [
            f"C{f}200", f"{f}302", f"{f}304",
            f"Stairwell_C_{f}", f"C{f}400",
        ]
        if ground:
            c300_adj.append("Lobby")
        add(f"C{f}300", c300_adj, floor=f, room_type="corridor")

        rt = "lecture_hall" if f == 1 else "office"
        add(f"{f}302", [f"C{f}300"], floor=f, room_type=rt)
        add(f"{f}304", [f"C{f}300"], floor=f, room_type=rt)

        # Central stairwell — connects to adjacent floors
        c_adj: list[str] = [f"C{f}300"]
        if f > 1:
            c_adj.append(f"Stairwell_C_{f - 1}")
        if f < SIEBEL_FLOORS:
            c_adj.append(f"Stairwell_C_{f + 1}")
        add(f"Stairwell_C_{f}", c_adj,
            floor=f, has_stairwell=True, room_type="stairwell")

        # ── East Angled Section ──

        add(f"C{f}400", [
            f"C{f}300", f"{f}403", f"{f}405", f"C{f}500",
        ], floor=f, room_type="corridor")

        rt_east = "lecture_hall" if f <= 2 else "lab"
        add(f"{f}403", [f"C{f}400"], floor=f, room_type=rt_east)
        add(f"{f}405", [f"C{f}400"], floor=f, room_type=rt_east)

        # ── Far East Wing ──

        c500_adj: list[str] = [f"C{f}400", f"{f}521", f"{f}532"]
        if ground:
            c500_adj.extend(["East_Exit", "1500"])
        add(f"C{f}500", c500_adj, floor=f, room_type="corridor")

        add(f"{f}521", [f"C{f}500"], floor=f, room_type="office")
        add(f"{f}532", [f"C{f}500"], floor=f, room_type="office")

    # ── Ground-floor-only nodes ──

    add("Lobby", ["C1300"], floor=1, is_exterior=True, room_type="lobby")
    add("West_Exit", ["C1200"], floor=1, is_exterior=True, room_type="exit")
    add("East_Exit", ["C1500"], floor=1, is_exterior=True, room_type="exit")
    add("1500", ["C1500"], floor=1, room_type="auditorium")

    # ── Ensure bidirectional adjacency ──

    name_set = {r["name"] for r in rooms}
    adj_map: dict[str, set[str]] = {r["name"]: set(r["adjacent"]) for r in rooms}
    for room in rooms:
        for adj in room["adjacent"]:
            if adj in name_set:
                adj_map[adj].add(room["name"])
    for room in rooms:
        room["adjacent"] = sorted(adj_map[room["name"]])

    return rooms


def generate_building_layout(seed: int = 0, size: int = 20) -> dict[str, Any]:
    """Generate the Siebel Center building layout.

    Returns room-based graph used by fire_sim, evacuation, and routing,
    plus building metadata.
    """
    rooms = siebel_center_rooms()
    return {
        "rooms": rooms,
        "building_name": "Siebel Center for Computer Science",
        "address": SIEBEL_ADDRESS,
        "coordinates": SIEBEL_COORDS,
        "floors": SIEBEL_FLOORS,
        "total_rooms": len(rooms),
        "seed": seed,
        "size": size,
    }
