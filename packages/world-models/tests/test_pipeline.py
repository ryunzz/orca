"""End-to-end tests for the fire intelligence pipeline.

Runs without ANTHROPIC_API_KEY — exercises all 4 teams via fallback data,
validates output shapes against shared/schemas/, and tests edge cases.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

# Add parent of src/ so we can import src as a package (relative imports work)
PKG_PARENT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PKG_PARENT))
# Also add src/ directly for modules without relative imports
sys.path.insert(0, str(PKG_PARENT / "src"))

SCHEMA_DIR = Path(__file__).resolve().parent.parent.parent.parent / "shared" / "schemas"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_schema(name: str) -> dict:
    path = SCHEMA_DIR / f"{name}.json"
    assert path.exists(), f"Schema not found: {path}"
    return json.loads(path.read_text())


def validate_keys(data: dict, schema: dict, path: str = "") -> list[str]:
    """Validate that data contains all required keys from schema and types are plausible."""
    errors: list[str] = []
    required = schema.get("required", [])
    properties = schema.get("properties", {})

    for key in required:
        if key not in data:
            errors.append(f"{path}.{key} missing (required)")

    for key, prop in properties.items():
        if key not in data:
            continue
        val = data[key]
        ptype = prop.get("type")

        if ptype == "integer" and not isinstance(val, int):
            errors.append(f"{path}.{key} expected int, got {type(val).__name__}")
        elif ptype == "number" and not isinstance(val, (int, float)):
            errors.append(f"{path}.{key} expected number, got {type(val).__name__}")
        elif ptype == "string" and not isinstance(val, str):
            errors.append(f"{path}.{key} expected string, got {type(val).__name__}")
        elif ptype == "array" and not isinstance(val, list):
            errors.append(f"{path}.{key} expected array, got {type(val).__name__}")
        elif ptype == "object" and not isinstance(val, dict):
            errors.append(f"{path}.{key} expected object, got {type(val).__name__}")

    return errors


# ---------------------------------------------------------------------------
# Fire Severity Tests
# ---------------------------------------------------------------------------

def test_fallback_fire_severity():
    from src.fallback import get_fallback_fire_severity

    result = get_fallback_fire_severity("test_frame_001")
    assert result["severity"] == 7
    assert len(result["fire_locations"]) == 2
    assert result["frame_id"] == "test_frame_001"
    assert "timestamp" in result
    assert result["smoke_density"] == "moderate"
    assert 0 <= result["confidence"] <= 1

    schema = load_schema("fire_severity")
    errors = validate_keys(result, schema)
    assert not errors, f"Schema validation failed: {errors}"
    print("  [PASS] fallback fire severity")


def test_fire_severity_deep_copy():
    """Ensure fallback returns a deep copy (mutations don't leak)."""
    from src.fallback import get_fallback_fire_severity

    a = get_fallback_fire_severity("a")
    b = get_fallback_fire_severity("b")
    a["severity"] = 99
    a["fire_locations"][0]["intensity"] = 0.0
    assert b["severity"] == 7
    assert b["fire_locations"][0]["intensity"] == 0.85
    print("  [PASS] fire severity deep copy isolation")


# ---------------------------------------------------------------------------
# Structural Analysis Tests
# ---------------------------------------------------------------------------

def test_fallback_structural():
    from src.fallback import get_fallback_structural

    result = get_fallback_structural("test_frame_002")
    assert result["integrity_score"] == 6
    assert len(result["objects"]) == 8
    assert result["collapse_risk"] == "low"
    assert result["frame_id"] == "test_frame_002"
    assert len(result["blocked_passages"]) == 1
    assert result["degradation_timeline"]["minutes_to_concern"] == 12

    schema = load_schema("structural_analysis")
    errors = validate_keys(result, schema)
    assert not errors, f"Schema validation failed: {errors}"
    print("  [PASS] fallback structural analysis")


# ---------------------------------------------------------------------------
# Fire Spread Prediction Tests
# ---------------------------------------------------------------------------

def test_fire_spread_basic():
    from src.fire_sim import build_spread_timeline

    fire_data = {
        "severity": 7,
        "fire_locations": [
            {"label": "Room 201", "intensity": 0.85},
        ],
        "fuel_sources": [
            {"material": "furniture", "flammability": "high", "location_label": "Room 201"},
        ],
    }
    timeline = build_spread_timeline(fire_data)
    assert len(timeline) > 0, "No spread predictions"

    # Room 201 should be the most dangerous
    room201 = next(r for r in timeline if r["room"] == "Room 201")
    assert room201["current_intensity"] == 0.85
    assert room201["intensity_5min"] >= 0.85, "Fire should not decrease"
    assert room201["time_to_danger_min"] == 0, "Room 201 already dangerous"
    print("  [PASS] fire spread basic prediction")


def test_fire_spread_adjacency():
    """Adjacent rooms should get fire spread through doorways."""
    from src.fire_sim import build_spread_timeline

    fire_data = {
        "severity": 7,
        "fire_locations": [
            {"label": "Room 201", "intensity": 0.85},
        ],
        "fuel_sources": [],
    }
    timeline = build_spread_timeline(fire_data)

    hallway_b = next(r for r in timeline if r["room"] == "Hallway B")
    # Hallway B is adjacent to Room 201 — should have spread increase
    assert hallway_b["intensity_5min"] > hallway_b["current_intensity"], (
        "Adjacent room should show fire spread"
    )
    print("  [PASS] fire spread adjacency")


def test_fire_spread_no_fire():
    """No fire detected — should have minimal/ambient intensity only."""
    from src.fire_sim import build_spread_timeline

    fire_data = {
        "severity": 0,
        "fire_locations": [],
        "fuel_sources": [],
    }
    timeline = build_spread_timeline(fire_data)
    for room in timeline:
        assert room["current_intensity"] == 0.0, f"{room['room']} should have 0 intensity"
    print("  [PASS] fire spread no fire")


def test_fire_spread_stairwell():
    """Stairwell should amplify vertical spread."""
    from src.fire_sim import build_spread_timeline

    fire_data = {
        "severity": 7,
        "fire_locations": [
            {"label": "Hallway B", "intensity": 0.6},
        ],
        "fuel_sources": [],
    }
    timeline = build_spread_timeline(fire_data)

    stairwell = next(r for r in timeline if r["room"] == "Stairwell A")
    # Stairwell A is adjacent to Hallway B and has_stairwell=True
    assert "stairwell enables vertical spread" in stairwell["risk_factors"] or \
           stairwell["intensity_5min"] > stairwell["current_intensity"], \
        "Stairwell should show vertical spread risk"
    print("  [PASS] fire spread stairwell amplification")


# ---------------------------------------------------------------------------
# Evacuation Route Tests
# ---------------------------------------------------------------------------

def test_evacuation_routes():
    from src.evacuation import compute_evacuation_routes
    from src.fallback import get_fallback_fire_severity, get_fallback_structural

    fire = get_fallback_fire_severity()
    structural = get_fallback_structural()
    result = compute_evacuation_routes(fire, structural, "evac_test_001")

    assert "civilian_exits" in result
    assert "firefighter_entries" in result
    assert "risk_scores" in result
    assert len(result["civilian_exits"]) > 0, "Should find at least one civilian route"
    assert len(result["firefighter_entries"]) > 0, "Should find at least one FF entry"

    schema = load_schema("evacuation_routes")
    errors = validate_keys(result, schema)
    assert not errors, f"Schema validation failed: {errors}"
    print("  [PASS] evacuation route generation")


def test_evacuation_avoids_fire():
    """Civilian routes should prefer paths avoiding fire rooms."""
    from src.evacuation import compute_evacuation_routes

    fire = {
        "severity": 9,
        "fire_locations": [
            {"label": "Room 201", "intensity": 0.95},
            {"label": "Hallway B", "intensity": 0.8},
        ],
        "fuel_sources": [],
        "smoke_density": "heavy",
    }
    structural = {
        "objects": [],
        "integrity_score": 4,
        "blocked_passages": [
            {"passage": "Room 201 entrance", "reason": "fire", "severity": "complete"},
        ],
        "collapse_risk": "moderate",
        "degradation_timeline": {"minutes_to_concern": 5, "minutes_to_critical": 10, "factors": []},
    }
    result = compute_evacuation_routes(fire, structural, "evac_avoid_fire")

    # Room 201 risk should be very high
    risk_201 = result["risk_scores"].get("Room 201", {})
    assert risk_201.get("fire_risk", 0) >= 0.9, "Room 201 should have very high fire risk"
    print("  [PASS] evacuation avoids fire rooms")


def test_evacuation_no_fire():
    """With no fire, all routes should be safe."""
    from src.evacuation import compute_evacuation_routes

    fire = {
        "severity": 0,
        "fire_locations": [],
        "fuel_sources": [],
        "smoke_density": "none",
    }
    structural = {
        "objects": [],
        "integrity_score": 10,
        "blocked_passages": [],
        "collapse_risk": "none",
        "degradation_timeline": {"minutes_to_concern": 999, "minutes_to_critical": 999, "factors": []},
    }
    result = compute_evacuation_routes(fire, structural, "no_fire_test")

    for route in result["civilian_exits"]:
        assert route["risk_level"] in ("safe", "caution"), (
            f"Route {route['route_id']} should be safe with no fire, got {route['risk_level']}"
        )
    print("  [PASS] evacuation safe when no fire")


# ---------------------------------------------------------------------------
# Personnel Recommendation Tests
# ---------------------------------------------------------------------------

def test_personnel_basic():
    from src.personnel import recommend_personnel

    context = {
        "fire_severity": {
            "severity": 7,
            "fire_locations": [{"label": "Room 201", "intensity": 0.85}],
            "smoke_density": "moderate",
        },
        "structural": {
            "integrity_score": 6,
            "collapse_risk": "low",
            "blocked_passages": [{"passage": "Room 201", "reason": "fire", "severity": "partial"}],
        },
        "evacuation": {
            "firefighter_entries": [{"path": ["Lobby", "Hallway A", "Hallway B", "Room 201"]}],
        },
    }
    result = recommend_personnel(context, "personnel_test_001")

    assert result["firefighters"] >= 4, "Should recommend at least 4 firefighters"
    assert result["alarm_level"] >= 1
    assert result["eta_containment_min"] > 0
    assert len(result["trucks"]) > 0
    assert len(result["equipment"]) > 0
    assert len(result["strategy"]) > 0
    assert len(result["priority_actions"]) > 0

    schema = load_schema("personnel_recommendation")
    errors = validate_keys(result, schema)
    assert not errors, f"Schema validation failed: {errors}"
    print("  [PASS] personnel basic recommendation")


def test_personnel_alarm_escalation():
    """High severity + multiple fires + compromised structure = high alarm."""
    from src.personnel import recommend_personnel

    context = {
        "fire_severity": {
            "severity": 9,
            "fire_locations": [
                {"label": "A", "intensity": 0.9},
                {"label": "B", "intensity": 0.8},
                {"label": "C", "intensity": 0.7},
            ],
            "smoke_density": "heavy",
        },
        "structural": {
            "integrity_score": 3,
            "collapse_risk": "high",
            "blocked_passages": [],
        },
        "evacuation": {},
    }
    result = recommend_personnel(context)

    assert result["alarm_level"] >= 4, f"Expected alarm >= 4, got {result['alarm_level']}"
    assert result["firefighters"] >= 28, f"Expected >= 28 firefighters, got {result['firefighters']}"
    print("  [PASS] personnel alarm escalation")


def test_personnel_minor_incident():
    """Minor fire = alarm 1, minimal resources."""
    from src.personnel import recommend_personnel

    context = {
        "fire_severity": {
            "severity": 2,
            "fire_locations": [{"label": "Kitchen", "intensity": 0.2}],
            "smoke_density": "light",
        },
        "structural": {
            "integrity_score": 9,
            "collapse_risk": "none",
            "blocked_passages": [],
        },
        "evacuation": {},
    }
    result = recommend_personnel(context)

    assert result["alarm_level"] <= 2, f"Minor fire should be alarm 1-2, got {result['alarm_level']}"
    assert result["firefighters"] <= 10
    print("  [PASS] personnel minor incident")


# ---------------------------------------------------------------------------
# Full Pipeline (all 4 teams sequentially)
# ---------------------------------------------------------------------------

def test_full_pipeline_fallback():
    """Run the complete 4-team pipeline using fallback data."""
    from src.fallback import get_all_fallbacks

    results = get_all_fallbacks("pipeline_test_001")

    assert "fire_severity" in results
    assert "structural" in results
    assert "evacuation" in results
    assert "personnel" in results

    # Cross-team consistency checks
    fire = results["fire_severity"]
    structural = results["structural"]
    evac = results["evacuation"]
    personnel = results["personnel"]

    # Fire data should inform structural
    assert fire["severity"] == 7
    assert structural["integrity_score"] == 6

    # Evacuation should have routes
    assert len(evac["civilian_exits"]) > 0
    assert len(evac["firefighter_entries"]) > 0

    # Personnel should reflect the severity
    assert personnel["alarm_level"] >= 2
    assert personnel["firefighters"] > 0
    assert "strategy" in personnel

    print("  [PASS] full 4-team pipeline (fallback)")


def test_vision_fallback_no_api_key():
    """analyze_frame should fall back gracefully when no API key is set."""
    import asyncio
    # Remove API key if set
    old_key = os.environ.pop("ANTHROPIC_API_KEY", None)
    try:
        from src.vision import analyze_fire_severity, analyze_structural

        fire = analyze_fire_severity(b"\x00\x00", "no_key_test")
        assert fire["severity"] == 7, "Should use fallback data"
        assert fire["frame_id"] == "no_key_test"

        structural = analyze_structural(b"\x00\x00", None, "no_key_test")
        assert structural["integrity_score"] == 6, "Should use fallback data"
        print("  [PASS] vision falls back without API key")
    finally:
        if old_key is not None:
            os.environ["ANTHROPIC_API_KEY"] = old_key


# ---------------------------------------------------------------------------
# analyze_frame routing
# ---------------------------------------------------------------------------

def test_analyze_frame_routing():
    """analyze_frame routes to correct team based on team_type."""
    import asyncio
    old_key = os.environ.pop("ANTHROPIC_API_KEY", None)
    try:
        from src.vision import analyze_frame

        fire = asyncio.run(analyze_frame(b"\x00", "fire_severity", frame_id="route_test"))
        assert "severity" in fire
        assert fire["frame_id"] == "route_test"

        structural = asyncio.run(analyze_frame(b"\x00", "structural", context={"fire_severity": fire}, frame_id="route_test"))
        assert "integrity_score" in structural

        evac = asyncio.run(analyze_frame(
            b"\x00", "evacuation",
            context={"fire_severity": fire, "structural": structural},
            frame_id="route_test",
        ))
        assert "civilian_exits" in evac

        personnel = asyncio.run(analyze_frame(
            b"\x00", "personnel",
            context={"fire_severity": fire, "structural": structural, "evacuation": evac},
            frame_id="route_test",
        ))
        assert "firefighters" in personnel
        print("  [PASS] analyze_frame routing to all 4 teams")
    finally:
        if old_key is not None:
            os.environ["ANTHROPIC_API_KEY"] = old_key


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

def main():
    print("\n=== ORCA Fire Intelligence Pipeline Tests ===\n")

    tests = [
        ("Fire Severity", [
            test_fallback_fire_severity,
            test_fire_severity_deep_copy,
        ]),
        ("Structural Analysis", [
            test_fallback_structural,
        ]),
        ("Fire Spread Prediction", [
            test_fire_spread_basic,
            test_fire_spread_adjacency,
            test_fire_spread_no_fire,
            test_fire_spread_stairwell,
        ]),
        ("Evacuation Routes", [
            test_evacuation_routes,
            test_evacuation_avoids_fire,
            test_evacuation_no_fire,
        ]),
        ("Personnel Recommendation", [
            test_personnel_basic,
            test_personnel_alarm_escalation,
            test_personnel_minor_incident,
        ]),
        ("Full Pipeline", [
            test_full_pipeline_fallback,
            test_vision_fallback_no_api_key,
            test_analyze_frame_routing,
        ]),
    ]

    passed = 0
    failed = 0

    for group_name, group_tests in tests:
        print(f"\n--- {group_name} ---")
        for test_fn in group_tests:
            try:
                test_fn()
                passed += 1
            except Exception as e:
                print(f"  [FAIL] {test_fn.__name__}: {e}")
                failed += 1

    print(f"\n{'='*50}")
    print(f"Results: {passed} passed, {failed} failed, {passed + failed} total")
    if failed == 0:
        print("ALL TESTS PASSED")
    else:
        print(f"{failed} TEST(S) FAILED")
        sys.exit(1)


if __name__ == "__main__":
    main()
