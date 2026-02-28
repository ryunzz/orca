"""Azure OpenAI GPT-5-mini vision inference for ORCA agent teams.

Uses Azure-hosted GPT-5-mini for fast fire image analysis.
Requires AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT in environment.
"""
from __future__ import annotations

import base64
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from openai import AsyncAzureOpenAI

from ..config import get_settings

logger = logging.getLogger(__name__)

AZURE_API_VERSION = "2024-12-01-preview"
DEPLOYMENT_NAME = "gpt-5-mini"

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

TEAM_PROMPTS = {
    "fire_severity": FIRE_SEVERITY_PROMPT,
    "structural": STRUCTURAL_ANALYSIS_PROMPT,
}


def _encode_image(frame_path: str) -> tuple[str, str]:
    """Encode an image file to base64 with media type."""
    path = Path(frame_path)
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


def _parse_json_response(raw: str) -> dict[str, Any]:
    """Parse JSON from model response, stripping markdown fences if present."""
    text = raw.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines)
    start = text.find("{")
    end = text.rfind("}") + 1
    if start >= 0 and end > start:
        try:
            return json.loads(text[start:end])
        except json.JSONDecodeError:
            pass
    return {"raw_response": raw}


def _get_client() -> AsyncAzureOpenAI:
    """Create Azure OpenAI async client."""
    settings = get_settings()
    if not settings.azure_openai_api_key:
        raise RuntimeError("AZURE_OPENAI_API_KEY not configured")

    return AsyncAzureOpenAI(
        api_key=settings.azure_openai_api_key,
        azure_endpoint=settings.azure_openai_endpoint,
        api_version=AZURE_API_VERSION,
    )


async def call_openai_vision(
    image_b64: str,
    media_type: str,
    prompt: str,
) -> dict[str, Any]:
    """Call Azure GPT-5-mini with a vision prompt."""
    client = _get_client()

    response = await client.chat.completions.create(
        model=DEPLOYMENT_NAME,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{media_type};base64,{image_b64}",
                            "detail": "low",
                        },
                    },
                ],
            }
        ],
        max_completion_tokens=2048,
    )

    content = response.choices[0].message.content or ""
    raw = content.strip()
    if not raw:
        logger.warning("Azure OpenAI returned empty content, finish_reason=%s", response.choices[0].finish_reason)
        return {"raw_response": "", "error": "empty response from model"}
    return _parse_json_response(raw)


async def run_single_team_openai(
    frame_path: str,
    team_type: str,
    context: dict[str, Any] | None = None,
    frame_id: str = "frame_0",
) -> dict[str, Any]:
    """Run a single agent team's analysis using Azure OpenAI Vision."""
    prompt = TEAM_PROMPTS.get(team_type)

    if not prompt:
        # Evacuation and personnel don't need vision — use computation
        from .analysis import run_single_team
        return await run_single_team(frame_path, team_type, context, frame_id)

    image_b64, media_type = _encode_image(frame_path)
    result = await call_openai_vision(image_b64, media_type, prompt)
    result["frame_id"] = frame_id
    result["timestamp"] = datetime.now(timezone.utc).isoformat()
    result["model"] = DEPLOYMENT_NAME
    return result
