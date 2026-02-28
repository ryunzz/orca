from __future__ import annotations

import json

from redis.asyncio.client import Redis

from ..config import get_settings

redis = Redis.from_url(get_settings().redis_url, decode_responses=True)


async def publish_telemetry(simulation_id: str, payload: dict) -> None:
    channel = f"telemetry:{simulation_id}"
    await redis.publish(channel, json.dumps(payload))
