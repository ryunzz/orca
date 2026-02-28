# Ryun's Tasks — Agent Orchestration & Backend

## Current Phase: 2 (Full Pipeline) - IN PROGRESS

---

## Phase 0 (Hour 0-1)

- [x] **P0-2** Set up shared repo & dev environments, verify scaffold runs
- [x] **P0-4** Confirm shared JSON schemas for agent outputs with Aritra. Write to `shared/schemas/`. Agree on exact field names, types, nesting for all 4 team output types.
  - Created `shared/schemas/fire_severity.json`
  - Created `shared/schemas/structural.json`
  - Created `shared/schemas/evacuation.json`
  - Created `shared/schemas/personnel.json`

---

## Phase 1 (Hours 1-8) — Foundation

- [x] **P1-B1** Set up FastAPI backend skeleton (`apps/api`) with Redis connection
  - Created `apps/api/src/redis_client.py` with async Redis client
  - Updated `apps/api/src/main.py` with Redis connect/disconnect lifecycle
- [ ] **P1-B2** Set up Modal account + basic inference endpoint (even echo test)
- [x] **P1-B3** Design agent architecture: 1 orchestrator → 4 specialized agent teams → N instances each → inter-team communication (teams read each other's intermediate results from Redis) → cross-team aggregation into final tactical picture
  - Rewrote `apps/api/src/services/orchestrator.py` with full architecture:
    - `TeamType` enum with dependency chain
    - `AgentInstance` class with stub analysis
    - `Team` class with parallel execution and consensus
    - `Orchestrator` class managing full pipeline
- [x] **P1-B4** Build Redis shared state schema:
  - `simulation:{id}:status` — overall simulation state
  - `simulation:{id}:frames` — list of frame references
  - `simulation:{id}:fire_severity` — fire team results (other teams read this)
  - `simulation:{id}:structural` — structural team results (reads fire data)
  - `simulation:{id}:evacuation` — evacuation team results (reads fire + structural)
  - `simulation:{id}:personnel` — personnel team results (reads all)
  - `simulation:{id}:consensus:{team}` — per-team consensus tracking
  - `simulation:{id}:team_status` — hash of team statuses
- [x] **P1-B5** Stub OpenClaw integration — basic agent receives image frame, returns classification JSON
  - Implemented in `AgentInstance._generate_stub_result()` with full schema-compliant mock data
- [x] **P1-B6** Verify end-to-end: agent receives image frame → processes → writes result to Redis
  - Full pipeline implemented in `Orchestrator.run_simulation()`
- [x] **P1-B7** Set up PostgreSQL with SQLAlchemy models:
  - Updated `apps/api/src/models/simulation.py` with all models:
    - `Simulation` (id, name, location, environment_type, world_model_config, status, timestamps, metadata JSONB)
    - `AgentResult` (id, simulation_id, team_type, instance_id, frame_ref, result_json, is_consensus, timestamps, metadata JSONB)
    - `Dataset` (id, simulation_id, export_format, data_url, timestamps, metadata JSONB)

**Phase 1 Deliverable**: Backend running locally, Modal endpoint live, one agent can receive an image frame and write structured JSON to Redis. Database ready.

---

## Phase 2 (Hours 8-18) — Full Pipeline

- [x] **P2-B1** Wire full orchestration pipeline:
  1. Backend receives simulation request (location + frames)
  2. Fire severity team spawns, analyzes frames, publishes results to Redis
  3. Structural team spawns, reads fire data from Redis, analyzes, publishes
  4. Evacuation team spawns, reads fire + structural from Redis, computes routes, publishes
  5. Personnel team spawns, reads all results, recommends deployment, publishes
  6. Frontend polls Redis and progressively receives results
  - All implemented in `apps/api/src/services/orchestrator.py`
  - API endpoints in `apps/api/src/routers/simulation.py`
  - WebSocket in `apps/api/src/ws.py`
- [x] **P2-B2** Implement consensus within teams (3-5 instances, average scores, majority-vote) AND inter-team data flow (fire severity published to Redis, structural subscribes and reads it, evacuation subscribes to both, personnel subscribes to all)
  - Implemented in `Team._compute_consensus()` and `Team.run_hybrid()`
- [x] **P2-B2.5** Upgrade to HYBRID PARALLEL architecture for reduced latency
  - All 4 teams spawn simultaneously with `asyncio.gather()`
  - Each agent has two phases: `analyze_independent()` + `merge_upstream()`
  - Fire team runs immediately (no dependencies)
  - Other teams run independent analysis in parallel, poll Redis for upstream gates
  - Structural gates on: `simulation:{id}:fire_severity`
  - Evacuation gates on: `simulation:{id}:fire_severity` AND `simulation:{id}:structural`
  - Personnel gates on all three upstream teams
  - Timeout after 30s if upstream unavailable
- [ ] **P2-B3** Deploy agents on Modal (cloud, not local) — critical for "scalable distributed inference" pitch
- [ ] **P2-B4** Handle edge cases: conflicting results, timeouts, partial failures (graceful degradation, never crash)
- [ ] **P2-B5** Verify end-to-end: map click → backend receives location → loads or generates world model → frames to agents → orchestrated analysis → Redis → frontend populates
- [x] **P2-B6** Build data export endpoint: `GET /api/simulation/:id/export` — packages all agent results + frames + metadata as JSON/CSV
  - Implemented in `apps/api/src/routers/simulation.py` - supports both JSON and CSV export

---

## Phase 3 (Hours 18-28) — Stability & Demo

- [ ] **P3-B1** Stability: pipeline cannot crash mid-demo. Add retry logic, fallbacks, error handling everywhere.
- [ ] **P3-B2** Add logging/visibility for real-time agent activity (judges will ask "what's happening under the hood")
- [ ] **P3-B3** Optimize latency: target 15-30s from click to dashboard populated. Pre-compute Siebel Center results as instant fallback.

---

## Integration Dependencies

```
P0-4 (schema agreement)  ──→ Aritra can build to spec
P1-B6 (agent + Redis)    ──→ P2-B1 (full pipeline)
P1-B7 (database ready)   ──→ Aritra can store annotated datasets
P1-B6 (agent framework)  ──→ Aritra can integrate his vision pipeline
P2-B5 (pipeline e2e)     ──→ Full demo run-through
```

## Blockers

- **P1-B2**: Need Modal account credentials to deploy inference endpoints
- **P2-B5**: Need frontend integration + world model frames to test full end-to-end