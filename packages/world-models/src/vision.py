from __future__ import annotations

import base64
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen

from .fallback import get_fallback_fire_severity, get_fallback_structural

logger = logging.getLogger(__name__)

VISION_BACKEND = os.environ.get("VISION_BACKEND", "ollama")
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2-vision:11b")


FIRE_SEVERITY_PROMPT = """Analyze this image of a building scene for fire conditions. You are an expert fire investigator.

Provide your analysis as JSON with these exact fields:
{
  "severity": <integer 0-10, 0=no fire, 1-3=minor, 4-6=moderate, 7-9=severe, 10=extreme/flashover>,
  "fire_locations": [
    {"label": "<area description>", "intensity": <0.0-1.0>, "x": <0.0-1.0 normalized>, "y": <0.0-1.0 normalized>, "radius": <0.0-1.0>}
  ],
  "fuel_sources": [
    {"material": "<type>", "flammability": "low|medium|high", "location_label": "<where>"}
  ],
  "smoke_density": "none|light|moderate|heavy|zero_visibility",
  "confidence": <0.0-1.0>
}

If no fire is visible, set severity to 0 and empty fire_locations. Still identify fuel sources and materials.
Respond with ONLY valid JSON, no other text."""

STRUCTURAL_ANALYSIS_PROMPT = """Analyze this building image for structural elements and their condition. You are a structural engineer assessing a building during a fire emergency.

You have fire severity data from a previous analysis:
{fire_context}

Provide your analysis as JSON with these exact fields:
{
  "objects": [
    {"type": "door|wall|window|furniture|stairwell|elevator|column|ceiling|floor|exit_sign|fire_extinguisher|sprinkler", "condition": "intact|damaged|compromised|destroyed", "location_label": "<where>", "x": <0.0-1.0>, "y": <0.0-1.0>, "notes": "<additional context>"}
  ],
  "integrity_score": <integer 1-10, 10=fully sound, 7-9=minor damage, 4-6=significant, 1-3=collapse risk>,
  "blocked_passages": [
    {"passage": "<description>", "reason": "fire|debris|structural_failure|smoke", "severity": "partial|complete"}
  ],
  "collapse_risk": "none|low|moderate|high|imminent",
  "degradation_timeline": {
    "minutes_to_concern": <integer>,
    "minutes_to_critical": <integer>,
    "factors": ["<factor1>", "<factor2>"]
  }
}

Respond with ONLY valid JSON, no other text."""


def _encode_image(frame: bytes | str) -> tuple[str, str]:
    """Encode an image for the vision API. Returns (base64_data, media_type)."""
    if isinstance(frame, str):
        path = Path(frame)
        suffix = path.suffix.lower()
        media_map = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".webp": "image/webp",
        }
        media_type = media_map.get(suffix, "image/jpeg")
        data = base64.standard_b64encode(path.read_bytes()).decode()
        return data, media_type
    else:
        data = base64.standard_b64encode(frame).decode()
        return data, "image/jpeg"


def _call_vision_ollama(image_data: str, media_type: str, prompt: str) -> dict[str, Any]:
    """Send image + prompt to Ollama and parse JSON response."""
    payload = json.dumps({
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "images": [image_data],
        "stream": False,
    }).encode()

    req = Request(
        f"{OLLAMA_BASE_URL}/api/generate",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(req, timeout=120) as resp:
        body = json.loads(resp.read())

    raw = body.get("response", "").strip()
    return _parse_json_response(raw)


def _parse_json_response(raw: str) -> dict[str, Any]:
    """Parse JSON from model response, stripping markdown fences if present."""
    if raw.startswith("```"):
        lines = raw.split("\n")
        lines = lines[1:]  # remove opening fence
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        raw = "\n".join(lines)
    # Some models wrap in extra text — find the JSON object
    start = raw.find("{")
    end = raw.rfind("}") + 1
    if start >= 0 and end > start:
        raw = raw[start:end]
    return json.loads(raw)


async def _call_vision_modal(image_data: str, media_type: str, prompt: str) -> dict[str, Any]:
    """Send image + prompt to Modal-hosted Ollama for inference."""
    import modal

    VisionModel = modal.Cls.from_name("orca-vision", "VisionModel")
    return await VisionModel().analyze.remote.aio(image_data, prompt)


async def _call_vision_async(image_data: str, media_type: str, prompt: str) -> dict[str, Any]:
    """Route vision call to the configured backend (async for Modal)."""
    if VISION_BACKEND == "modal":
        return await _call_vision_modal(image_data, media_type, prompt)
    return _call_vision_ollama(image_data, media_type, prompt)


def _call_vision(image_data: str, media_type: str, prompt: str) -> dict[str, Any]:
    """Route vision call to the configured backend (sync, for non-server use)."""
    if VISION_BACKEND == "modal":
        import asyncio
        return asyncio.get_event_loop().run_until_complete(
            _call_vision_modal(image_data, media_type, prompt)
        )
    return _call_vision_ollama(image_data, media_type, prompt)


def _api_available() -> bool:
    """Check if the vision backend is reachable."""
    if VISION_BACKEND == "modal":
        return True  # Modal availability checked at call time; fallback handles errors
    try:
        urlopen(f"{OLLAMA_BASE_URL}/api/tags", timeout=2)
        return True
    except (URLError, OSError):
        return False


async def analyze_fire_severity(frame: bytes | str, frame_id: str = "unknown") -> dict[str, Any]:
    """Analyze a frame for fire severity. This is the Fire Severity Team brain."""
    if not _api_available():
        logger.warning("Vision backend unavailable — using fallback fire severity data")
        return get_fallback_fire_severity(frame_id)

    try:
        image_data, media_type = _encode_image(frame)
        result = await _call_vision_async(image_data, media_type, FIRE_SEVERITY_PROMPT)
        result["frame_id"] = frame_id
        result["timestamp"] = datetime.now(timezone.utc).isoformat()
        return result
    except Exception as exc:
        logger.error("Vision call failed for fire severity: %s — using fallback", exc)
        return get_fallback_fire_severity(frame_id)


async def analyze_structural(frame: bytes | str, fire_context: dict[str, Any] | None = None, frame_id: str = "unknown") -> dict[str, Any]:
    """Analyze a frame for structural integrity. This is the Structural Analysis Team brain."""
    if not _api_available():
        logger.warning("Vision backend unavailable — using fallback structural data")
        return get_fallback_structural(frame_id)

    try:
        image_data, media_type = _encode_image(frame)
        fire_ctx_str = json.dumps(fire_context, indent=2) if fire_context else '{"severity": 0, "fire_locations": []}'
        prompt = STRUCTURAL_ANALYSIS_PROMPT.format(fire_context=fire_ctx_str)
        result = await _call_vision_async(image_data, media_type, prompt)
        result["frame_id"] = frame_id
        result["timestamp"] = datetime.now(timezone.utc).isoformat()
        return result
    except Exception as exc:
        logger.error("Vision call failed for structural: %s — using fallback", exc)
        return get_fallback_structural(frame_id)


async def analyze_frame(
    frame: bytes | str,
    team_type: str,
    context: dict[str, Any] | None = None,
    frame_id: str = "unknown",
) -> dict[str, Any]:
    """Main entry point for agent teams. Routes to the appropriate analysis function.

    Args:
        frame: Image data (bytes) or file path (str)
        team_type: One of "fire_severity", "structural", "evacuation", "personnel"
        context: Results from other teams (from Redis). None for fire_severity team.
        frame_id: Identifier for the frame being analyzed.

    Returns:
        Structured JSON matching the corresponding schema in shared/schemas/
    """
    if team_type == "fire_severity":
        return await analyze_fire_severity(frame, frame_id)
    elif team_type == "structural":
        fire_ctx = context.get("fire_severity") if context else None
        return await analyze_structural(frame, fire_ctx, frame_id)
    elif team_type == "evacuation":
        from .evacuation import compute_evacuation_routes
        fire_ctx = context.get("fire_severity") if context else None
        structural_ctx = context.get("structural") if context else None
        return compute_evacuation_routes(fire_ctx, structural_ctx, frame_id)
    elif team_type == "personnel":
        from .personnel import recommend_personnel
        return recommend_personnel(context, frame_id)
    else:
        raise ValueError(f"Unknown team_type: {team_type}")
