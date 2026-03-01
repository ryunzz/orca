from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase import Client

from ..db import get_db
from ..services.payment import TEAM_PUBKEYS, payment_engine

router = APIRouter(prefix="/payments", tags=["payments"])


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class DistributeRequest(BaseModel):
    agent_node_ids: list[str]
    amount_lamports: int


class FundRequest(BaseModel):
    tx_signature: str
    simulation_id: str
    expected_lamports: int
    payer_pubkey: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/distribute")
async def distribute(payload: DistributeRequest, db: Client = Depends(get_db)):
    """Legacy endpoint: build disbursement records without on-chain txs."""
    records = payment_engine.build_disbursement(payload.agent_node_ids, payload.amount_lamports)
    rows = [
        {
            "id": str(uuid.uuid4()),
            "agent_node_id": rec["agent_node_id"],
            "amount_lamports": rec["amount_lamports"],
            "status": rec["status"],
            "metadata": {},
        }
        for rec in records
    ]
    if rows:
        db.table("payments").insert(rows).execute()
    return {"dispatched": len(records)}


@router.post("/fund")
async def fund_simulation(payload: FundRequest, db: Client = Depends(get_db)):
    """Verify a SOL funding transaction submitted by the user's wallet.

    Checks the tx exists and has no errors on devnet, then records the
    funding in Supabase so the simulation can proceed.
    """
    verified = await payment_engine.verify_funding_tx(
        payload.tx_signature, payload.payer_pubkey
    )

    row = {
        "id": str(uuid.uuid4()),
        "agent_node_id": f"funder_{payload.simulation_id}",
        "amount_lamports": payload.expected_lamports,
        "status": "confirmed" if verified else "unverified",
        "tx_signature": payload.tx_signature,
        "metadata": {
            "type": "funding",
            "simulation_id": payload.simulation_id,
            "payer_pubkey": payload.payer_pubkey,
        },
    }
    db.table("payments").insert(row).execute()

    return {
        "verified": verified,
        "simulation_id": payload.simulation_id,
        "tx_signature": payload.tx_signature,
    }


@router.get("/status/{node_id}")
async def payment_status(node_id: str, db: Client = Depends(get_db)):
    result = (
        db.table("payments").select("*").eq("agent_node_id", node_id).limit(1).execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="payment not found")
    payment = result.data[0]
    return {"status": payment["status"], "tx_signature": payment.get("tx_signature")}


@router.get("/history")
async def payment_history(simulation_id: str | None = None, db: Client = Depends(get_db)):
    """Return payment records with Solana Explorer links."""
    query = db.table("payments").select("*").order("id", desc=True).limit(50)
    if simulation_id:
        query = query.contains("metadata", {"simulation_id": simulation_id})
    result = query.execute()

    records = []
    for row in result.data or []:
        sig = row.get("tx_signature")
        records.append(
            {
                **row,
                "explorer_url": (
                    f"https://explorer.solana.com/tx/{sig}?cluster=devnet" if sig else None
                ),
            }
        )
    return {"payments": records}


@router.get("/wallets")
async def agent_wallets():
    """Return the devnet wallet addresses for each agent team."""
    return {
        "team_wallets": TEAM_PUBKEYS,
        "network": "devnet",
        "explorer_base": "https://explorer.solana.com/address/{pubkey}?cluster=devnet",
    }
