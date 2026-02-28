from __future__ import annotations

from .building_gen import generate_building_layout


def build_environment(config: dict) -> dict:
    seed = int(config.get("seed", 0))
    layout = generate_building_layout(seed=seed, size=int(config.get("size", 20)))
    return {
        "building": layout,
        "environment_type": config.get("environment_type", "burning_building"),
    }
