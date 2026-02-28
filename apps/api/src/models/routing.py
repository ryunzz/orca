from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base


class RoutingRequest(Base):
    __tablename__ = "routing_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    simulation_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("simulations.id"))
    origin: Mapped[dict] = mapped_column(JSONB, nullable=False)
    destination: Mapped[dict] = mapped_column(JSONB, nullable=False)
    vehicle_type: Mapped[str] = mapped_column(String(50), nullable=False)
    optimal_route: Mapped[dict | None] = mapped_column(JSONB)
    estimated_time_seconds: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    extra_data: Mapped[dict] = mapped_column("metadata", JSONB, default=dict, server_default="{}")
