"""WebSocket endpoints for ORCA real-time updates.

Endpoints:
- ws://api/ws/simulation/:id - Real-time simulation result streaming
- ws://api/ws/telemetry/:simulation_id - Telemetry streaming (legacy)
- ws://api/ws/agents - Agent status streaming (legacy)
"""
from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .redis_client import redis_client
from .services.telemetry import publish_telemetry

logger = logging.getLogger(__name__)

ws_router = APIRouter()


class ConnectionManager:
    """Manages WebSocket connections for different channels."""

    def __init__(self) -> None:
        # simulation_id -> set of connected WebSockets
        self.simulation_clients: dict[str, set[WebSocket]] = {}
        self.telemetry_clients: dict[str, set[WebSocket]] = {}
        self.agent_clients: set[WebSocket] = set()

    # ─────────────────────────────────────────────────────────────────
    # Simulation WebSocket Management
    # ─────────────────────────────────────────────────────────────────

    async def connect_simulation(self, simulation_id: str, websocket: WebSocket):
        """Connect a client to simulation updates."""
        await websocket.accept()
        self.simulation_clients.setdefault(simulation_id, set()).add(websocket)
        logger.info(f"Client connected to simulation {simulation_id}")

    def disconnect_simulation(self, simulation_id: str, websocket: WebSocket):
        """Disconnect a client from simulation updates."""
        clients = self.simulation_clients.get(simulation_id)
        if clients:
            clients.discard(websocket)
            if not clients:
                del self.simulation_clients[simulation_id]
        logger.info(f"Client disconnected from simulation {simulation_id}")

    async def broadcast_simulation_update(self, simulation_id: str, message: dict):
        """Broadcast update to all clients watching a simulation."""
        clients = self.simulation_clients.get(simulation_id, set())
        if not clients:
            return

        message_str = json.dumps(message)
        disconnected = []

        for websocket in clients:
            try:
                await websocket.send_text(message_str)
            except Exception:
                disconnected.append(websocket)

        # Clean up disconnected clients
        for ws in disconnected:
            clients.discard(ws)

    # ─────────────────────────────────────────────────────────────────
    # Legacy Telemetry WebSocket Management
    # ─────────────────────────────────────────────────────────────────

    async def connect_telemetry(self, simulation_id: str, websocket: WebSocket):
        await websocket.accept()
        self.telemetry_clients.setdefault(simulation_id, set()).add(websocket)

    def disconnect_telemetry(self, simulation_id: str, websocket: WebSocket):
        clients = self.telemetry_clients.get(simulation_id)
        if clients:
            clients.discard(websocket)

    async def connect_agent(self, websocket: WebSocket):
        await websocket.accept()
        self.agent_clients.add(websocket)

    def disconnect_agent(self, websocket: WebSocket):
        self.agent_clients.discard(websocket)

    async def broadcast_agent_status(self, message: str):
        for socket in list(self.agent_clients):
            await socket.send_text(message)


manager = ConnectionManager()


@ws_router.websocket("/ws/simulation/{simulation_id}")
async def simulation_ws(websocket: WebSocket, simulation_id: str):
    """WebSocket endpoint for real-time simulation updates.

    Subscribes to Redis pub/sub and streams team completion events.
    Client receives messages as teams progress: waiting → processing → complete.
    """
    await manager.connect_simulation(simulation_id, websocket)

    # Send initial state
    try:
        status = await redis_client.get_simulation_status(simulation_id)
        team_statuses = await redis_client.get_team_statuses(simulation_id)
        team_results = await redis_client.get_all_team_results(simulation_id)

        initial_state = {
            "event": "initial_state",
            "simulation_id": simulation_id,
            "status": status or "unknown",
            "teams": {
                team: {
                    "status": team_statuses.get(team, "waiting"),
                    "data": team_results.get(team),
                }
                for team in redis_client.TEAM_TYPES
            },
        }
        await websocket.send_text(json.dumps(initial_state))
    except Exception as e:
        logger.error(f"Error sending initial state: {e}")

    # Subscribe to Redis pub/sub for this simulation
    pubsub = None
    try:
        pubsub = await redis_client.subscribe_simulation(simulation_id)

        # Create tasks for receiving from both WebSocket and Redis
        async def receive_from_client():
            """Handle incoming messages from client (keepalive, etc.)."""
            while True:
                try:
                    message = await websocket.receive_text()
                    # Handle ping/pong or other client messages
                    if message == "ping":
                        await websocket.send_text(json.dumps({"event": "pong"}))
                except WebSocketDisconnect:
                    raise
                except Exception:
                    break

        async def receive_from_redis():
            """Forward Redis pub/sub messages to WebSocket."""
            while True:
                try:
                    message = await pubsub.get_message(
                        ignore_subscribe_messages=True,
                        timeout=1.0
                    )
                    if message and message.get("type") == "message":
                        data = message.get("data")
                        if isinstance(data, bytes):
                            data = data.decode("utf-8")
                        if data:
                            # Parse and enrich the message
                            try:
                                parsed = json.loads(data)
                                # Add simulation_id if not present
                                if "simulation_id" not in parsed:
                                    parsed["simulation_id"] = simulation_id
                                await websocket.send_text(json.dumps(parsed))
                            except json.JSONDecodeError:
                                await websocket.send_text(data)
                except Exception as e:
                    if "closed" in str(e).lower():
                        break
                    logger.error(f"Redis pub/sub error: {e}")
                    await asyncio.sleep(0.1)

        # Run both tasks concurrently
        client_task = asyncio.create_task(receive_from_client())
        redis_task = asyncio.create_task(receive_from_redis())

        try:
            # Wait for either task to complete (client disconnect or error)
            done, pending = await asyncio.wait(
                [client_task, redis_task],
                return_when=asyncio.FIRST_COMPLETED
            )
            # Cancel pending tasks
            for task in pending:
                task.cancel()
        except Exception:
            pass

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        manager.disconnect_simulation(simulation_id, websocket)
        if pubsub:
            await redis_client.unsubscribe_simulation(simulation_id)


@ws_router.websocket("/ws/telemetry/{simulation_id}")
async def telemetry_ws(websocket: WebSocket, simulation_id: str):
    """Legacy telemetry WebSocket endpoint."""
    await manager.connect_telemetry(simulation_id, websocket)
    try:
        while True:
            message = await websocket.receive_text()
            await publish_telemetry(simulation_id, json.loads(message))
            for client in list(manager.telemetry_clients.get(simulation_id, set())):
                if client is not websocket:
                    await client.send_text(message)
    except WebSocketDisconnect:
        manager.disconnect_telemetry(simulation_id, websocket)


@ws_router.websocket("/ws/agents")
async def agents_ws(websocket: WebSocket):
    """Legacy agent status WebSocket endpoint."""
    await manager.connect_agent(websocket)
    await manager.broadcast_agent_status('{"nodes": []}')
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_agent(websocket)
