# ORCA — Aritra's Task Tracker (Person C: Vision Model & Fire Logic)

> **Project**: AI-Powered Fire Training Simulation
> **Hackathon**: HackIllinois 2026
> **Owner**: Aritra — Vision Model Pipeline & Fire Intelligence

---

## Phase 0 (Hour 0-1)

- [x] **P0-2** Set up shared repo & dev environments, verify scaffold runs
- [x] **P0-4** Confirm shared JSON schemas for agent outputs with Ryun. Agree on exact field names, types, and nesting for all 4 team output types. Write these to `shared/schemas/`.

---

## Phase 1 (Hours 1-8) — Build the Intelligence Pipeline

- [x] **P1-C1** Research & select vision model:
  - Options: Claude Vision API, GPT-4V API, or a lighter open model on Modal
  - Criteria: quality of fire/structural analysis on building interior/exterior images, latency, cost per call
  - Document choice and reasoning in `aritra_agent.md`
- [x] **P1-C2** Build image classification pipeline:
  - Input: single frame (image file or base64)
  - Output: fire severity (1-10), fire location coordinates within frame, object identification (door, wall, window, furniture, stairwell), structural integrity score (1-10)
  - This is the base perception layer that all 4 teams use
- [x] **P1-C3** Build fire spread prediction logic (rule-based, not ML):
  - If severity >= 7 near a door → adjacent room danger increases
  - If fuel sources (furniture, paper, wood) present → spread accelerates
  - If stairwell nearby → vertical spread risk
  - Output: timeline estimates ("fire reaches hallway B in ~4 min", "room C at risk in ~8 min")
  - Deterministic and tunable, not a black box
- [x] **P1-C4** Build personnel recommendation logic:
  - Inputs: building size (floors, sq footage estimate), aggregate fire severity, number of fire locations, spread rate
  - Output: recommended firefighter count, truck types (ladder, engine, tanker), specialized equipment, estimated time to containment
  - Use realistic firefighting heuristics (NFPA guidelines)
- [x] **P1-C5** Test the full pipeline with sample images:
  - Use stock fire/building images (not Krish's frames yet)
  - Verify JSON output matches schema from P0-4
  - Test edge cases: no fire visible, minor fire, major fire, structural damage visible

**Deliverable**: Given any image frame → structured JSON with fire severity, spread prediction, danger zones, personnel rec. Tested with sample images.

---

## Phase 2 (Hours 8-18) — Integration & Cross-Team Logic

- [ ] **P2-C1** Integrate pipeline into Ryun's agent framework:
  - Each agent instance calls your classification function as its "brain"
  - Function signature: `analyze_frame(frame, team_type, context) -> dict`
  - `context` contains other teams' results from Redis (for cross-team logic)
- [ ] **P2-C2** Tune outputs using real world model frames from Krish:
  - Replace stock images with actual Siebel Center frames
  - Adjust vision model prompts/parameters if outputs are off
  - Ensure fire detection works on synthetic/generated scenes
- [ ] **P2-C3** Build evacuation route logic (cross-team orchestration):
  - Read fire severity spatial map from Redis (fire team)
  - Read structural integrity data from Redis (structural team)
  - Combine with floor layout extracted from frames
  - Compute safest civilian exit paths (avoid fire + compromised structure)
  - Compute safest firefighter entry paths (shortest safe route to fire source)
- [ ] **P2-C4** Build structured dataset output:
  - Every agent run produces annotated record: frame ref, classifications, predictions, recommendations, metadata
  - Define SQLAlchemy model shape, share with Ryun for DB storage
  - This is the "sellable dataset" for the business model
- [ ] **P2-C5** Validate all 4 agent types producing credible outputs for Siebel Center demo

---

## Phase 3 (Hours 18-28) — Validation & Pitch Prep

- [ ] **P3-C1** Validate all agent outputs for demo scenario:
  - Walk through every frame, verify outputs are sensible
  - No "severity: 2" on raging fire, no evacuation through blocked hallway
- [ ] **P3-C2** Prepare technical talking points for judge Q&A:
  - Why you chose your vision model
  - How fire spread prediction works (rule-based, NFPA-based)
  - How cross-team data flow works
  - Limitations and future improvements
- [ ] **P3-C3** Prepare data export demo:
  - Sample packaged dataset for fire departments / robotics labs
  - Clean, well-structured, annotated data with documentation

---

## Agent Output Schemas (to confirm with Ryun)

```json
// Fire Severity Team
{ "severity": 1-10, "fire_locations": [...], "fuel_sources": [...], "confidence": 0-1 }

// Structural Analysis Team
{ "objects": [...], "integrity_score": 1-10, "blocked_passages": [...], "degradation_timeline": {...} }

// Evacuation Route Team
{ "civilian_exits": [...], "firefighter_entries": [...], "risk_scores": {...} }

// Personnel Recommendation Team
{ "firefighters": N, "trucks": N, "equipment": [...], "eta_containment_min": N, "strategy": "..." }
```

## Integration Interface

```python
async def analyze_frame(
    frame: bytes | str,         # image data or path
    team_type: str,             # "fire_severity" | "structural" | "evacuation" | "personnel"
    context: dict | None = None # other teams' results from Redis
) -> dict:                      # structured JSON matching shared/schemas/
```
