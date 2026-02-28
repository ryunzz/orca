from __future__ import annotations

import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .services.telemetry import publish_telemetry
from .services.analysis import run_full_analysis

logger = logging.getLogger(__name__)

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


@ws_router.websocket("/ws/analysis")
async def analysis_stream_ws(websocket: WebSocket):
    """Stream analysis results team-by-team over WebSocket.

    Client sends: {"frame_path": "...", "frame_id": "...", "simulation_id": "..."}
    Server sends one message per team completion:
      {"team": "fire_severity", "status": "running"}
      {"team": "fire_severity", "status": "complete", "result": {...}}
      {"team": "structural", "status": "running"}
      ...
    Final message: {"status": "complete", "all_results": {...}}

    If frame_path is "demo", uses fallback data with delays to simulate processing.
    """
    await websocket.accept()
    try:
        while True:
            raw = await websocket.receive_text()
            request = json.loads(raw)

            frame_path = request.get("frame_path", "demo")
            frame_id = request.get("frame_id", "ws_frame_001")
            sim_id = request.get("simulation_id", "ws_session")

            if frame_path == "demo":
                await _stream_demo_analysis(websocket, frame_id)
            else:
                await _stream_live_analysis(websocket, sim_id, frame_path, frame_id)
    except WebSocketDisconnect:
        pass


async def _stream_demo_analysis(ws: WebSocket, frame_id: str):
    """Stream pre-computed demo results with simulated delays."""
    import asyncio
    from .services.analysis import _load_wm_module

    _fallback = _load_wm_module("fallback")
    _evacuation = _load_wm_module("evacuation")
    _personnel = _load_wm_module("personnel")
    _fire_sim = _load_wm_module("fire_sim")

    get_fallback_fire_severity = _fallback.get_fallback_fire_severity
    get_fallback_structural = _fallback.get_fallback_structural
    compute_evacuation_routes = _evacuation.compute_evacuation_routes
    recommend_personnel = _personnel.recommend_personnel
    build_spread_timeline = _fire_sim.build_spread_timeline

    teams = ["fire_severity", "structural", "evacuation", "personnel"]

    # Fire Severity
    await ws.send_text(json.dumps({"team": "fire_severity", "status": "running"}))
    await asyncio.sleep(0.5)
    fire = get_fallback_fire_severity(frame_id)
    await ws.send_text(json.dumps({"team": "fire_severity", "status": "complete", "result": fire}))

    # Structural
    await ws.send_text(json.dumps({"team": "structural", "status": "running"}))
    await asyncio.sleep(0.5)
    structural = get_fallback_structural(frame_id)
    await ws.send_text(json.dumps({"team": "structural", "status": "complete", "result": structural}))

    # Evacuation
    await ws.send_text(json.dumps({"team": "evacuation", "status": "running"}))
    await asyncio.sleep(0.3)
    evac = compute_evacuation_routes(fire, structural, frame_id)
    await ws.send_text(json.dumps({"team": "evacuation", "status": "complete", "result": evac}))

    # Personnel
    await ws.send_text(json.dumps({"team": "personnel", "status": "running"}))
    await asyncio.sleep(0.3)
    personnel = recommend_personnel(
        {"fire_severity": fire, "structural": structural, "evacuation": evac},
        frame_id,
    )
    await ws.send_text(json.dumps({"team": "personnel", "status": "complete", "result": personnel}))

    # Spread timeline
    spread = build_spread_timeline(fire)

    await ws.send_text(json.dumps({
        "status": "complete",
        "all_results": {
            "simulation_id": "demo",
            "frame_id": frame_id,
            "teams": {
                "fire_severity": fire,
                "structural": structural,
                "evacuation": evac,
                "personnel": personnel,
            },
            "spread_timeline": spread,
        },
    }))


async def _stream_live_analysis(ws: WebSocket, sim_id: str, frame_path: str, frame_id: str):
    """Stream live analysis using the vision model."""
    from .services.analysis import run_full_analysis

    try:
        await ws.send_text(json.dumps({"status": "running", "frame_id": frame_id}))
        result = await run_full_analysis(sim_id, frame_path, frame_id)
        await ws.send_text(json.dumps({"status": "complete", "all_results": result}))
    except Exception as exc:
        await ws.send_text(json.dumps({"status": "error", "error": str(exc)}))
