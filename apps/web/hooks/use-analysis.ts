"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { API_BASE, WS_BASE } from "@/lib/api-config";
import type {
  AnalysisTeams,
  DemoAnalysisResponse,
  WsMessage,
  TeamName,
} from "@/lib/api-types";

export type ConnectionStatus = "connecting" | "live" | "offline";

export interface AnalysisState {
  teams: Partial<AnalysisTeams>;
  runningTeam: TeamName | null;
  connectionStatus: ConnectionStatus;
  loading: boolean;
}

const INITIAL_STATE: AnalysisState = {
  teams: {},
  runningTeam: null,
  connectionStatus: "offline",
  loading: true,
};

export function useAnalysis(): AnalysisState {
  const [state, setState] = useState<AnalysisState>(INITIAL_STATE);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // REST fetch — instant fallback data
  useEffect(() => {
    let cancelled = false;

    async function fetchDemo() {
      try {
        const res = await fetch(`${API_BASE}/analysis/demo`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: DemoAnalysisResponse = await res.json();
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            teams: data.teams,
            loading: false,
          }));
        }
      } catch {
        // Backend unreachable — keep defaults, stop loading
        if (!cancelled) {
          setState((prev) => ({ ...prev, loading: false }));
        }
      }
    }

    fetchDemo();
    return () => {
      cancelled = true;
    };
  }, []);

  // WebSocket — progressive team streaming
  const connectWs = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setState((prev) => ({ ...prev, connectionStatus: "connecting" }));

    const ws = new WebSocket(`${WS_BASE}/ws/analysis`);
    wsRef.current = ws;

    ws.onopen = () => {
      setState((prev) => ({ ...prev, connectionStatus: "live" }));
      ws.send(JSON.stringify({ frame_path: "demo" }));
    };

    ws.onmessage = (event) => {
      const msg: WsMessage = JSON.parse(event.data);

      if ("team" in msg) {
        if (msg.status === "running") {
          setState((prev) => ({ ...prev, runningTeam: msg.team }));
        } else if (msg.status === "complete") {
          setState((prev) => ({
            ...prev,
            runningTeam: null,
            teams: {
              ...prev.teams,
              [msg.team]: msg.result,
            },
          }));
        }
      } else if (msg.status === "complete" && "all_results" in msg) {
        setState((prev) => ({
          ...prev,
          runningTeam: null,
          teams: msg.all_results.teams,
        }));
      }
    };

    ws.onclose = () => {
      setState((prev) => ({ ...prev, connectionStatus: "offline", runningTeam: null }));
      // Reconnect after 5s
      reconnectTimerRef.current = setTimeout(connectWs, 5000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connectWs();
    return () => {
      reconnectTimerRef.current && clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connectWs]);

  return state;
}
