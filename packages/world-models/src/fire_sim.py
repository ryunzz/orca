from __future__ import annotations

from dataclasses import dataclass


@dataclass
class FireState:
    intensity: float


def advance_fire(grid: list[list[float]], steps: int = 1) -> list[list[float]]:
    out = [row[:] for row in grid]
    for _ in range(steps):
        out = [[min(1.0, cell + 0.05) for cell in row] for row in out]
    return out
