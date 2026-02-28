from __future__ import annotations

import numpy as np


def generate_building_layout(seed: int = 0, size: int = 20) -> dict:
    rng = np.random.default_rng(seed)
    occupancy = rng.integers(0, 2, size=(size, size)).tolist()
    return {"occupancy": occupancy, "seed": seed, "size": size}
