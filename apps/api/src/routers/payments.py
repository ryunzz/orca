from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase import Client

from ..db import get_db
from ..services.payment import payment_engine

router = APIRouter(prefix="/payments", tags=["payments"])


class DistributeRequest(BaseModel):
    agent_node_ids: list[str]
    amount_lamports: int


@router.post("/distribute")
async def distribute(payload: DistributeRequest, db: Client = Depends(get_db)):
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


@router.get("/status/{node_id}")
async def status(node_id: str, db: Client = Depends(get_db)):
    result = db.table("payments").select("*").eq("agent_node_id", node_id).limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="payment not found")
    payment = result.data[0]
    return {"status": payment["status"], "tx_signature": payment.get("tx_signature")}
