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
from .ws import ws_router
from .db import Base, engine
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
app.include_router(ws_router)


@app.get("/health")
async def health() -> dict[str, str]:
    redis_ok = await redis_client.ping()
    return {
        "status": "ok",
        "redis": "connected" if redis_ok else "disconnected"
    }


@app.on_event("startup")
async def startup() -> None:
    # Initialize database (graceful if unavailable)
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database connected successfully")
    except Exception as e:
        logger.warning(f"Database unavailable — running without persistence: {e}")

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
