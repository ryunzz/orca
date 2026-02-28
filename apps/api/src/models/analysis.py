from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base


class AnalysisResult(Base):
    """Stores the output of each agent team's analysis of a frame.

    One row per team per frame. The 'sellable dataset' is a query across all rows
    for a simulation, exported as JSON/CSV.
    """
    __tablename__ = "analysis_results"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    simulation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    frame_id: Mapped[str] = mapped_column(String(255), nullable=False)
    team_type: Mapped[str] = mapped_column(String(50), nullable=False)  # fire_severity, structural, evacuation, personnel
    result: Mapped[dict] = mapped_column(JSONB, nullable=False)  # full team output matching shared/schemas/
    model_used: Mapped[str] = mapped_column(String(100), nullable=True)  # e.g. "claude-sonnet-4-20250514"
    confidence: Mapped[float | None] = mapped_column(nullable=True)
    processing_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    extra: Mapped[dict] = mapped_column("metadata", JSONB, default=dict, server_default="{}")


class SpreadPrediction(Base):
    """Stores fire spread timeline predictions for a simulation."""
    __tablename__ = "spread_predictions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    simulation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    frame_id: Mapped[str] = mapped_column(String(255), nullable=False)
    timeline: Mapped[dict] = mapped_column(JSONB, nullable=False)  # list of room predictions
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    extra: Mapped[dict] = mapped_column("metadata", JSONB, default=dict, server_default="{}")
