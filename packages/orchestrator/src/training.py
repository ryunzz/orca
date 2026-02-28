from __future__ import annotations


def ingest_human_telemetry(batch: list[dict]) -> dict[str, int]:
    return {"sample_count": len(batch)}
