"use client";

import { useAgentNetwork } from "@/hooks/useAgentNetwork";
import { NodeCard } from "./NodeCard";

export function AgentNetwork() {
  const nodes = useAgentNetwork();

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {nodes.length === 0 ? (
        <p className="text-sm text-slate-400">No connected nodes detected.</p>
      ) : (
        nodes.map((node) => <NodeCard key={node.id} node={node} />)
      )}
    </div>
  );
}
