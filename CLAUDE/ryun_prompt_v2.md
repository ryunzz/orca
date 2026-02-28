Read ryun_tasks.md and ryun_log.md for current state.

The sequential orchestration pipeline is working (fire → structural → evacuation → personnel, with stubs). Your next job is to upgrade it to a hybrid parallel architecture. Here's what that means:

## Architecture Upgrade: Sequential → Hybrid Parallel

Currently the orchestrator spawns teams one at a time in dependency order. Change it so:

1. ALL agent instances across ALL 4 teams spawn simultaneously on startup
2. Each team's analysis has two phases:
   - **Independent phase**: what the team can figure out from frames alone (no upstream data needed)
   - **Merge phase**: incorporate upstream team results from Redis, produce final output
3. Fire severity team has no upstream dependencies, so it runs both phases immediately
4. Structural team starts independent frame analysis (object detection, layout mapping) immediately in parallel with fire team. When fire results appear in Redis, it merges fire data and publishes final result.
5. Evacuation team starts spatial pathfinding from frames immediately. When BOTH fire + structural results appear in Redis, it merges and publishes final routes.
6. Personnel team has minimal independent work. It waits for all 3 upstream teams, then synthesizes and publishes.

## Implementation Details

In apps/api/src/services/orchestrator.py:

- Split `AgentInstance.analyze()` into `analyze_independent(frame)` and `merge_upstream(independent_result, upstream_context)` 
- The orchestrator spawns all instances with asyncio.gather() at once
- Each instance runs analyze_independent immediately, then polls Redis for its upstream dependencies (use a simple polling loop with asyncio.sleep(0.5), timeout after 30s)
- When upstream data appears, instance calls merge_upstream and writes final result to Redis
- Consensus logic stays the same (runs after all instances in a team have written final results)

Redis gate pattern:
- Each team checks for upstream keys: simulation:{id}:{upstream_team} 
- Fire team: no gates, runs immediately
- Structural team: gates on simulation:{id}:fire_severity
- Evacuation team: gates on simulation:{id}:fire_severity AND simulation:{id}:structural
- Personnel team: gates on all three

The WebSocket and API endpoints don't change. The frontend still sees progressive results as teams complete. The difference is just faster total latency because teams overlap their independent work.

Keep all existing endpoints, schemas, and Redis key patterns. This is a refactor of the orchestrator internals only.

Update ryun_tasks.md and ryun_log.md when done.