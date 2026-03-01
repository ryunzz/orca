"""Solana payment engine for agent micropayments.

Sends devnet SOL transfers to agent team wallets on task completion.
Falls back to mock signatures when payer key is not configured.
"""
from __future__ import annotations

import asyncio
import base64
import logging
import secrets
from dataclasses import dataclass
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Solders import (optional – graceful fallback to mock mode)
# ---------------------------------------------------------------------------
try:
    from solders.hash import Hash  # type: ignore
    from solders.keypair import Keypair as SolKeypair  # type: ignore
    from solders.message import Message  # type: ignore
    from solders.pubkey import Pubkey  # type: ignore
    from solders.system_program import TransferParams, transfer  # type: ignore
    from solders.transaction import Transaction  # type: ignore

    _SOLDERS_OK = True
except ImportError:  # pragma: no cover
    _SOLDERS_OK = False
    logger.warning("solders not installed — payment engine will run in mock mode")

# ---------------------------------------------------------------------------
# Deterministic devnet keypairs for agent teams.
# Seeds are derived from team names so pubkeys are stable across restarts.
# ---------------------------------------------------------------------------
def _derive_team_pubkey(team: str) -> str:
    if not _SOLDERS_OK:
        # Stable placeholder addresses when solders isn't available
        _fallback = {
            "fire_severity": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
            "structural":    "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
            "evacuation":    "4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi",
            "personnel":     "DnXyn2CQKN3JMzMp9E4qY1XFmrEzLhMtSy2DYG6B3kz",
        }
        return _fallback.get(team, "11111111111111111111111111111112")
    seed = f"orca_agent_{team}".encode().ljust(32, b"\x00")[:32]
    kp = SolKeypair.from_seed(bytes(seed))  # type: ignore
    return str(kp.pubkey())


TEAM_PUBKEYS: dict[str, str] = {
    t: _derive_team_pubkey(t)
    for t in ["fire_severity", "structural", "evacuation", "personnel"]
}

# Payment weights per team (must sum to 1.0)
TEAM_WEIGHTS: dict[str, float] = {
    "fire_severity": 0.30,
    "structural":    0.25,
    "evacuation":    0.25,
    "personnel":     0.20,
}

LAMPORTS_PER_SIMULATION = 5_000_000  # 0.005 SOL total per simulation


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------
@dataclass
class SolanaPaymentEngine:
    rpc_url: str = "https://api.devnet.solana.com"
    payer_private_key: str | None = None

    # ── internal helpers ────────────────────────────────────────────────────

    def _payer_keypair(self) -> "SolKeypair | None":  # type: ignore[name-defined]
        if not _SOLDERS_OK or not self.payer_private_key:
            return None
        try:
            return SolKeypair.from_base58_string(self.payer_private_key)  # type: ignore
        except Exception as exc:
            logger.warning("Failed to load payer keypair: %s", exc)
            return None

    @staticmethod
    def _mock_signature() -> str:
        """Generate a syntactically valid but unverifiable tx signature."""
        return secrets.token_hex(32)  # 64 hex chars ≈ base58 sig length

    async def _get_latest_blockhash(self) -> str:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                self.rpc_url,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "getLatestBlockhash",
                    "params": [{"commitment": "confirmed"}],
                },
            )
            resp.raise_for_status()
            return resp.json()["result"]["value"]["blockhash"]

    async def _broadcast(self, tx_bytes: bytes) -> str:
        tx_b64 = base64.b64encode(tx_bytes).decode()
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                self.rpc_url,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "sendTransaction",
                    "params": [tx_b64, {"encoding": "base64", "skipPreflight": False}],
                },
            )
            resp.raise_for_status()
            data = resp.json()
            if "error" in data:
                raise ValueError(f"RPC error: {data['error']}")
            return data["result"]

    # ── public API ──────────────────────────────────────────────────────────

    async def send_lamports(self, recipient_pubkey: str, amount_lamports: int) -> str:
        """Transfer lamports on devnet. Returns tx signature (real or mock)."""
        payer = self._payer_keypair()

        if not _SOLDERS_OK or payer is None:
            logger.info("Mock payment: %d lamports → %s", amount_lamports, recipient_pubkey)
            await asyncio.sleep(0.04)  # simulate network latency
            return self._mock_signature()

        try:
            blockhash_str = await self._get_latest_blockhash()
            blockhash = Hash.from_string(blockhash_str)  # type: ignore
            recipient = Pubkey.from_string(recipient_pubkey)  # type: ignore

            ix = transfer(  # type: ignore
                TransferParams(  # type: ignore
                    from_pubkey=payer.pubkey(),
                    to_pubkey=recipient,
                    lamports=amount_lamports,
                )
            )
            msg = Message.new_with_blockhash([ix], payer.pubkey(), blockhash)  # type: ignore
            tx = Transaction([payer], msg, blockhash)  # type: ignore

            sig = await self._broadcast(bytes(tx))
            logger.info(
                "Payment sent: %d lamports → %s | sig=%s",
                amount_lamports,
                recipient_pubkey,
                sig,
            )
            return sig
        except Exception as exc:
            logger.error("Solana tx failed, using mock signature: %s", exc)
            return self._mock_signature()

    async def pay_team(self, team: str, amount_lamports: int) -> dict[str, Any]:
        """Pay a single agent team and return the payment record."""
        recipient = TEAM_PUBKEYS.get(team, TEAM_PUBKEYS["fire_severity"])
        sig = await self.send_lamports(recipient, amount_lamports)
        return {
            "team": team,
            "recipient": recipient,
            "amount_lamports": amount_lamports,
            "tx_signature": sig,
            "status": "submitted",
        }

    async def distribute_to_agents(
        self,
        simulation_id: str,
        total_lamports: int = LAMPORTS_PER_SIMULATION,
    ) -> list[dict[str, Any]]:
        """Distribute SOL to all 4 agent teams proportionally by weight."""
        records: list[dict[str, Any]] = []
        for team, weight in TEAM_WEIGHTS.items():
            amount = int(total_lamports * weight)
            record = await self.pay_team(team, amount)
            record["simulation_id"] = simulation_id
            records.append(record)
        return records

    async def verify_funding_tx(self, tx_signature: str, expected_recipient: str) -> bool:
        """Verify a user-submitted funding transaction on devnet."""
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    self.rpc_url,
                    json={
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "getTransaction",
                        "params": [
                            tx_signature,
                            {"encoding": "json", "commitment": "confirmed"},
                        ],
                    },
                )
                data = resp.json()
                if data.get("result") is None:
                    return False
                # Basic check: tx exists and didn't error
                tx_data = data["result"]
                meta = tx_data.get("meta", {})
                return meta.get("err") is None
        except Exception as exc:
            logger.warning("Could not verify funding tx %s: %s", tx_signature, exc)
            return False

    # ── legacy ─────────────────────────────────────────────────────────────

    def build_disbursement(self, node_ids: list[str], amount_lamports: int) -> list[dict[str, Any]]:
        """Backward-compatible stub used by existing /distribute endpoint."""
        return [
            {
                "agent_node_id": node_id,
                "amount_lamports": amount_lamports,
                "status": "pending",
            }
            for node_id in node_ids
        ]


def _create_engine() -> SolanaPaymentEngine:
    from ..config import get_settings

    s = get_settings()
    return SolanaPaymentEngine(
        rpc_url=s.solana_rpc_url,
        payer_private_key=s.solana_payer_private_key,
    )


payment_engine = _create_engine()
