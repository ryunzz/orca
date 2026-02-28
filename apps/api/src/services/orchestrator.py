"""ORCA Agent Orchestrator - Hybrid Parallel Architecture.

Manages 4 specialized teams of agents that collaborate to analyze emergency scenarios:
1. Fire Severity Team - analyzes fire locations, intensity, spread
2. Structural Team - assesses structural integrity (reads fire data)
3. Evacuation Team - computes safe routes (reads fire + structural data)
4. Personnel Team - recommends deployment (reads all team data)

HYBRID PARALLEL EXECUTION:
- All agent instances across all 4 teams spawn simultaneously
- Each team has two phases:
  1. Independent phase: analyze frames without upstream data
  2. Merge phase: incorporate upstream team results from Redis
- Teams poll Redis for upstream dependencies with timeout
- Reduces total latency by overlapping independent work
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from ..redis_client import redis_client

logger = logging.getLogger(__name__)

# Configuration
UPSTREAM_POLL_INTERVAL = 0.5  # seconds between Redis polls
UPSTREAM_TIMEOUT = 30.0  # max seconds to wait for upstream data


class TeamType(str, Enum):
    """Agent team types in execution order."""
    FIRE_SEVERITY = "fire_severity"
    STRUCTURAL = "structural"
    EVACUATION = "evacuation"
    PERSONNEL = "personnel"

    @classmethod
    def execution_order(cls) -> list["TeamType"]:
        """Return teams in execution dependency order."""
        return [cls.FIRE_SEVERITY, cls.STRUCTURAL, cls.EVACUATION, cls.PERSONNEL]

    def dependencies(self) -> list["TeamType"]:
        """Return teams this team depends on (must complete first)."""
        deps = {
            TeamType.FIRE_SEVERITY: [],
            TeamType.STRUCTURAL: [TeamType.FIRE_SEVERITY],
            TeamType.EVACUATION: [TeamType.FIRE_SEVERITY, TeamType.STRUCTURAL],
            TeamType.PERSONNEL: [TeamType.FIRE_SEVERITY, TeamType.STRUCTURAL, TeamType.EVACUATION],
        }
        return deps[self]


@dataclass
class AgentInstance:
    """Single agent instance within a team.

    Implements two-phase analysis:
    1. analyze_independent(): Frame analysis without upstream data
    2. merge_upstream(): Incorporate upstream results into final output
    """
    instance_id: str
    team_type: TeamType
    status: str = "idle"

    async def analyze_independent(self, frame_path: str) -> dict[str, Any]:
        """Phase 1: Analyze frame independently without upstream data.

        Returns partial result that can be computed from frame alone.
        This runs immediately when instance spawns.
        """
        self.status = "analyzing_independent"
        timestamp = datetime.now(timezone.utc).isoformat()

        base = {
            "timestamp": timestamp,
            "confidence": 0.85 + (hash(self.instance_id) % 10) / 100,
            "frame_refs": [frame_path],
            "phase": "independent",
        }

        if self.team_type == TeamType.FIRE_SEVERITY:
            # Fire team has no dependencies - independent phase IS the full analysis
            return await self._generate_fire_result(base)

        elif self.team_type == TeamType.STRUCTURAL:
            # Independent: object detection, layout mapping from frames
            return {
                **base,
                "independent_analysis": {
                    "detected_structures": ["walls", "columns", "floors", "ceiling"],
                    "layout_mapping": {
                        "zones_identified": ["zone_A1", "zone_A2", "zone_B1"],
                        "passages_identified": ["door_A1_A2", "corridor_1"],
                    },
                    "baseline_integrity": 0.85,  # Before fire damage assessment
                },
            }

        elif self.team_type == TeamType.EVACUATION:
            # Independent: spatial pathfinding, exit identification from frames
            return {
                **base,
                "independent_analysis": {
                    "exits_identified": [
                        {"exit_id": "exit_north", "location": "lobby", "type": "main_entrance"},
                        {"exit_id": "exit_south", "location": "zone_C1", "type": "emergency"},
                    ],
                    "base_paths": [
                        {"from": "zone_B1", "to": "exit_north", "distance_meters": 50},
                        {"from": "zone_B1", "to": "exit_south", "distance_meters": 75},
                    ],
                    "spatial_graph_built": True,
                },
            }

        else:  # PERSONNEL
            # Personnel has minimal independent work - mostly synthesis
            return {
                **base,
                "independent_analysis": {
                    "scene_type": "structure_fire",
                    "estimated_building_size": "medium",
                    "baseline_response": "2-alarm",
                },
            }

    async def merge_upstream(
        self,
        independent_result: dict[str, Any],
        upstream_context: dict[str, Any]
    ) -> dict[str, Any]:
        """Phase 2: Merge upstream team results into final output.

        Takes independent analysis and enriches with upstream data.
        """
        self.status = "merging"

        # Update timestamp for merge phase
        independent_result["merge_timestamp"] = datetime.now(timezone.utc).isoformat()
        independent_result["phase"] = "merged"

        if self.team_type == TeamType.FIRE_SEVERITY:
            # Fire team has no upstream - independent result IS final
            return independent_result

        elif self.team_type == TeamType.STRUCTURAL:
            fire_data = upstream_context.get("fire_severity")
            return self._merge_structural(independent_result, fire_data)

        elif self.team_type == TeamType.EVACUATION:
            fire_data = upstream_context.get("fire_severity")
            structural_data = upstream_context.get("structural")
            return self._merge_evacuation(independent_result, fire_data, structural_data)

        else:  # PERSONNEL
            return self._merge_personnel(independent_result, upstream_context)

    async def _generate_fire_result(self, base: dict) -> dict[str, Any]:
        """Generate fire severity result (no merge needed)."""
        return {
            **base,
            "fire_detected": True,
            "overall_severity": "moderate",
            "severity_score": 0.6,
            "fire_locations": [
                {
                    "zone_id": "zone_A1",
                    "intensity": "moderate",
                    "intensity_score": 0.55,
                    "coordinates": {"x": 10.5, "y": 20.3, "z": 0},
                    "spread_direction": "east",
                    "estimated_temperature": 450,
                }
            ],
            "fuel_sources": [
                {"type": "furniture", "zone_id": "zone_A1", "hazard_level": "moderate"}
            ],
            "smoke_conditions": {
                "visibility": "moderate",
                "toxicity_risk": "moderate",
                "affected_zones": ["zone_A1", "zone_A2"],
            },
            "spread_prediction": {
                "rate": "moderate",
                "at_risk_zones": ["zone_A2", "zone_B1"],
                "containment_difficulty": "moderate",
            },
        }

    def _merge_structural(
        self,
        independent: dict[str, Any],
        fire_data: dict[str, Any] | None
    ) -> dict[str, Any]:
        """Merge fire data into structural analysis."""
        # Start with independent analysis
        result = {
            **independent,
            "overall_integrity": "compromised" if fire_data else "intact",
            "integrity_score": 0.7 if fire_data else 0.85,
            "zones": [
                {
                    "zone_id": "zone_A1",
                    "integrity_status": "major_damage" if fire_data else "intact",
                    "integrity_score": 0.5 if fire_data else 0.9,
                    "safe_to_enter": False if fire_data else True,
                    "fire_exposure_level": "high" if fire_data else "none",
                    "damage_type": ["thermal", "smoke"] if fire_data else [],
                    "hazards": ["ceiling collapse risk"] if fire_data else [],
                },
                {
                    "zone_id": "zone_A2",
                    "integrity_status": "minor_damage" if fire_data else "intact",
                    "integrity_score": 0.8,
                    "safe_to_enter": True,
                    "fire_exposure_level": "moderate" if fire_data else "none",
                    "damage_type": ["smoke"] if fire_data else [],
                    "hazards": [],
                },
            ],
            "blocked_passages": [
                {
                    "passage_id": "door_A1_A2",
                    "from_zone": "zone_A1",
                    "to_zone": "zone_A2",
                    "blocked_reason": "debris" if fire_data else "none",
                    "clearable": True,
                    "clearing_difficulty": "moderate",
                }
            ] if fire_data else [],
            "load_bearing_status": {
                "walls_compromised": [],
                "columns_compromised": [],
                "floor_integrity": {"floor_1": "caution" if fire_data else "safe", "floor_2": "safe"},
                "roof_status": "intact",
            },
            "degradation_timeline": {
                "current_risk": "moderate" if fire_data else "low",
                "time_to_critical": 30 if fire_data else None,
                "collapse_zones": ["zone_A1"] if fire_data else [],
                "recommended_evacuation_deadline": 20 if fire_data else None,
            },
            "fire_context_used": fire_data is not None,
        }
        return result

    def _merge_evacuation(
        self,
        independent: dict[str, Any],
        fire_data: dict[str, Any] | None,
        structural_data: dict[str, Any] | None
    ) -> dict[str, Any]:
        """Merge fire + structural data into evacuation routes."""
        # Adjust safety scores based on upstream data
        base_safety = 0.9
        if fire_data:
            base_safety -= 0.2
        if structural_data and structural_data.get("overall_integrity") == "compromised":
            base_safety -= 0.1

        return {
            **independent,
            "civilian_routes": [
                {
                    "route_id": "civ_route_1",
                    "priority": 1,
                    "start_zone": "zone_B1",
                    "exit_point": "exit_north",
                    "path": ["zone_B1", "corridor_1", "lobby", "exit_north"],
                    "safety_score": base_safety,
                    "estimated_time_seconds": 45,
                    "distance_meters": 50,
                    "hazards_along_route": [],
                    "accessibility": "full",
                    "capacity": 50,
                    "status": "open",
                }
            ],
            "firefighter_routes": [
                {
                    "route_id": "ff_route_1",
                    "entry_point": "entry_south",
                    "target_zone": "zone_A1",
                    "purpose": "fire_attack",
                    "path": ["entry_south", "corridor_2", "zone_A2", "zone_A1"],
                    "safety_score": 0.6,
                    "structural_risk": "moderate" if structural_data else "unknown",
                    "fire_exposure": "heavy" if fire_data else "unknown",
                    "equipment_required": ["SCBA", "thermal_camera", "halligan"],
                    "estimated_time_seconds": 60,
                    "retreat_path": ["zone_A1", "zone_A2", "corridor_2", "entry_south"],
                }
            ],
            "exits": [
                {
                    "exit_id": "exit_north",
                    "name": "North Exit",
                    "location": {"zone_id": "lobby", "coordinates": {"x": 0, "y": 50}},
                    "status": "open",
                    "capacity_per_minute": 30,
                },
                {
                    "exit_id": "exit_south",
                    "name": "South Exit",
                    "location": {"zone_id": "zone_C1", "coordinates": {"x": 0, "y": -50}},
                    "status": "congested" if fire_data else "open",
                    "capacity_per_minute": 20,
                },
            ],
            "staging_areas": [
                {"area_id": "staging_1", "location": "parking_lot_north", "purpose": "command", "safe": True}
            ],
            "estimated_occupancy": {
                "total": 75,
                "by_zone": {"zone_B1": 30, "zone_B2": 25, "zone_C1": 20},
                "mobility_impaired": 3
            },
            "fire_context_used": fire_data is not None,
            "structural_context_used": structural_data is not None,
        }

    def _merge_personnel(
        self,
        independent: dict[str, Any],
        upstream_context: dict[str, Any]
    ) -> dict[str, Any]:
        """Merge all upstream data into personnel recommendations."""
        fire_data = upstream_context.get("fire_severity")
        structural_data = upstream_context.get("structural")
        evacuation_data = upstream_context.get("evacuation")

        # Determine alarm level based on upstream data
        alarm_level = 1
        if fire_data and fire_data.get("overall_severity") == "moderate":
            alarm_level = 2
        if structural_data and structural_data.get("overall_integrity") == "compromised":
            alarm_level = max(alarm_level, 2)

        return {
            **independent,
            "incident_classification": {
                "type": "structure_fire",
                "alarm_level": alarm_level,
                "complexity": "moderate" if alarm_level >= 2 else "routine",
                "ics_type": 3,
            },
            "team_composition": {
                "total_personnel": 18 if alarm_level >= 2 else 12,
                "units": [
                    {"unit_type": "engine", "count": 2, "role": "fire_attack", "personnel_per_unit": 4, "priority": "immediate"},
                    {"unit_type": "ladder", "count": 1, "role": "ventilation", "personnel_per_unit": 4, "priority": "immediate"},
                    {"unit_type": "rescue", "count": 1, "role": "search_rescue", "personnel_per_unit": 4, "priority": "immediate"},
                    {"unit_type": "battalion_chief", "count": 1, "role": "command", "personnel_per_unit": 1, "priority": "immediate"},
                    {"unit_type": "ems", "count": 1, "role": "medical", "personnel_per_unit": 2, "priority": "supporting"},
                ],
                "minimum_personnel": 14,
                "recommended_reserve": 4,
            },
            "equipment": {
                "critical": [
                    {"item": "SCBA", "quantity": 16, "reason": "Interior operations in smoke"},
                    {"item": "Thermal imaging camera", "quantity": 2, "reason": "Search and fire location"},
                    {"item": "2.5 inch attack line", "quantity": 2, "reason": "Fire attack"},
                ],
                "recommended": [
                    {"item": "Positive pressure fan", "quantity": 1, "reason": "Ventilation"},
                    {"item": "RIT pack", "quantity": 1, "reason": "Rapid intervention"},
                ],
                "special_operations": ["thermal_imaging", "forcible_entry"],
            },
            "approach_strategy": {
                "mode": "offensive" if structural_data and structural_data.get("integrity_score", 1) > 0.5 else "defensive",
                "primary_objective": "Fire suppression with concurrent search and rescue",
                "secondary_objectives": ["Ventilation", "Exposure protection"],
                "tactics": [
                    {"name": "interior_attack", "priority": 1, "assigned_to": "engine", "location": "zone_A1", "notes": "Attack from zone_A2"},
                    {"name": "ventilation", "priority": 2, "assigned_to": "ladder", "location": "roof", "notes": "Vertical ventilation"},
                    {"name": "search_rescue", "priority": 1, "assigned_to": "rescue", "location": "zone_B1", "notes": "Primary search"},
                ],
                "water_supply": {"required_gpm": 500, "hydrant_locations": ["hydrant_north", "hydrant_east"], "supply_lines_needed": 2},
                "command_structure": {"ic_level": "battalion_chief", "divisions": ["Division A", "Division B"], "groups": ["Fire Attack", "Search"]},
            },
            "timing": {
                "eta_first_unit_minutes": 4,
                "eta_full_assignment_minutes": 8,
                "estimated_containment_minutes": 15,
                "estimated_control_minutes": 25,
                "par_check_interval_minutes": 15,
            },
            "safety_considerations": [
                {"concern": "Structural collapse risk in zone_A1", "severity": "high", "mitigation": "Establish collapse zone, monitor with spotter", "source_team": "structural"},
                {"concern": "Rapid fire spread potential", "severity": "moderate", "mitigation": "Establish backup lines", "source_team": "fire_severity"},
            ] if structural_data else [],
            "mutual_aid": {"requested": False, "agencies": [], "resources_requested": []},
            "context_sources": {
                "fire_severity_used": fire_data is not None,
                "structural_used": structural_data is not None,
                "evacuation_used": evacuation_data is not None,
            },
        }


@dataclass
class Team:
    """A team of agent instances that work together with hybrid parallel execution."""
    team_type: TeamType
    instances: list[AgentInstance] = field(default_factory=list)
    num_instances: int = 3

    def __post_init__(self):
        """Initialize team instances."""
        if not self.instances:
            self.instances = [
                AgentInstance(
                    instance_id=f"{self.team_type.value}_{i}",
                    team_type=self.team_type
                )
                for i in range(self.num_instances)
            ]

    async def run_hybrid(
        self,
        simulation_id: str,
        frames: list[str]
    ) -> dict[str, Any]:
        """Run team with hybrid parallel execution.

        1. Start independent analysis immediately
        2. Poll for upstream dependencies
        3. Merge when dependencies available
        4. Compute consensus across instances
        """
        logger.info(f"[{self.team_type.value}] Starting hybrid analysis")
        await redis_client.set_team_status(simulation_id, self.team_type.value, "processing")

        # Phase 1: Run all instances' independent analysis in parallel
        independent_tasks = []
        for instance in self.instances:
            for frame in frames:
                independent_tasks.append(instance.analyze_independent(frame))

        independent_results = await asyncio.gather(*independent_tasks)
        logger.info(f"[{self.team_type.value}] Independent phase complete ({len(independent_results)} results)")

        # Phase 2: Wait for upstream dependencies and merge
        upstream_context = await self._wait_for_upstream(simulation_id)

        # Merge each independent result with upstream context
        merge_tasks = []
        for i, instance in enumerate(self.instances):
            for j, frame in enumerate(frames):
                idx = i * len(frames) + j
                independent_result = independent_results[idx]
                merge_tasks.append(
                    self._run_merge(simulation_id, instance, independent_result, upstream_context)
                )

        final_results = await asyncio.gather(*merge_tasks)
        logger.info(f"[{self.team_type.value}] Merge phase complete")

        # Compute consensus
        consensus = self._compute_consensus(final_results)

        # Store consensus result in Redis
        await redis_client.set_team_result(simulation_id, self.team_type.value, consensus)
        await redis_client.set_team_status(simulation_id, self.team_type.value, "complete")

        logger.info(f"[{self.team_type.value}] Team complete")
        return consensus

    async def _wait_for_upstream(self, simulation_id: str) -> dict[str, Any]:
        """Poll Redis for upstream team dependencies with timeout."""
        dependencies = self.team_type.dependencies()

        if not dependencies:
            # Fire team has no dependencies
            return {}

        logger.info(f"[{self.team_type.value}] Waiting for upstream: {[d.value for d in dependencies]}")

        start_time = asyncio.get_event_loop().time()
        upstream_context = {}

        while True:
            # Check all dependencies
            all_ready = True
            for dep in dependencies:
                if dep.value not in upstream_context:
                    result = await redis_client.get_team_result(simulation_id, dep.value)
                    if result:
                        upstream_context[dep.value] = result
                        logger.info(f"[{self.team_type.value}] Received {dep.value} data")
                    else:
                        all_ready = False

            if all_ready:
                logger.info(f"[{self.team_type.value}] All upstream dependencies ready")
                return upstream_context

            # Check timeout
            elapsed = asyncio.get_event_loop().time() - start_time
            if elapsed > UPSTREAM_TIMEOUT:
                logger.warning(f"[{self.team_type.value}] Timeout waiting for upstream, proceeding with partial data")
                return upstream_context

            # Poll interval
            await asyncio.sleep(UPSTREAM_POLL_INTERVAL)

    async def _run_merge(
        self,
        simulation_id: str,
        instance: AgentInstance,
        independent_result: dict[str, Any],
        upstream_context: dict[str, Any]
    ) -> dict[str, Any]:
        """Run merge phase for a single instance."""
        result = await instance.merge_upstream(independent_result, upstream_context)

        # Store individual instance result for consensus tracking
        await redis_client.add_instance_result(
            simulation_id,
            self.team_type.value,
            instance.instance_id,
            result
        )

        return result

    def _compute_consensus(self, results: list[dict[str, Any]]) -> dict[str, Any]:
        """Compute consensus from multiple instance results."""
        if not results:
            return {}

        if len(results) == 1:
            return results[0]

        consensus = results[0].copy()

        # Average confidence scores
        confidences = [r.get("confidence", 0.8) for r in results]
        consensus["confidence"] = sum(confidences) / len(confidences)

        # Combine frame refs
        all_frame_refs = []
        for r in results:
            all_frame_refs.extend(r.get("frame_refs", []))
        consensus["frame_refs"] = list(set(all_frame_refs))

        # Add consensus metadata
        consensus["consensus_metadata"] = {
            "num_instances": len(results),
            "agreement_score": 0.85,
        }

        return consensus


class Orchestrator:
    """Orchestrates the 4-team agent pipeline with hybrid parallel execution."""

    def __init__(self, instances_per_team: int = 3):
        self.instances_per_team = instances_per_team
        self.active_simulations: dict[str, dict] = {}

    async def run_simulation(
        self,
        simulation_id: str,
        frames: list[str]
    ) -> dict[str, Any]:
        """Run the full agent pipeline with hybrid parallel execution.

        All teams spawn simultaneously. Each team:
        1. Runs independent analysis immediately
        2. Polls Redis for upstream dependencies
        3. Merges upstream data when available
        4. Publishes final result

        This reduces total latency by overlapping independent work.
        """
        logger.info(f"Starting HYBRID PARALLEL pipeline for simulation {simulation_id}")

        # Initialize simulation state in Redis
        await redis_client.set_simulation_status(simulation_id, "analyzing")
        await redis_client.set_simulation_frames(simulation_id, frames)

        # Initialize all teams as processing (they all start immediately)
        for team_type in TeamType.execution_order():
            await redis_client.set_team_status(simulation_id, team_type.value, "processing")

        # Track this simulation
        self.active_simulations[simulation_id] = {
            "status": "analyzing",
            "started_at": datetime.now(timezone.utc).isoformat(),
            "mode": "hybrid_parallel",
        }

        try:
            # Create all teams
            teams = [
                Team(team_type=team_type, num_instances=self.instances_per_team)
                for team_type in TeamType.execution_order()
            ]

            # Spawn ALL teams simultaneously with asyncio.gather()
            logger.info(f"Spawning all {len(teams)} teams simultaneously")
            team_tasks = [team.run_hybrid(simulation_id, frames) for team in teams]
            team_results = await asyncio.gather(*team_tasks)

            # Build results dict
            results = {
                team_type.value: result
                for team_type, result in zip(TeamType.execution_order(), team_results)
            }

            # Mark simulation complete
            await redis_client.set_simulation_status(simulation_id, "complete")
            self.active_simulations[simulation_id]["status"] = "complete"
            self.active_simulations[simulation_id]["completed_at"] = datetime.now(timezone.utc).isoformat()

            logger.info(f"Completed HYBRID PARALLEL pipeline for simulation {simulation_id}")

        except Exception as e:
            logger.error(f"Error in agent pipeline for simulation {simulation_id}: {e}")
            await redis_client.set_simulation_status(simulation_id, "error")
            self.active_simulations[simulation_id]["status"] = "error"
            self.active_simulations[simulation_id]["error"] = str(e)
            raise

        return results

    async def get_simulation_results(self, simulation_id: str) -> dict[str, Any]:
        """Get current results for a simulation."""
        status = await redis_client.get_simulation_status(simulation_id)
        team_statuses = await redis_client.get_team_statuses(simulation_id)
        team_results = await redis_client.get_all_team_results(simulation_id)

        return {
            "simulation_id": simulation_id,
            "status": status or "unknown",
            "teams": {
                team: {
                    "status": team_statuses.get(team, "waiting"),
                    "data": team_results.get(team),
                }
                for team in redis_client.TEAM_TYPES
            },
        }


# Singleton orchestrator instance
orchestrator = Orchestrator()
