from __future__ import annotations

from math import atan2, cos, radians, sin, sqrt
from typing import Any


def _haversine_meters(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1 = radians(a[0]), radians(a[1])
    lat2, lon2 = radians(b[0]), radians(b[1])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    h = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 2 * 6_371_000 * atan2(sqrt(h), sqrt(1 - h))


async def optimize_vehicle_route(origin: dict[str, float], destination: dict[str, float], vehicle_type: str) -> dict[str, Any]:
    if not origin or not destination:
        return {}
    estimated_seconds = int(_haversine_meters((origin["lat"], origin["lng"]), (destination["lat"], destination["lng"])) / 20)
    if vehicle_type == "fire_truck":
        estimated_seconds = int(estimated_seconds * 1.2)
    elif vehicle_type == "police":
        estimated_seconds = int(estimated_seconds * 1.1)

    return {
        "origin": origin,
        "destination": destination,
        "vehicle_type": vehicle_type,
        "optimal_route": {
            "coordinates": [origin, destination],
        },
        "estimated_time_seconds": estimated_seconds,
    }
