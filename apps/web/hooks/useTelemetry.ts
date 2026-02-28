"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { TELEMETRY_WS_URL } from "@/lib/constants";
import type { TelemetryEvent } from "@/types";

export function useTelemetry(simulationId: string) {
  const ws = useMemo(() => `${TELEMETRY_WS_URL}/telemetry/${simulationId}`, [simulationId]);
  const [lastEvent, setLastEvent] = useState<TelemetryEvent | null>(null);

  const { send } = useWebSocket<TelemetryEvent>(ws, () => undefined);
  const sendEvent = useCallback((event: Omit<TelemetryEvent, "timestamp_ms" | "user_id">) => {
    const payload: TelemetryEvent = {
      ...event,
      timestamp_ms: Date.now(),
      user_id: "web-user",
      simulation_id: simulationId,
    };
    setLastEvent(payload);
    send(payload);
  }, [send, simulationId]);

  return { sendEvent, lastEvent };
}

export function useTelemetryStream(simulationId: string) {
  const [samples, setSamples] = useState<TelemetryEvent[]>([]);
  const ws = useMemo(() => `${TELEMETRY_WS_URL}/telemetry/${simulationId}`, [simulationId]);

  useWebSocket<TelemetryEvent>(ws, (sample) => {
    setSamples((prev) => [...prev.slice(-199), sample]);
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setSamples((prev) =>
        prev.length === 0
          ? prev
          : [...prev.slice(-199), {
              simulation_id: simulationId,
              user_id: "tick",
              position: prev[prev.length - 1].position,
              rotation: prev[prev.length - 1].rotation,
              action: "heartbeat",
              timestamp_ms: Date.now(),
            }],
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [simulationId]);

  return {
    samples,
    latest: samples[samples.length - 1] ?? null,
  };
}
