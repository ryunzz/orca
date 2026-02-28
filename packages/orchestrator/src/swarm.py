from __future__ import annotations

from dataclasses import dataclass

from .node import AgentNode


@dataclass
class AgentSwarm:
    nodes: list[AgentNode]

    def __init__(self) -> None:
        self.nodes = []

    def register_node(self, node: AgentNode) -> None:
        self.nodes.append(node)

    def start(self) -> None:
        for node in self.nodes:
            node.start()
