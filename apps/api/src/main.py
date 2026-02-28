from __future__ import annotations

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

app = FastAPI(title="WorldGen Emergency API")

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
    return {"status": "ok"}


@app.on_event("startup")
async def startup() -> None:
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    except Exception:
        import logging
        logging.getLogger(__name__).warning(
            "Database unavailable — running without persistence. "
            "Analysis endpoints still work via /api/analysis/demo"
        )
