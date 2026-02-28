"use client";

import { useEffect, useMemo, useState } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { AGENTS_WS_URL } from "@/lib/constants";
import type { AgentNode } from "@/types";

const fallback: AgentNode[] = [
  {
    id: "seed-openclaw-1",
    node_type: "hybrid",
    status: "active",
  },
];

export function useAgentNetwork() {
  const [nodes, setNodes] = useState<AgentNode[]>(fallback);
  const { send } = useWebSocket<{ nodes: AgentNode[] }>(AGENTS_WS_URL, (message) => {
    if (message.nodes) setNodes(message.nodes);
  });

  useEffect(() => {
    send({ type: "subscribe", payload: true });
  }, [send]);

  return useMemo(() => nodes, [nodes]);
}
