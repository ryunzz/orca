from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class SolanaPaymentEngine:
    def build_disbursement(self, node_ids: list[str], amount_lamports: int) -> list[dict[str, Any]]:
        return [
            {
                "agent_node_id": node_id,
                "amount_lamports": amount_lamports,
                "status": "pending",
            }
            for node_id in node_ids
        ]


payment_engine = SolanaPaymentEngine()
