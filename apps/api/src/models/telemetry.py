from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, BigInteger, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base


class TelemetryEvent(Base):
    __tablename__ = "telemetry_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    simulation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("simulations.id"), nullable=False)
    user_id: Mapped[str] = mapped_column(String(255), nullable=False)
    position: Mapped[dict] = mapped_column(JSONB, nullable=False)
    rotation: Mapped[dict] = mapped_column(JSONB, nullable=False)
    action: Mapped[str | None] = mapped_column(String(50))
    timestamp_ms: Mapped[int] = mapped_column(BigInteger, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    extra: Mapped[dict] = mapped_column("metadata", JSONB, default=dict, server_default="{}")
