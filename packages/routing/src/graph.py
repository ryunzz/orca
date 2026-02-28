from __future__ import annotations

import networkx as nx


def build_graph() -> nx.DiGraph:
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
