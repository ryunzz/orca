from __future__ import annotations

import base64
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import anthropic


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
    """Encode an image for the Anthropic API. Returns (base64_data, media_type)."""
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


def _get_client() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))


def _call_vision(client: anthropic.Anthropic, image_data: str, media_type: str, prompt: str) -> dict[str, Any]:
    """Send image + prompt to Claude Vision and parse JSON response."""
    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2048,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": image_data,
                        },
                    },
                    {
                        "type": "text",
                        "text": prompt,
                    },
                ],
            }
        ],
    )
    raw = message.content[0].text.strip()
    # Strip markdown code fences if present
    if raw.startswith("```"):
        lines = raw.split("\n")
        lines = lines[1:]  # remove opening fence
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        raw = "\n".join(lines)
    return json.loads(raw)


def analyze_fire_severity(frame: bytes | str, frame_id: str = "unknown") -> dict[str, Any]:
    """Analyze a frame for fire severity. This is the Fire Severity Team brain."""
    client = _get_client()
    image_data, media_type = _encode_image(frame)
    result = _call_vision(client, image_data, media_type, FIRE_SEVERITY_PROMPT)

    result["frame_id"] = frame_id
    result["timestamp"] = datetime.now(timezone.utc).isoformat()
    return result


def analyze_structural(frame: bytes | str, fire_context: dict[str, Any] | None = None, frame_id: str = "unknown") -> dict[str, Any]:
    """Analyze a frame for structural integrity. This is the Structural Analysis Team brain."""
    client = _get_client()
    image_data, media_type = _encode_image(frame)

    fire_ctx_str = json.dumps(fire_context, indent=2) if fire_context else '{"severity": 0, "fire_locations": []}'
    prompt = STRUCTURAL_ANALYSIS_PROMPT.format(fire_context=fire_ctx_str)

    result = _call_vision(client, image_data, media_type, prompt)

    result["frame_id"] = frame_id
    result["timestamp"] = datetime.now(timezone.utc).isoformat()
    return result


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
        return analyze_fire_severity(frame, frame_id)
    elif team_type == "structural":
        fire_ctx = context.get("fire_severity") if context else None
        return analyze_structural(frame, fire_ctx, frame_id)
    elif team_type == "evacuation":
        # Import here to avoid circular deps
        from .evacuation import compute_evacuation_routes
        fire_ctx = context.get("fire_severity") if context else None
        structural_ctx = context.get("structural") if context else None
        return compute_evacuation_routes(fire_ctx, structural_ctx, frame_id)
    elif team_type == "personnel":
        from .personnel import recommend_personnel
        return recommend_personnel(context, frame_id)
    else:
        raise ValueError(f"Unknown team_type: {team_type}")
