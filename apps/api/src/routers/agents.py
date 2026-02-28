from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from ..services.orchestrator import orchestrator

router = APIRouter(prefix="/agents", tags=["agents"])


class SpawnRequest(BaseModel):
    node_type: str
    wallet_address: str | None = None
    compute_specs: dict | None = None


@router.post("/spawn")
async def spawn_agent(payload: SpawnRequest):
    data = orchestrator.spawn_node(payload.node_type, payload.wallet_address, payload.compute_specs)
    return data


@router.get("/status")
async def agent_status():
    return {
        "nodes": orchestrator.active_nodes,
    }
