"""Cloud inference client for ORCA agent teams.

Calls the live Modal endpoint (VisionModel.web_analyze) which runs
Ollama llama3.2-vision on an H100.

The endpoint expects:  {"image": "<base64>", "prompt": "..."}
The endpoint returns:  parsed JSON from the vision model.

This client translates team_type + optional upstream context into the
correct prompt, sends the request, and returns structured results.
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

from ..config import get_settings

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT = 180.0

# Live Modal endpoint (VisionModel.web_analyze on H100)
DEFAULT_ENDPOINT = "https://asaha96--orca-vision-visionmodel-web-analyze.modal.run"

# ---------------------------------------------------------------------------
# Prompts — identical to packages/modal-deploy/src/vision_endpoint.py so the
# Ollama model returns structured JSON matching our shared schemas.
# ---------------------------------------------------------------------------

FIRE_SEVERITY_PROMPT = """Analyze this image for fire conditions. You are an expert fire investigator.

Look for:
- Active flames, smoke, or fire damage
- Fire intensity and spread patterns
- Fuel sources (furniture, materials)
- Smoke density and visibility

Respond with ONLY valid JSON (no markdown, no explanation):
{
  "fire_detected": true or false,
  "overall_severity": "none" or "low" or "moderate" or "high" or "critical",
  "severity_score": 0.0-1.0,
  "fire_locations": [
    {"zone_id": "area_name", "intensity": "smoldering" or "small" or "moderate" or "large", "intensity_score": 0.0-1.0, "coordinates": {"x": 0, "y": 0}}
  ],
  "fuel_sources": [
    {"type": "furniture" or "electronics" or "chemicals" or "structural", "zone_id": "area", "hazard_level": "low" or "moderate" or "high"}
  ],
  "smoke_conditions": {"visibility": "clear" or "light" or "moderate" or "heavy" or "zero", "toxicity_risk": "low" or "moderate" or "high"},
  "spread_prediction": {"rate": "slow" or "moderate" or "rapid", "containment_difficulty": "easy" or "moderate" or "difficult" or "extreme"},
  "confidence": 0.0-1.0
}"""

_STRUCTURAL_JSON_SCHEMA = """{
  "overall_integrity": "intact|minor_damage|compromised|severe_damage|collapse_imminent",
  "integrity_score": 0.0,
  "zones": [
    {"zone_id": "area", "integrity_status": "intact|damaged|compromised", "safe_to_enter": true, "fire_exposure_level": "none|low|moderate|high", "hazards": []}
  ],
  "blocked_passages": [
    {"passage_id": "door_or_corridor", "from_zone": "zone_a", "to_zone": "zone_b", "blocked_reason": "fire|debris|collapse", "clearable": true}
  ],
  "collapse_risk": "none|low|moderate|high|imminent",
  "confidence": 0.0
}"""

_EVACUATION_JSON_SCHEMA = """{
  "civilian_routes": [
    {"route_id": "civ_route_1", "priority": 1, "start_zone": "zone", "exit_point": "exit_name", "path": ["zone_a", "corridor", "exit"], "safety_score": 0.0, "estimated_time_seconds": 60, "status": "open|congested|blocked"}
  ],
  "firefighter_routes": [
    {"route_id": "ff_route_1", "entry_point": "entry_name", "target_zone": "zone", "purpose": "fire_attack|search_rescue", "safety_score": 0.0, "equipment_required": ["SCBA"]}
  ],
  "exits": [
    {"exit_id": "exit_name", "status": "open|blocked|congested", "capacity_per_minute": 30}
  ],
  "estimated_occupancy": {"total": 75},
  "confidence": 0.0
}"""

_PERSONNEL_JSON_SCHEMA = """{
  "incident_classification": {"type": "structure_fire", "alarm_level": 2, "complexity": "routine|moderate|complex"},
  "team_composition": {
    "total_personnel": 18,
    "units": [
      {"unit_type": "engine|ladder|rescue|ems|battalion_chief", "count": 1, "role": "description", "personnel_per_unit": 4}
    ]
  },
  "equipment": {
    "critical": [{"item": "name", "quantity": 1, "reason": "why"}]
  },
  "approach_strategy": {
    "mode": "offensive|defensive",
    "primary_objective": "description"
  },
  "timing": {
    "eta_first_unit_minutes": 4,
    "eta_full_assignment_minutes": 8,
    "estimated_containment_minutes": 15
  },
  "confidence": 0.0
}"""


def _build_prompt(team_type: str, context: dict[str, Any] | None) -> str:
    """Build the vision model prompt for a given team type.

    Uses string concatenation instead of .format() so JSON examples
    keep clean single braces (no {{ }} escaping that confuses the model).
    """
    ctx = context or {}

    if team_type == "fire_severity":
        return FIRE_SEVERITY_PROMPT

    if team_type == "structural":
        fire_ctx = json.dumps(ctx.get("fire_severity", {"fire_detected": False}), indent=2)
        return (
            "You are a certified structural engineer performing a building safety inspection for a training simulation. "
            "Analyze this image and assess the building's structural condition.\n\n"
            "Context from a prior environmental survey:\n" + fire_ctx + "\n\n"
            "Assess:\n"
            "- Condition of walls, columns, floors, and ceiling\n"
            "- Whether passages are clear or obstructed\n"
            "- Overall structural soundness\n"
            "- Which zones are safe to occupy\n\n"
            "Respond with ONLY valid JSON (no markdown, no explanation):\n"
            + _STRUCTURAL_JSON_SCHEMA
        )

    if team_type == "evacuation":
        fire_ctx = json.dumps(ctx.get("fire_severity", {}), indent=2)
        structural_ctx = json.dumps(ctx.get("structural", {}), indent=2)
        return (
            "You are a building safety consultant planning exit routes for a training exercise. "
            "Based on this building image and the prior assessments, determine the safest paths to exits.\n\n"
            "Environmental survey:\n" + fire_ctx + "\n\n"
            "Structural assessment:\n" + structural_ctx + "\n\n"
            "Respond with ONLY valid JSON (no markdown, no explanation):\n"
            + _EVACUATION_JSON_SCHEMA
        )

    if team_type == "personnel":
        fire_ctx = json.dumps(ctx.get("fire_severity", {}), indent=2)
        structural_ctx = json.dumps(ctx.get("structural", {}), indent=2)
        evacuation_ctx = json.dumps(ctx.get("evacuation", {}), indent=2)
        return (
            "You are an incident commander planning firefighter deployment. Based on this building image and all upstream analysis, recommend personnel and tactics.\n\n"
            "Fire analysis:\n" + fire_ctx + "\n\n"
            "Structural analysis:\n" + structural_ctx + "\n\n"
            "Evacuation analysis:\n" + evacuation_ctx + "\n\n"
            "Respond with ONLY valid JSON (no markdown, no explanation):\n"
            + _PERSONNEL_JSON_SCHEMA
        )

    raise ValueError(f"Unknown team_type: {team_type}")


class CloudInferenceClient:
    """Async HTTP client for the live Modal VisionModel endpoint."""

    def __init__(self):
        self.settings = get_settings()
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=DEFAULT_TIMEOUT)
        return self._client

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    def _get_endpoint_url(self) -> str:
        if self.settings.world_model_endpoint:
            return self.settings.world_model_endpoint
        return DEFAULT_ENDPOINT

    def _get_headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.settings.world_model_api_key:
            headers["Authorization"] = f"Bearer {self.settings.world_model_api_key}"
        elif self.settings.openclaw_api_key:
            headers["X-OpenClaw-Key"] = self.settings.openclaw_api_key
        return headers

    async def analyze(
        self,
        team_type: str,
        frame_path: str | bytes,
        context: dict[str, Any] | None = None,
        frame_id: str = "unknown",
    ) -> dict[str, Any]:
        """Send frame to the Modal VisionModel endpoint.

        Translates team_type into a structured prompt, sends base64 image,
        and returns the parsed JSON result.
        """
        # Encode frame to base64
        if isinstance(frame_path, bytes):
            frame_base64 = base64.standard_b64encode(frame_path).decode()
        elif isinstance(frame_path, str):
            path = Path(frame_path)
            if path.exists():
                frame_base64 = base64.standard_b64encode(path.read_bytes()).decode()
            else:
                logger.warning(f"Frame not found: {frame_path}, using empty placeholder")
                frame_base64 = ""
        else:
            raise ValueError(f"Invalid frame type: {type(frame_path)}")

        prompt = _build_prompt(team_type, context)

        # Payload matches VisionModel.web_analyze expected format
        payload = {
            "image": frame_base64,
            "prompt": prompt,
        }

        client = await self._get_client()
        url = self._get_endpoint_url()
        headers = self._get_headers()

        try:
            logger.info(f"Calling cloud inference: {team_type} at {url}")
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            result = response.json()

            # If the model itself errored (e.g. bad image) but the endpoint
            # is alive, log a warning and return what we got — the orchestrator
            # can fall back to local stubs.
            if "error" in result:
                logger.warning(f"Model-level error for {team_type}: {result.get('error', '')[:200]}")

            # Enrich with metadata
            result["frame_id"] = frame_id
            result["timestamp"] = datetime.now(timezone.utc).isoformat()
            result["frame_refs"] = [frame_id]
            result["team_type"] = team_type

            logger.info(f"Cloud inference complete: {team_type}")
            return result

        except httpx.HTTPStatusError as e:
            logger.error(f"Cloud inference HTTP error: {e.response.status_code} - {e.response.text}")
            raise CloudInferenceError(f"HTTP {e.response.status_code}: {e.response.text}") from e
        except httpx.RequestError as e:
            logger.error(f"Cloud inference request error: {e}")
            raise CloudInferenceError(f"Request failed: {e}") from e

    async def analyze_batch(
        self,
        team_type: str,
        frames: list[str | bytes],
        context: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """Analyze multiple frames concurrently."""
        tasks = [
            self.analyze(team_type, frame, context, frame_id=f"frame_{i:03d}")
            for i, frame in enumerate(frames)
        ]
        return await asyncio.gather(*tasks, return_exceptions=True)

    async def health_check(self) -> bool:
        """Check if the cloud endpoint is reachable."""
        try:
            client = await self._get_client()
            # Send a minimal POST — endpoint only accepts POST
            response = await client.post(
                self._get_endpoint_url(),
                json={"image": "", "prompt": "health check"},
                timeout=10.0,
            )
            # A 500 with a JSON error body means the endpoint is alive
            return response.status_code < 502
        except Exception:
            return False


class CloudInferenceError(Exception):
    """Raised when cloud inference fails."""
    pass


# Singleton client
_client: CloudInferenceClient | None = None


def get_cloud_client() -> CloudInferenceClient:
    """Get the singleton cloud inference client."""
    global _client
    if _client is None:
        _client = CloudInferenceClient()
    return _client


async def analyze_remote(
    team_type: str,
    frame_path: str | bytes,
    context: dict[str, Any] | None = None,
    frame_id: str = "unknown",
) -> dict[str, Any]:
    """Convenience function for remote analysis."""
    client = get_cloud_client()
    return await client.analyze(team_type, frame_path, context, frame_id)
