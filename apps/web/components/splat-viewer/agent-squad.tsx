"use client";

import { useRef, useCallback } from "react";
import { ScriptedAgent } from "./scripted-agent";
import type { AgentScenario } from "@/lib/agent-paths";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AgentSquadProps {
  scenario: AgentScenario;
  activePath: "primary" | "alternate";
  active: boolean;
  onAlert?: (agentId: string, text: string, position: [number, number, number]) => void;
  onAllComplete?: () => void;
}

// ---------------------------------------------------------------------------
// AgentSquad — maps scenario agents to ScriptedAgent instances
// ---------------------------------------------------------------------------

export function AgentSquad({
  scenario,
  activePath,
  active,
  onAlert,
  onAllComplete,
}: AgentSquadProps) {
  const completedSet = useRef<Set<string>>(new Set());

  const handleComplete = useCallback(
    (agentId: string) => {
      completedSet.current.add(agentId);

      // Check if every agent with waypoints has completed
      const agentsWithPaths = scenario.agents.filter(
        (a) => a.paths[activePath].length > 0,
      );
      if (
        agentsWithPaths.length > 0 &&
        agentsWithPaths.every((a) => completedSet.current.has(a.id))
      ) {
        onAllComplete?.();
      }
    },
    [scenario, activePath, onAllComplete],
  );

  return (
    <group>
      {scenario.agents.map((agent) => (
        <ScriptedAgent
          key={agent.id}
          config={agent}
          activePath={activePath}
          active={active}
          onAlert={onAlert}
          onComplete={handleComplete}
        />
      ))}
    </group>
  );
}
