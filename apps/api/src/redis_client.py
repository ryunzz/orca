"""Redis client for ORCA simulation state management.

Manages inter-team communication, consensus aggregation, and result pub/sub.
"""
from __future__ import annotations

import json
from typing import Any

import redis.asyncio as redis

from .config import get_settings


class RedisClient:
    """Async Redis client for simulation state management."""

    def __init__(self) -> None:
        self._pool: redis.ConnectionPool | None = None
        self._client: redis.Redis | None = None
        self._pubsub: redis.client.PubSub | None = None

    async def connect(self) -> None:
        """Initialize Redis connection pool."""
        settings = get_settings()
        self._pool = redis.ConnectionPool.from_url(
            settings.redis_url,
            decode_responses=True,
            max_connections=20,
        )
        self._client = redis.Redis(connection_pool=self._pool)
        await self._client.ping()

    async def close(self) -> None:
        """Close Redis connection."""
        if self._pubsub:
            await self._pubsub.close()
        if self._client:
            await self._client.close()
        if self._pool:
            await self._pool.disconnect()

    async def ping(self) -> bool:
        """Check Redis connectivity."""
        if not self._client:
            return False
        return await self._client.ping()

    # ─────────────────────────────────────────────────────────────────
    # Simulation State Management
    # ─────────────────────────────────────────────────────────────────

    def _key(self, simulation_id: str, suffix: str) -> str:
        """Generate Redis key for simulation data."""
        return f"simulation:{simulation_id}:{suffix}"

    async def set_simulation_status(self, simulation_id: str, status: str) -> None:
        """Set simulation status: pending | generating | analyzing | complete."""
        await self._client.set(self._key(simulation_id, "status"), status)
        await self._publish_update(simulation_id, "status", status)

    async def get_simulation_status(self, simulation_id: str) -> str | None:
        """Get current simulation status."""
        return await self._client.get(self._key(simulation_id, "status"))

    async def set_simulation_frames(self, simulation_id: str, frames: list[str]) -> None:
        """Store list of frame paths for simulation."""
        await self._client.set(
            self._key(simulation_id, "frames"),
            json.dumps(frames)
        )

    async def get_simulation_frames(self, simulation_id: str) -> list[str]:
        """Get list of frame paths for simulation."""
        data = await self._client.get(self._key(simulation_id, "frames"))
        return json.loads(data) if data else []

    # ─────────────────────────────────────────────────────────────────
    # Team Results (Inter-team Communication)
    # ─────────────────────────────────────────────────────────────────

    TEAM_TYPES = ["fire_severity", "structural", "evacuation", "personnel"]

    async def set_team_result(
        self,
        simulation_id: str,
        team: str,
        result: dict[str, Any]
    ) -> None:
        """Store consensus result for a team. Other teams read this."""
        if team not in self.TEAM_TYPES:
            raise ValueError(f"Invalid team type: {team}")
        await self._client.set(
            self._key(simulation_id, team),
            json.dumps(result)
        )
        await self._publish_update(simulation_id, team, result)

    async def get_team_result(
        self,
        simulation_id: str,
        team: str
    ) -> dict[str, Any] | None:
        """Get consensus result for a team."""
        data = await self._client.get(self._key(simulation_id, team))
        return json.loads(data) if data else None

    async def get_all_team_results(
        self,
        simulation_id: str
    ) -> dict[str, dict[str, Any] | None]:
        """Get all team results for a simulation."""
        results = {}
        for team in self.TEAM_TYPES:
            results[team] = await self.get_team_result(simulation_id, team)
        return results

    # ─────────────────────────────────────────────────────────────────
    # Consensus Tracking (Per-instance results before aggregation)
    # ─────────────────────────────────────────────────────────────────

    async def add_instance_result(
        self,
        simulation_id: str,
        team: str,
        instance_id: str,
        result: dict[str, Any]
    ) -> int:
        """Add a single agent instance result for consensus tracking.

        Returns the number of instance results collected so far.
        """
        key = self._key(simulation_id, f"consensus:{team}")
        entry = json.dumps({"instance_id": instance_id, "result": result})
        return await self._client.rpush(key, entry)

    async def get_instance_results(
        self,
        simulation_id: str,
        team: str
    ) -> list[dict[str, Any]]:
        """Get all instance results for a team (for consensus calculation)."""
        key = self._key(simulation_id, f"consensus:{team}")
        entries = await self._client.lrange(key, 0, -1)
        return [json.loads(e) for e in entries]

    async def clear_instance_results(self, simulation_id: str, team: str) -> None:
        """Clear instance results after consensus is computed."""
        key = self._key(simulation_id, f"consensus:{team}")
        await self._client.delete(key)

    # ─────────────────────────────────────────────────────────────────
    # Team Status Tracking
    # ─────────────────────────────────────────────────────────────────

    async def set_team_status(
        self,
        simulation_id: str,
        team: str,
        status: str
    ) -> None:
        """Set team status: waiting | processing | complete."""
        await self._client.hset(
            self._key(simulation_id, "team_status"),
            team,
            status
        )
        await self._publish_update(simulation_id, f"team_status:{team}", status)

    async def get_team_statuses(self, simulation_id: str) -> dict[str, str]:
        """Get status of all teams."""
        data = await self._client.hgetall(self._key(simulation_id, "team_status"))
        # Ensure all teams are present with default status
        return {
            team: data.get(team, "waiting")
            for team in self.TEAM_TYPES
        }

    # ─────────────────────────────────────────────────────────────────
    # Pub/Sub for Real-time Updates
    # ─────────────────────────────────────────────────────────────────

    async def _publish_update(
        self,
        simulation_id: str,
        event_type: str,
        data: Any
    ) -> None:
        """Publish update to simulation channel."""
        channel = f"simulation:{simulation_id}:updates"
        message = json.dumps({
            "event": event_type,
            "data": data if isinstance(data, (str, int, float, bool)) else data
        })
        await self._client.publish(channel, message)

    async def subscribe_simulation(self, simulation_id: str):
        """Subscribe to simulation updates. Returns async generator of messages."""
        if not self._pubsub:
            self._pubsub = self._client.pubsub()
        channel = f"simulation:{simulation_id}:updates"
        await self._pubsub.subscribe(channel)
        return self._pubsub

    async def unsubscribe_simulation(self, simulation_id: str) -> None:
        """Unsubscribe from simulation updates."""
        if self._pubsub:
            channel = f"simulation:{simulation_id}:updates"
            await self._pubsub.unsubscribe(channel)

    # ─────────────────────────────────────────────────────────────────
    # Cleanup
    # ─────────────────────────────────────────────────────────────────

    async def cleanup_simulation(self, simulation_id: str) -> None:
        """Remove all Redis keys for a simulation."""
        pattern = f"simulation:{simulation_id}:*"
        cursor = 0
        while True:
            cursor, keys = await self._client.scan(cursor, match=pattern, count=100)
            if keys:
                await self._client.delete(*keys)
            if cursor == 0:
                break


# Singleton instance
redis_client = RedisClient()
