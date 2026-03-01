"use client";

import { useRef, useCallback } from "react";
import { ScriptedAgent } from "./scripted-agent";
import type { AgentScenario } from "@/lib/agent-paths";

// ---------------------------------------------------------------------------
// Props — activePath / active are refs so the memo'd Canvas never re-renders
// ---------------------------------------------------------------------------

interface AgentSquadProps {
  scenario: AgentScenario;
  activePathRef: React.RefObject<"primary" | "alternate">;
  activeRef: React.RefObject<boolean>;
  onAlert?: (agentId: string, text: string, position: [number, number, number]) => void;
  onAllComplete?: () => void;
}

// ---------------------------------------------------------------------------
// AgentSquad — maps scenario agents to ScriptedAgent instances
// ---------------------------------------------------------------------------

export function AgentSquad({
  scenario,
  activePathRef,
  activeRef,
  onAlert,
  onAllComplete,
}: AgentSquadProps) {
  const completedSet = useRef<Set<string>>(new Set());

  const handleComplete = useCallback(
    (agentId: string) => {
      completedSet.current.add(agentId);

      const activePath = activePathRef.current;
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
    [scenario, activePathRef, onAllComplete],
  );

  return (
    <group>
      {scenario.agents.map((agent) => (
        <ScriptedAgent
          key={agent.id}
          config={agent}
          activePathRef={activePathRef}
          activeRef={activeRef}
          onAlert={onAlert}
          onComplete={handleComplete}
        />
      ))}
    </group>
  );
}
