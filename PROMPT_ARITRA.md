# ORCA — Aritra's Agent Prompt (Person C: Vision Model & Fire Logic)

You are Aritra's coding agent. You are building the **vision model pipeline and fire intelligence logic** for ORCA, an AI-powered fire training simulation and decision support tool for HackIllinois 2026.

## Progress Tracking

**You MUST maintain `aritra_agent.md` in the repo root.** After every task completion, update this file with:
- Timestamp
- Task ID completed (e.g. P1-C1)
- What was built / changed
- Files created or modified
- Current blockers (if any)
- What you're working on next
- Any decisions made that affect other team members (especially JSON schema changes for Ryun, or input format requirements for Krish)

Also update `TASKS.md` by marking completed tasks as `[x]`.

## What ORCA Is

ORCA is a decision support tool for firefighters. A user selects a location on a map. The system loads or generates a world model of that location, then deploys a swarm of AI agents to analyze the scene. The agents are organized into 4 specialized teams that collaborate through Redis: fire severity, structural analysis, evacuation routing, and personnel recommendations. Each team reads the previous teams' intermediate results to inform its own analysis.

The orchestration across teams is the core product. Your vision/fire logic is the "brain" inside each agent, the intelligence that actually understands what's in a frame and what it means for firefighters.

## What You Own

You own the intelligence layer, the actual analysis that makes agent outputs meaningful:
- **Vision model selection & integration** — choosing and integrating the model that analyzes world model frames
- **Fire severity classification** — frame → fire intensity, location, fuel sources
- **Structural analysis** — frame → object identification, structural integrity, blocked passages
- **Fire spread prediction** — rule-based logic that predicts how fire will move through a building over time
- **Evacuation route computation** — synthesizing fire data + structural data + layout → safest paths
- **Personnel recommendations** — building size + fire severity → team size, equipment, ETA
- **Structured dataset output** — ensuring every agent run produces clean, annotated records stored in PostgreSQL

You are the brain of the project. Krish gives you frames to analyze. Ryun wraps your logic in OpenClaw agents and orchestrates it. Your outputs need to be structured JSON that both Ryun's pipeline and Sajal's frontend can consume.

## Tech Stack

- **Python**: Use `uv` for all package/project management. Never pip. Never manual venv.
- **Vision Model**: Claude Vision, GPT-4V, or a lighter model that runs on Modal. Your choice based on what gives the best results for fire scene analysis.
- **Fire Logic**: Rule-based prediction system (not ML, just well-designed heuristics)
- **Output**: Structured JSON matching `shared/schemas/` agreed on with Ryun in Phase 0
- **Database**: Results stored in PostgreSQL via Ryun's backend (you define the data shape, he stores it)

## Agent Team Architecture (What Your Logic Powers)

Your code is the "brain" that each agent instance calls. There are 4 agent teams, and your logic powers all of them differently:

```
Fire Severity Team
  Input: raw frame
  Your logic: vision model classifies fire intensity, location, fuel sources
  Output: { severity: 1-10, fire_locations: [...], fuel_sources: [...], confidence: 0-1 }

Structural Analysis Team
  Input: raw frame + fire severity results from Redis
  Your logic: vision model identifies objects + assesses integrity factoring in fire data
  Output: { objects: [...], integrity_score: 1-10, blocked_passages: [...], degradation_timeline: {...} }

Evacuation Route Team
  Input: raw frame + fire severity + structural data from Redis
  Your logic: synthesize spatial layout + danger zones → compute safest paths
  Output: { civilian_exits: [...], firefighter_entries: [...], risk_scores: {...} }

Personnel Recommendation Team
  Input: aggregate of all other teams' outputs from Redis
  Your logic: building size + severity + spread rate → deployment recommendation
  Output: { firefighters: N, trucks: N, equipment: [...], eta_containment_min: N, strategy: "..." }
```

The key insight: each team's logic is different, and the later teams consume earlier teams' outputs. The evacuation team doesn't just look at a frame, it reads the fire map and structural data to compute routes that avoid danger. This cross-team data flow is what demonstrates the orchestration.

## Your Tasks

### Phase 0 (Hour 0-1)
- [ ] **P0-2** Set up shared repo & dev environments, verify scaffold runs
- [ ] **P0-4** Confirm shared JSON schemas for agent outputs with Ryun. Agree on exact field names, types, and nesting for all 4 team output types. Write these to `shared/schemas/`.

### Phase 1 (Hours 1-8) — Build the Intelligence Pipeline
- [ ] **P1-C1** Research & select vision model:
  - Options: Claude Vision API, GPT-4V API, or a lighter open model on Modal
  - Criteria: quality of fire/structural analysis on building interior/exterior images, latency, cost per call
  - Document your choice and reasoning in `aritra_agent.md`
- [ ] **P1-C2** Build image classification pipeline:
  - Input: single frame (image file or base64)
  - Output: fire severity (1-10), fire location coordinates within frame, object identification (door, wall, window, furniture, stairwell), structural integrity score (1-10)
  - This is the base perception layer that all 4 teams use
- [ ] **P1-C3** Build fire spread prediction logic (rule-based, not ML):
  - If severity >= 7 near a door → adjacent room danger increases
  - If fuel sources (furniture, paper, wood) present → spread accelerates
  - If stairwell nearby → vertical spread risk
  - Output: timeline estimates ("fire reaches hallway B in ~4 min", "room C at risk in ~8 min")
  - This should be deterministic and tunable, not a black box
- [ ] **P1-C4** Build personnel recommendation logic:
  - Inputs: building size (floors, sq footage estimate), aggregate fire severity, number of fire locations, spread rate
  - Output: recommended firefighter count, truck types (ladder, engine, tanker), specialized equipment, estimated time to containment
  - Use realistic firefighting heuristics (research NFPA guidelines if needed)
- [ ] **P1-C5** Test the full pipeline with sample images:
  - Use stock fire/building images (not Krish's frames yet, those come in Phase 2)
  - Verify JSON output matches the schema agreed on in P0-4
  - Test edge cases: no fire visible, minor fire, major fire, structural damage visible

**Phase 1 Deliverable**: Given any image frame, your pipeline outputs structured JSON with fire severity, spread prediction, danger zones, and personnel recommendation. Tested and validated with sample images.

### Phase 2 (Hours 8-18) — Integration & Cross-Team Logic
- [ ] **P2-C1** Integrate your pipeline into Ryun's agent framework:
  - Each agent instance calls your classification function as its "brain"
  - Your function signature should be clean: `analyze_frame(frame, team_type, context) -> dict`
  - The `context` parameter contains other teams' results from Redis (for structural, evacuation, personnel teams)
  - Work with Ryun to ensure the interface is clean and the agent can call your code
- [ ] **P2-C2** Tune outputs using real world model frames from Krish:
  - Replace stock images with actual Siebel Center frames
  - Adjust vision model prompts/parameters if outputs are off
  - Ensure fire detection works on synthetic/generated scenes, not just real photos
- [ ] **P2-C3** Build evacuation route logic that demonstrates cross-team orchestration:
  - Read fire severity spatial map from Redis (from fire team)
  - Read structural integrity data from Redis (from structural team)
  - Combine with floor layout extracted from frames
  - Compute safest civilian exit paths (avoid fire, avoid compromised structure)
  - Compute safest firefighter entry paths (shortest safe route to fire source)
  - This is the clearest demonstration of why orchestration matters: the evacuation team NEEDS the other teams' data to do its job
- [ ] **P2-C4** Build structured dataset output:
  - Every agent run produces a clean annotated record:
    - Frame reference (which frame was analyzed)
    - All classification outputs (severity, objects, integrity)
    - All predictions (spread timeline, danger zones)
    - All recommendations (routes, personnel)
    - Metadata (model used, confidence scores, timestamps, team type)
  - Define the SQLAlchemy model shape and share with Ryun for database storage
  - This is the "sellable dataset" for the business model
- [ ] **P2-C5** Validate all 4 agent types producing credible, consistent outputs for the Siebel Center demo:
  - Fire severity outputs should match what's visually in the frame
  - Structural analysis should correctly identify doors, walls, damage
  - Evacuation routes should make spatial sense (not routing through walls or fire)
  - Personnel recs should scale appropriately with severity

### Phase 3 (Hours 18-28) — Validation & Pitch Prep
- [ ] **P3-C1** Validate all agent outputs for demo scenario:
  - Walk through every frame of the Siebel Center demo and verify outputs are sensible
  - No "severity: 2" on a raging fire, no evacuation route through a blocked hallway
  - Fix any vision model prompt issues or rule-based logic bugs
- [ ] **P3-C2** Prepare technical talking points for judge Q&A:
  - Why you chose your vision model
  - How fire spread prediction works (rule-based, tunable, based on NFPA principles)
  - How cross-team data flow works (evacuation reads fire + structural)
  - Limitations and future improvements (more data, ML-based spread prediction, real sensor integration)
- [ ] **P3-C3** Prepare the data export demo:
  - Create a sample packaged dataset showing what a fire department or robotics lab would buy
  - Clean, well-structured, annotated data with clear documentation
  - This supports the business model slide in the pitch

## Integration Points

**From Krish (world models):** He gives you frames (PNG/JPG images) of building exteriors and interiors. You analyze these frames. In Phase 1, use stock images. In Phase 2, switch to Krish's actual Siebel Center frames. Frame format and resolution should be agreed on early.

**To/From Ryun (backend):** Your classification function is called by Ryun's OpenClaw agents. The function signature:
```python
async def analyze_frame(
    frame: bytes | str,         # image data or path
    team_type: str,             # "fire_severity" | "structural" | "evacuation" | "personnel"
    context: dict | None = None # other teams' results from Redis (for cross-team logic)
) -> dict:                      # structured JSON matching shared/schemas/
```
For fire_severity team: context is None (runs first).
For structural team: context contains fire_severity results.
For evacuation team: context contains fire_severity + structural results.
For personnel team: context contains all other teams' results.

**To Sajal (frontend):** Your JSON outputs are what Sajal's dashboard panels display. The field names and structure in your output directly map to UI elements (severity gauge, route overlay data, personnel numbers).

## Critical Reminders

- Your logic is the brain of every agent. If your outputs are bad, the entire demo looks bad.
- The cross-team data flow is the selling point. Evacuation routes MUST visibly incorporate fire severity and structural data. Personnel recs MUST reference all other teams' findings.
- Test with stock images first (Phase 1), then tune on Krish's real frames (Phase 2). Don't wait for real frames to start building.
- Fire spread prediction is rule-based, not ML. Keep it simple, deterministic, and tunable. Judges will ask how it works and you need a clear answer.
- JSON output schemas are agreed on with Ryun in Phase 0. Do not change them without updating him.
- Use `uv` for everything Python. Never pip.
- Every analysis run must produce data structured for PostgreSQL storage (the sellable dataset).

## Loop

1. Read `aritra_agent.md` and `TASKS.md` to assess current state
2. Pick the next unfinished task following the critical path (Phase 0 → 1 → 2 → 3)
3. Implement it fully — no stubs, no TODOs
4. Test it works (run pipeline on sample images, verify JSON output)
5. Update `aritra_agent.md` with progress
6. Mark task as `[x]` in `TASKS.md`
7. Commit with descriptive message, push
8. Repeat
