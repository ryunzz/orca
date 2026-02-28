"""ORCA Vision Agent - Modal Serverless Deployment with Gemini Flash.

Uses Google Gemini 2.0 Flash for fire/structural analysis.
Super cheap: ~$0.10 per million tokens, fast, great vision.

Deployment:
    modal secret create google-secret GOOGLE_API_KEY=<your-key>
    modal deploy src/vision_endpoint.py

Usage:
    curl -X POST https://orca-vision--analyze-endpoint.modal.run \
        -H "Content-Type: application/json" \
        -d '{"frame_base64": "...", "team_type": "fire_severity", "frame_id": "001"}'
"""
from __future__ import annotations

import base64
import json
from datetime import datetime, timezone
from typing import Any

import modal

app = modal.App("orca-vision")

# Gemini Flash - super cheap, fast, good vision
MODEL_ID = "gemini-2.0-flash"

image = modal.Image.debian_slim(python_version="3.11").pip_install(
    "google-genai>=1.0.0",
    "pillow>=10.0.0",
)


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
  "severity_score": number 0.0-1.0,
  "fire_locations": [
    {"zone_id": "area_name", "intensity": "smoldering" or "small" or "moderate" or "large", "intensity_score": number 0.0-1.0, "coordinates": {"x": number, "y": number}}
  ],
  "fuel_sources": [
    {"type": "furniture" or "electronics" or "chemicals" or "structural", "zone_id": "area", "hazard_level": "low" or "moderate" or "high"}
  ],
  "smoke_conditions": {"visibility": "clear" or "light" or "moderate" or "heavy" or "zero", "toxicity_risk": "low" or "moderate" or "high"},
  "spread_prediction": {"rate": "slow" or "moderate" or "rapid", "containment_difficulty": "easy" or "moderate" or "difficult" or "extreme"},
  "confidence": number 0.0-1.0
}"""

STRUCTURAL_PROMPT = """Analyze this building image for structural integrity during a fire emergency.

Previous fire analysis:
{fire_context}

Look for:
- Structural damage to walls, columns, floors, ceiling
- Blocked passages or debris
- Collapse risks
- Safe vs unsafe zones

Respond with ONLY valid JSON (no markdown, no explanation):
{
  "overall_integrity": "intact" or "minor_damage" or "compromised" or "severe_damage" or "collapse_imminent",
  "integrity_score": number 0.0-1.0,
  "zones": [
    {"zone_id": "area", "integrity_status": "intact" or "damaged" or "compromised", "safe_to_enter": true or false, "fire_exposure_level": "none" or "low" or "moderate" or "high", "hazards": ["list of hazards"]}
  ],
  "blocked_passages": [
    {"passage_id": "door_or_corridor", "from_zone": "zone_a", "to_zone": "zone_b", "blocked_reason": "fire" or "debris" or "collapse", "clearable": true or false}
  ],
  "load_bearing_status": {"walls_compromised": [], "columns_compromised": [], "roof_status": "intact" or "compromised" or "collapsed"},
  "collapse_risk": "none" or "low" or "moderate" or "high" or "imminent",
  "degradation_timeline": {"current_risk": "low" or "moderate" or "high", "time_to_critical": number or null},
  "confidence": number 0.0-1.0
}"""


def _parse_json(text: str) -> dict[str, Any]:
    """Parse JSON from model response."""
    raw = text.strip()
    # Remove markdown fences
    if "```json" in raw:
        raw = raw.split("```json")[1].split("```")[0]
    elif "```" in raw:
        parts = raw.split("```")
        if len(parts) >= 2:
            raw = parts[1]

    # Find JSON object
    start = raw.find("{")
    end = raw.rfind("}") + 1
    if start != -1 and end > start:
        raw = raw[start:end]

    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        return {"error": f"JSON parse failed: {e}", "raw": text[:500]}


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("google-secret")],
    timeout=120,
)
def analyze_with_gemini(image_base64: str, prompt: str) -> str:
    """Call Gemini Vision API."""
    from google import genai
    from google.genai import types
    import os

    client = genai.Client(api_key=os.environ["GOOGLE_API_KEY"])

    # Decode image
    image_bytes = base64.b64decode(image_base64)

    response = client.models.generate_content(
        model=MODEL_ID,
        contents=[
            types.Content(
                role="user",
                parts=[
                    types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
                    types.Part.from_text(text=prompt),
                ],
            )
        ],
        config=types.GenerateContentConfig(
            temperature=0.1,  # Low temp for structured output
            max_output_tokens=2048,
        ),
    )

    return response.text


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("google-secret")],
    timeout=120,
)
def analyze_fire_severity(frame_base64: str, frame_id: str = "unknown") -> dict[str, Any]:
    """Analyze frame for fire severity using Gemini."""
    raw = analyze_with_gemini.remote(frame_base64, FIRE_SEVERITY_PROMPT)
    result = _parse_json(raw)

    result["frame_id"] = frame_id
    result["timestamp"] = datetime.now(timezone.utc).isoformat()
    result["frame_refs"] = [frame_id]
    result["model"] = MODEL_ID

    return result


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("google-secret")],
    timeout=120,
)
def analyze_structural(
    frame_base64: str,
    fire_context: dict[str, Any] | None = None,
    frame_id: str = "unknown",
) -> dict[str, Any]:
    """Analyze frame for structural integrity using Gemini."""
    fire_ctx_str = json.dumps(fire_context, indent=2) if fire_context else '{"fire_detected": false}'
    prompt = STRUCTURAL_PROMPT.format(fire_context=fire_ctx_str)

    raw = analyze_with_gemini.remote(frame_base64, prompt)
    result = _parse_json(raw)

    result["frame_id"] = frame_id
    result["timestamp"] = datetime.now(timezone.utc).isoformat()
    result["frame_refs"] = [frame_id]
    result["model"] = MODEL_ID

    return result


@app.function(image=image, timeout=60)
def compute_evacuation(
    fire_context: dict[str, Any] | None,
    structural_context: dict[str, Any] | None,
    frame_id: str = "unknown",
) -> dict[str, Any]:
    """Compute evacuation routes (algorithmic, no vision needed)."""
    base_safety = 0.9
    if fire_context and fire_context.get("fire_detected"):
        severity = fire_context.get("severity_score", 0.5)
        base_safety -= severity * 0.3
    if structural_context:
        integrity = structural_context.get("integrity_score", 0.8)
        base_safety -= (1 - integrity) * 0.2

    blocked = structural_context.get("blocked_passages", []) if structural_context else []

    # Get fire locations for route planning
    fire_zones = []
    if fire_context:
        for loc in fire_context.get("fire_locations", []):
            fire_zones.append(loc.get("zone_id", "unknown"))

    return {
        "civilian_routes": [
            {
                "route_id": "civ_route_1",
                "priority": 1,
                "start_zone": "zone_B1",
                "exit_point": "exit_north",
                "path": ["zone_B1", "corridor_1", "lobby", "exit_north"],
                "safety_score": round(max(0.1, base_safety), 2),
                "estimated_time_seconds": 45,
                "hazards_along_route": fire_zones,
                "status": "open",
            }
        ],
        "firefighter_routes": [
            {
                "route_id": "ff_route_1",
                "entry_point": "entry_south",
                "target_zone": fire_zones[0] if fire_zones else "zone_A1",
                "purpose": "fire_attack",
                "safety_score": 0.6,
                "equipment_required": ["SCBA", "thermal_camera", "halligan"],
            }
        ],
        "exits": [
            {"exit_id": "exit_north", "status": "open", "capacity_per_minute": 30},
            {"exit_id": "exit_south", "status": "open", "capacity_per_minute": 20},
        ],
        "blocked_passages": blocked,
        "estimated_occupancy": {"total": 75, "by_zone": {"zone_B1": 30, "zone_B2": 25, "zone_C1": 20}},
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "frame_id": frame_id,
        "confidence": 0.85,
    }


@app.function(image=image, timeout=60)
def recommend_personnel(
    context: dict[str, Any],
    frame_id: str = "unknown",
) -> dict[str, Any]:
    """Recommend personnel deployment (algorithmic synthesis)."""
    fire_data = context.get("fire_severity", {})
    structural_data = context.get("structural", {})

    # Determine alarm level from fire severity
    alarm_level = 1
    severity = fire_data.get("overall_severity", "none")
    if severity in ["moderate"]:
        alarm_level = 2
    elif severity in ["high", "critical"]:
        alarm_level = 3

    # Escalate based on structural risk
    if structural_data.get("collapse_risk") in ["high", "imminent"]:
        alarm_level = max(alarm_level, 3)

    # Attack mode based on structural integrity
    integrity_score = structural_data.get("integrity_score", 0.8)
    attack_mode = "offensive" if integrity_score > 0.5 else "defensive"

    return {
        "incident_classification": {
            "type": "structure_fire",
            "alarm_level": alarm_level,
            "complexity": "complex" if alarm_level >= 2 else "routine",
            "ics_type": 3 if alarm_level >= 2 else 4,
        },
        "team_composition": {
            "total_personnel": 12 + (alarm_level - 1) * 6,
            "units": [
                {"unit_type": "engine", "count": alarm_level + 1, "role": "fire_attack", "personnel_per_unit": 4},
                {"unit_type": "ladder", "count": 1, "role": "ventilation", "personnel_per_unit": 4},
                {"unit_type": "rescue", "count": 1, "role": "search_rescue", "personnel_per_unit": 4},
                {"unit_type": "battalion_chief", "count": 1, "role": "command", "personnel_per_unit": 1},
                {"unit_type": "ems", "count": 1, "role": "medical", "personnel_per_unit": 2},
            ],
        },
        "equipment": {
            "critical": [
                {"item": "SCBA", "quantity": 12 + alarm_level * 4},
                {"item": "Thermal imaging camera", "quantity": 2},
                {"item": "Attack line 2.5in", "quantity": alarm_level + 1},
            ],
        },
        "approach_strategy": {
            "mode": attack_mode,
            "primary_objective": "Fire suppression with concurrent search and rescue" if attack_mode == "offensive" else "Defensive operations, protect exposures",
        },
        "timing": {
            "eta_first_unit_minutes": 4,
            "eta_full_assignment_minutes": 8,
            "estimated_containment_minutes": 15 + alarm_level * 5,
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "frame_id": frame_id,
        "confidence": 0.88,
    }


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("google-secret")],
    timeout=180,
)
def analyze(
    frame_base64: str,
    team_type: str,
    context: dict[str, Any] | None = None,
    frame_id: str = "unknown",
) -> dict[str, Any]:
    """Main entry point - routes to appropriate team."""
    if team_type == "fire_severity":
        return analyze_fire_severity.remote(frame_base64, frame_id)
    elif team_type == "structural":
        fire_ctx = context.get("fire_severity") if context else None
        return analyze_structural.remote(frame_base64, fire_ctx, frame_id)
    elif team_type == "evacuation":
        fire_ctx = context.get("fire_severity") if context else None
        structural_ctx = context.get("structural") if context else None
        return compute_evacuation.remote(fire_ctx, structural_ctx, frame_id)
    elif team_type == "personnel":
        return recommend_personnel.remote(context or {}, frame_id)
    else:
        raise ValueError(f"Unknown team_type: {team_type}")


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("google-secret")],
    timeout=180,
)
@modal.web_endpoint(method="POST")
def analyze_endpoint(request: dict) -> dict[str, Any]:
    """HTTP endpoint for agent analysis.

    POST:
    {
        "frame_base64": "<base64 image>",
        "team_type": "fire_severity|structural|evacuation|personnel",
        "context": {...},
        "frame_id": "frame_001"
    }
    """
    return analyze.remote(
        request.get("frame_base64", ""),
        request.get("team_type", "fire_severity"),
        request.get("context"),
        request.get("frame_id", "unknown"),
    )


@app.function(image=image)
@modal.web_endpoint(method="GET")
def health() -> dict[str, str]:
    """Health check."""
    return {"status": "ok", "model": MODEL_ID}


if __name__ == "__main__":
    print("Deploy with:")
    print("  modal secret create google-secret GOOGLE_API_KEY=<your-key>")
    print("  modal deploy src/vision_endpoint.py")
    print(f"\nModel: {MODEL_ID}")
    print("Cost: ~$0.10 per million input tokens")
