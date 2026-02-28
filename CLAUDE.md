# CLAUDE.md — Project Instructions

## Identity

You are a senior ML engineer working on a hackathon project. Write production-quality code — no shortcuts, no lazy stubs, no "TODO" placeholders. Think through edge cases, validate assumptions, and write code you'd be proud to ship.

## Git & Commits

- Write clean, conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`
- Keep commit messages concise and descriptive — focus on the "why", not the "what"
- **Never include "Co-Authored-By: Claude" or any AI attribution in commits**
- **Never include any mention of Claude, AI, or LLM in commit messages or code comments**
- Commits should look like they were written by a human engineer
- Commit atomically — one logical change per commit, not giant dumps
- Always push after committing: `git push`

## Workflow: Build → Test → Commit → Push

Every feature or change follows this strict order:

1. **Implement** the feature or fix
2. **Test thoroughly** before committing:
   - For backend (FastAPI): run the dev server, hit endpoints with curl/httpie, verify responses match `shared/schemas/`
   - For frontend (Next.js): run `bun dev`, check the page renders, verify no console errors, run `bun run build`
   - For Python packages: import and call functions, verify outputs, run `apps/api/tests/` if relevant
   - For type-checked code: run `bun run build` (frontend) or type checks (Python)
3. **Fix any issues** found during testing — do not commit broken code
4. **Commit** with a clean conventional message — `git add <specific files>`, never `git add .`
5. **Push** to remote: `git push`

Never commit untested code. Never push broken code. If tests fail, fix them before committing.

## Code Standards

- **Python**: Use type hints, follow PEP 8, use `uv` for dependency management
- **TypeScript**: Strict types, no `any` unless absolutely necessary, use Bun
- **FastAPI**: Pydantic models for request/response, proper status codes, async where beneficial
- **React**: Functional components, hooks, proper error boundaries
- **All DB tables**: Include `metadata JSONB DEFAULT '{}'` column

## Project Structure & Ownership

```
apps/web/                              → Next.js 14, Bun, Tailwind, React Three Fiber (Sajal)
apps/api/                              → FastAPI, Redis, PostgreSQL, WebSockets (Ryun)
  src/services/orchestrator.py         → Orchestrator class (spawn_node, distribute_task)
  src/services/world_model.py          → WorldModelService ABC + MockWorldModelService
  src/ws.py                            → WebSocket ConnectionManager (telemetry + agents)
  src/models/                          → SQLAlchemy models (all with JSONB metadata)
  src/routers/                         → FastAPI route handlers
packages/orchestrator/                 → OpenClaw agents, Modal cloud inference (Ryun)
  src/swarm.py                         → AgentSwarm (register_node, start)
  src/node.py                          → AgentNode (node_id, node_type, status)
  src/modal_deploy.py                  → Modal deployment (Krish/Aritra)
packages/world-models/                 → World Labs scene generation (Krish/Aritra)
  src/base.py                          → WorldModel ABC (generate_environment, step, get_frame)
  src/fire_sim.py                      → FireState, advance_fire
  src/building_gen.py                  → generate_building_layout
  src/environment.py                   → build_environment
  src/inference.py                     → run_inference entry point
packages/routing/                      → Emergency vehicle routing (Aritra)
  src/optimizer.py                     → RouteSolver (estimate_cost, solve)
  src/graph.py                         → build_graph (networkx)
  src/traffic.py                       → traffic_delay_factor
shared/schemas/                        → JSON schemas (simulation, telemetry, routing)
```

## Existing Interfaces (extend, don't rewrite)

The scaffolding defines clean ABCs and contracts. Build on them:

- `WorldModel` ABC → implement real subclasses, don't replace the interface
- `WorldModelService` → swap `MockWorldModelService` for real implementation when ready
- `Orchestrator` → extend `distribute_task()` with real agent routing logic
- `AgentSwarm` / `AgentNode` → add task execution, image input, result output
- `RouteSolver` → extend with fire-aware pathfinding
- `ConnectionManager` → use existing WebSocket channels, don't create new ones

## Key Decisions

- Bun for all JS/TS, uv for all Python
- PostgreSQL with JSONB metadata on every table
- Redis for agent shared state and real-time communication
- Modal for cloud inference deployment
- WebSockets for live dashboard updates
- World Labs for 3D scene generation
- OpenClaw for agent orchestration framework
