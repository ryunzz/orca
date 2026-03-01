from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers.simulation import router as simulation_router
from .routers.telemetry import router as telemetry_router
from .routers.agents import router as agents_router
from .routers.routing import router as routing_router
from .routers.payments import router as payments_router
from .routers.analysis import router as analysis_router
from .routers.metrics import router as metrics_router
from .ws import ws_router
from .db import supabase
from .redis_client import redis_client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="ORCA Emergency Response API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(simulation_router, prefix="/api")
app.include_router(telemetry_router, prefix="/api")
app.include_router(agents_router, prefix="/api")
app.include_router(routing_router, prefix="/api")
app.include_router(payments_router, prefix="/api")
app.include_router(analysis_router, prefix="/api")
app.include_router(metrics_router, prefix="/api")
app.include_router(ws_router)


@app.get("/health")
async def health() -> dict[str, str]:
    redis_ok = await redis_client.ping()
    return {
        "status": "ok",
        "database": "connected" if supabase is not None else "disconnected",
        "redis": "connected" if redis_ok else "disconnected",
    }


@app.on_event("startup")
async def startup() -> None:
    # Verify Supabase connection
    if supabase is not None:
        try:
            supabase.table("simulations").select("id").limit(1).execute()
            logger.info("Supabase connected successfully")
        except Exception as e:
            logger.warning(f"Supabase unavailable — running without persistence: {e}")
    else:
        logger.warning("SUPABASE_URL not set — running without persistence")

    # Initialize Redis connection
    try:
        await redis_client.connect()
        logger.info("Redis connected successfully")
    except Exception as e:
        logger.warning(f"Redis unavailable — running without real-time features: {e}")


@app.on_event("shutdown")
async def shutdown() -> None:
    await redis_client.close()
    logger.info("Redis connection closed")
