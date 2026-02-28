from __future__ import annotations

from .environment import build_environment


def run_inference(config: dict) -> dict:
    return build_environment(config)
