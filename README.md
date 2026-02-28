# World Generation for Emergency Response

Monorepo for an emergency-response simulation platform powered by synthetic world generation, fast human-in-the-loop telemetry, and agent orchestration.

## Architecture

- `apps/web` — Next.js 14 App Router frontend (Sajal)
- `apps/api` — FastAPI backend + Redis + PostgreSQL model/service layer (Ryun)
- `packages/orchestrator` — OpenClaw orchestrator and training scaffolding (Ryun)
- `packages/world-models` — World simulation primitives and inference interfaces (Krish / Aritra)
- `packages/routing` — Emergency vehicle routing algorithms (Aritra)
- `shared` — Shared schemas and constants used across packages

## Tech Stack

- Bun for JS/TS
- Python with `uv`
- Next.js 14 + TypeScript + Tailwind + React Three Fiber
- FastAPI + SQLAlchemy + Redis + WebSockets
- PostgreSQL (every table includes `metadata JSONB DEFAULT '{}'`)
- OpenClaw, Modal, Solana payment hooks

## Requirements

- Bun
- uv
- Docker (for local Postgres + Redis)

## Quickstart

1. Copy `.env.example` to `.env` in the repo root.
2. Start infrastructure:
   ```bash
   docker-compose up -d
   ```
3. Create API environment:
   ```bash
   cd apps/api
   uv sync
   uv run uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
   ```
4. Create frontend environment:
   ```bash
   cd apps/web
   bun install
   bun dev
   ```

Optional package bootstrap:

```bash
cd packages/orchestrator && uv sync
cd ../world-models && uv sync
cd ../routing && uv sync
```

## API Endpoints (scaffolded)

- `POST /api/simulation/create`
- `GET /api/simulation/{id}`
- `GET /api/simulation/{id}/telemetry`
- `POST /api/agents/spawn`
- `GET /api/agents/status`
- `POST /api/routing/optimize`
- `POST /api/payments/distribute`
- `GET /api/payments/status/{node_id}`
- `POST /api/telemetry/batch`
- WebSockets: `/ws/telemetry/{simulation_id}`, `/ws/agents`

## Database Note

Each table intentionally includes a `metadata JSONB DEFAULT '{}'` column as an extension point for future labeling, simulation state and experiment features.
