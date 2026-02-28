from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models.payment import Payment
from ..services.payment import payment_engine

router = APIRouter(prefix="/payments", tags=["payments"])


class DistributeRequest(BaseModel):
    agent_node_ids: list[str]
    amount_lamports: int


@router.post("/distribute")
async def distribute(payload: DistributeRequest, session: AsyncSession = Depends(get_session)):
    records = payment_engine.build_disbursement(payload.agent_node_ids, payload.amount_lamports)
    for rec in records:
        session.add(
            Payment(
                agent_node_id=uuid.UUID(rec["agent_node_id"]),
                amount_lamports=rec["amount_lamports"],
                status=rec["status"],
            )
        )
    await session.commit()
    return {"dispatched": len(records)}


@router.get("/status/{node_id}")
async def status(node_id: str, session: AsyncSession = Depends(get_session)):
    stmt = select(Payment).where(Payment.agent_node_id == uuid.UUID(node_id))
    result = await session.execute(stmt)
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="payment not found")
    return {"status": payment.status, "tx_signature": payment.tx_signature}
