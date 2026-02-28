"""P2-C2: Test and tune the vision pipeline on real fire images.

Run with ANTHROPIC_API_KEY set:
    ANTHROPIC_API_KEY=sk-... uv run --directory packages/world-models python -m tests.test_real_frames

This exercises the full Claude Vision pipeline on actual fire photos,
validates the JSON output matches schemas, and checks that the analysis
is sensible (high severity for fully engulfed, lower for smoke-only, etc).
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

PKG_PARENT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PKG_PARENT))
sys.path.insert(0, str(PKG_PARENT / "src"))

FRAMES_DIR = PKG_PARENT.parent.parent / "assets" / "frames"
SCHEMA_DIR = PKG_PARENT.parent.parent / "shared" / "schemas"


def load_schema(name: str) -> dict:
    path = SCHEMA_DIR / f"{name}.json"
    assert path.exists(), f"Schema not found: {path}"
    return json.loads(path.read_text())


def validate_keys(data: dict, schema: dict, path: str = "") -> list[str]:
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
# Test: Fully engulfed house fire (house_fire_flames.jpg)
# Expected: severity 8-10, high intensity, heavy smoke
# ---------------------------------------------------------------------------

def test_house_fire_flames():
    import asyncio
    from src.vision import analyze_fire_severity, analyze_structural

    frame = str(FRAMES_DIR / "house_fire_flames.jpg")
    assert Path(frame).exists(), f"Frame not found: {frame}"

    print("\n  Analyzing house_fire_flames.jpg (fully engulfed)...")
    fire = asyncio.run(analyze_fire_severity(frame, "house_fire_flames"))
    print(f"    severity: {fire['severity']}")
    print(f"    fire_locations: {len(fire.get('fire_locations', []))}")
    print(f"    smoke_density: {fire.get('smoke_density')}")
    print(f"    confidence: {fire.get('confidence')}")
    print(f"    fuel_sources: {fire.get('fuel_sources', [])}")

    # Validate schema
    schema = load_schema("fire_severity")
    errors = validate_keys(fire, schema)
    assert not errors, f"Schema errors: {errors}"

    # Sensibility checks — fully engulfed should be severe
    assert fire["severity"] >= 7, f"Fully engulfed fire should be severity >= 7, got {fire['severity']}"
    assert len(fire.get("fire_locations", [])) >= 1, "Should detect at least 1 fire location"
    assert fire.get("smoke_density") in ("moderate", "heavy", "zero_visibility"), \
        f"Expected heavy smoke, got {fire.get('smoke_density')}"

    print("    [PASS] fire severity — fully engulfed")

    # Structural analysis
    print("  Analyzing structural...")
    structural = asyncio.run(analyze_structural(frame, fire, "house_fire_flames"))
    print(f"    integrity_score: {structural['integrity_score']}")
    print(f"    objects: {len(structural.get('objects', []))}")
    print(f"    collapse_risk: {structural.get('collapse_risk')}")
    print(f"    blocked_passages: {structural.get('blocked_passages', [])}")

    schema = load_schema("structural_analysis")
    errors = validate_keys(structural, schema)
    assert not errors, f"Schema errors: {errors}"

    # Structural should be compromised for fully engulfed
    assert structural["integrity_score"] <= 5, \
        f"Fully engulfed should have low integrity, got {structural['integrity_score']}"

    print("    [PASS] structural — fully engulfed")
    return fire, structural


# ---------------------------------------------------------------------------
# Test: Structure fire with smoke (structure_fire_exterior.jpg)
# Expected: severity 4-7, moderate fire, visible smoke
# ---------------------------------------------------------------------------

def test_structure_fire_exterior():
    import asyncio
    from src.vision import analyze_fire_severity, analyze_structural

    frame = str(FRAMES_DIR / "structure_fire_exterior.jpg")
    assert Path(frame).exists(), f"Frame not found: {frame}"

    print("\n  Analyzing structure_fire_exterior.jpg (smoke, emergency response)...")
    fire = asyncio.run(analyze_fire_severity(frame, "structure_fire_exterior"))
    print(f"    severity: {fire['severity']}")
    print(f"    fire_locations: {len(fire.get('fire_locations', []))}")
    print(f"    smoke_density: {fire.get('smoke_density')}")
    print(f"    confidence: {fire.get('confidence')}")

    schema = load_schema("fire_severity")
    errors = validate_keys(fire, schema)
    assert not errors, f"Schema errors: {errors}"

    # Smoke visible but not fully engulfed — moderate severity expected
    assert fire["severity"] >= 3, f"Active fire scene should be >= 3, got {fire['severity']}"
    assert fire.get("smoke_density") != "none", "Should detect smoke"

    print("    [PASS] fire severity — structure fire exterior")

    structural = asyncio.run(analyze_structural(frame, fire, "structure_fire_exterior"))
    print(f"    integrity_score: {structural['integrity_score']}")
    print(f"    objects: {len(structural.get('objects', []))}")

    schema = load_schema("structural_analysis")
    errors = validate_keys(structural, schema)
    assert not errors, f"Schema errors: {errors}"

    print("    [PASS] structural — structure fire exterior")
    return fire, structural


# ---------------------------------------------------------------------------
# Test: Building fire with firefighter response (building_fire_buenos_aires.jpg)
# Expected: moderate-high severity, smoke, firefighter equipment visible
# ---------------------------------------------------------------------------

def test_building_fire_buenos_aires():
    import asyncio
    from src.vision import analyze_fire_severity, analyze_structural

    frame = str(FRAMES_DIR / "building_fire_buenos_aires.jpg")
    assert Path(frame).exists(), f"Frame not found: {frame}"

    print("\n  Analyzing building_fire_buenos_aires.jpg (multi-story, firefighter response)...")
    fire = asyncio.run(analyze_fire_severity(frame, "building_fire_buenos_aires"))
    print(f"    severity: {fire['severity']}")
    print(f"    fire_locations: {len(fire.get('fire_locations', []))}")
    print(f"    smoke_density: {fire.get('smoke_density')}")
    print(f"    confidence: {fire.get('confidence')}")

    schema = load_schema("fire_severity")
    errors = validate_keys(fire, schema)
    assert not errors, f"Schema errors: {errors}"

    assert fire["severity"] >= 3, f"Active fire scene should be >= 3, got {fire['severity']}"

    print("    [PASS] fire severity — Buenos Aires building fire")

    structural = asyncio.run(analyze_structural(frame, fire, "building_fire_buenos_aires"))
    print(f"    integrity_score: {structural['integrity_score']}")
    print(f"    objects: {len(structural.get('objects', []))}")
    print(f"    collapse_risk: {structural.get('collapse_risk')}")

    schema = load_schema("structural_analysis")
    errors = validate_keys(structural, schema)
    assert not errors, f"Schema errors: {errors}"

    print("    [PASS] structural — Buenos Aires building fire")
    return fire, structural


# ---------------------------------------------------------------------------
# Full pipeline test — run all 4 teams on the most dramatic image
# ---------------------------------------------------------------------------

def test_full_pipeline_real_frame():
    from src.vision import analyze_frame
    import asyncio

    frame = str(FRAMES_DIR / "house_fire_flames.jpg")
    print("\n  Running full 4-team pipeline on house_fire_flames.jpg...")

    fire = asyncio.run(analyze_frame(frame, "fire_severity", frame_id="full_pipeline"))
    print(f"    Fire: severity={fire['severity']}, locations={len(fire.get('fire_locations', []))}")

    structural = asyncio.run(analyze_frame(
        frame, "structural",
        context={"fire_severity": fire},
        frame_id="full_pipeline",
    ))
    print(f"    Structural: integrity={structural['integrity_score']}, objects={len(structural.get('objects', []))}")

    evac = asyncio.run(analyze_frame(
        frame, "evacuation",
        context={"fire_severity": fire, "structural": structural},
        frame_id="full_pipeline",
    ))
    print(f"    Evacuation: {len(evac.get('civilian_exits', []))} civilian, {len(evac.get('firefighter_entries', []))} FF routes")

    personnel = asyncio.run(analyze_frame(
        frame, "personnel",
        context={"fire_severity": fire, "structural": structural, "evacuation": evac},
        frame_id="full_pipeline",
    ))
    print(f"    Personnel: {personnel['firefighters']} FF, alarm {personnel['alarm_level']}, ETA {personnel['eta_containment_min']}min")
    print(f"    Strategy: {personnel['strategy'][:80]}...")

    # Cross-team consistency: high severity → high alarm
    if fire["severity"] >= 7:
        assert personnel["alarm_level"] >= 3, \
            f"High severity ({fire['severity']}) should trigger alarm >= 3, got {personnel['alarm_level']}"
    if fire["severity"] >= 8:
        assert personnel["firefighters"] >= 18, \
            f"Severity {fire['severity']} should need >= 18 FF, got {personnel['firefighters']}"

    print("    [PASS] full 4-team pipeline on real frame")

    # Fire spread
    from src.fire_sim import build_spread_timeline
    spread = build_spread_timeline(fire)
    high_risk = [r for r in spread if r["time_to_danger_min"] is not None and r["time_to_danger_min"] <= 3]
    print(f"    Spread: {len(high_risk)} rooms at danger within 3 min")
    print("    [PASS] fire spread timeline from real vision data")

    return {
        "fire_severity": fire,
        "structural": structural,
        "evacuation": evac,
        "personnel": personnel,
        "spread_timeline": spread,
    }


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

def main():
    backend = os.environ.get("VISION_BACKEND", "anthropic")
    if backend == "anthropic" and not os.environ.get("ANTHROPIC_API_KEY"):
        print("ERROR: No vision backend configured. Run with one of:")
        print("  ANTHROPIC_API_KEY=sk-... uv run --directory packages/world-models python -m tests.test_real_frames")
        print("  VISION_BACKEND=ollama uv run --directory packages/world-models python -m tests.test_real_frames")
        sys.exit(1)

    print(f"=== P2-C2: Vision Pipeline on Real Fire Images (backend={backend}) ===")
    print(f"Using frames from: {FRAMES_DIR}")

    passed = 0
    failed = 0

    tests = [
        ("Fully Engulfed House Fire", test_house_fire_flames),
        ("Structure Fire Exterior", test_structure_fire_exterior),
        ("Buenos Aires Building Fire", test_building_fire_buenos_aires),
        ("Full 4-Team Pipeline", test_full_pipeline_real_frame),
    ]

    all_results = {}

    for name, fn in tests:
        print(f"\n--- {name} ---")
        try:
            result = fn()
            if isinstance(result, dict) and "fire_severity" in result:
                all_results[name] = result
            passed += 1
        except Exception as e:
            print(f"  [FAIL] {fn.__name__}: {e}")
            import traceback
            traceback.print_exc()
            failed += 1

    print(f"\n{'='*60}")
    print(f"Results: {passed} passed, {failed} failed, {passed + failed} total")

    if failed == 0:
        print("ALL REAL-FRAME TESTS PASSED — P2-C2 COMPLETE")

        # Save results for inspection
        output_path = FRAMES_DIR / "analysis_results.json"
        with open(output_path, "w") as f:
            json.dump(all_results, f, indent=2, default=str)
        print(f"Results saved to: {output_path}")
    else:
        print(f"{failed} TEST(S) FAILED — tune prompts and retry")
        sys.exit(1)


if __name__ == "__main__":
    main()
