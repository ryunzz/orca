"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WS_BASE } from "@/lib/api-config";
import {
  type AnalysisState,
  type TeamType,
  type PaymentRecord,
  TEAM_ORDER,
  initialAnalysisState,
} from "@/lib/api-types";

const WS_URL = `${WS_BASE}/ws/analysis`;
const RECONNECT_DELAY_MS = 3_000;

export function useAnalysis() {
  const [state, setState] = useState<AnalysisState>(initialAnalysisState);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // ------- helpers -------
  const resetTeams = useCallback(() => {
    setState((prev) => {
      const teams = { ...prev.teams };
      for (const t of TEAM_ORDER) {
        teams[t] = { status: "pending", result: null };
      }
      return { ...prev, teams, fullResult: null, metrics: null, payments: [], error: null, analyzing: false };
    });
  }, []);

  // ------- message handler -------
  const onMessage = useCallback((ev: MessageEvent) => {
    try {
      const msg = JSON.parse(ev.data as string);

      // Agent micropayment event — must be checked before the generic msg.team guard
      if (msg.event === "payment" && msg.team) {
        const payment: PaymentRecord = {
          team: msg.team as TeamType,
          recipient: msg.recipient as string,
          amount_lamports: msg.amount_lamports as number,
          tx_signature: msg.tx_signature as string,
          status: (msg.status as PaymentRecord["status"]) ?? "submitted",
          timestamp: Date.now(),
        };
        setState((prev) => ({ ...prev, payments: [...prev.payments, payment] }));
        return;
      }

      // Per-team status update
      if (msg.team) {
        const team = msg.team as TeamType;
        setState((prev) => ({
          ...prev,
          teams: {
            ...prev.teams,
            [team]: {
              status: msg.status as "running" | "complete",
              result: msg.result ?? prev.teams[team].result,
            },
          },
        }));
        return;
      }

      // Metrics event (sent before final complete)
      if (msg.event === "metrics") {
        setState((prev) => ({ ...prev, metrics: msg.metrics }));
        return;
      }

      // Final complete
      if (msg.status === "complete" && msg.all_results) {
        setState((prev) => ({
          ...prev,
          analyzing: false,
          fullResult: msg.all_results,
          metrics: msg.all_results.metrics ?? prev.metrics,
        }));
        return;
      }

      // Error
      if (msg.status === "error") {
        setState((prev) => ({
          ...prev,
          analyzing: false,
          error: msg.error ?? "Unknown analysis error",
        }));
      }
    } catch {
      // Malformed JSON — ignore
    }
  }, []);

  // ------- connect -------
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setState((prev) => ({ ...prev, connected: true, error: null }));
    };

    ws.onmessage = onMessage;

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setState((prev) => ({ ...prev, connected: false }));
      // Auto-reconnect
      reconnectTimer.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, RECONNECT_DELAY_MS);
    };

    ws.onerror = () => {
      // onclose will fire after this — reconnect handled there
    };

    wsRef.current = ws;
  }, [onMessage]);

  // ------- start analysis -------
  const startAnalysis = useCallback(
    (framePath: string, frameId: string, simulationId?: string) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      resetTeams();
      setState((prev) => ({ ...prev, analyzing: true }));

      ws.send(
        JSON.stringify({
          frame_path: framePath,
          frame_id: frameId,
          simulation_id: simulationId ?? "ws_session",
        })
      );
    },
    [resetTeams]
  );

  const startDemo = useCallback(() => {
    startAnalysis("demo", "demo_frame");
  }, [startAnalysis]);

  // ------- lifecycle -------
  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  return {
    state,
    startAnalysis,
    startDemo,
    isConnected: state.connected,
  };
}
