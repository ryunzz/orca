from __future__ import annotations

from dataclasses import dataclass


@dataclass
class AgentNode:
    node_id: str
    node_type: str
    status: str = "idle"

    def start(self) -> None:
        self.status = "active"
