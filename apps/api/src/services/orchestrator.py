from __future__ import annotations

import uuid
from dataclasses import dataclass


@dataclass
class Orchestrator:
    def __init__(self) -> None:
        self.active_nodes = []

    def spawn_node(self, node_type: str, wallet_address: str | None = None, compute_specs: dict | None = None) -> dict:
        node = {
            "id": str(uuid.uuid4()),
            "node_type": node_type,
            "wallet_address": wallet_address,
            "compute_specs": compute_specs,
            "status": "idle",
        }
        self.active_nodes.append(node)
        return node

    def distribute_task(self, simulation_id: str, task: str) -> str:
        # Placeholder handoff point for OpenClaw tasks and training jobs.
        return f"task:{task}:sim:{simulation_id}:dispatched"


orchestrator = Orchestrator()
