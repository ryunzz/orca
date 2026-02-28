from __future__ import annotations

import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .services.telemetry import publish_telemetry

ws_router = APIRouter()


class ConnectionManager:
    def __init__(self) -> None:
        self.telemetry_clients: dict[str, set[WebSocket]] = {}
        self.agent_clients: set[WebSocket] = set()

    async def connect_telemetry(self, simulation_id: str, websocket: WebSocket):
        await websocket.accept()
        self.telemetry_clients.setdefault(simulation_id, set()).add(websocket)

    def disconnect_telemetry(self, simulation_id: str, websocket: WebSocket):
        clients = self.telemetry_clients.get(simulation_id)
        if clients:
            clients.discard(websocket)

    async def broadcast_agent_status(self, message: str):
        for socket in list(self.agent_clients):
            await socket.send_text(message)

    async def connect_agent(self, websocket: WebSocket):
        await websocket.accept()
        self.agent_clients.add(websocket)

    def disconnect_agent(self, websocket: WebSocket):
        self.agent_clients.discard(websocket)


manager = ConnectionManager()


@ws_router.websocket("/ws/telemetry/{simulation_id}")
async def telemetry_ws(websocket: WebSocket, simulation_id: str):
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
    await manager.connect_agent(websocket)
    await manager.broadcast_agent_status('{"nodes": []}')
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_agent(websocket)
