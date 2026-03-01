"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { defaultScenario } from "@/data/agent-scenario";
import type { AlertPushFn } from "./splat-viewer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActiveAlert {
  id: string;
  text: string;
  color: string;
}

interface AgentAlertOverlayProps {
  /** Ref that the 3D scene writes to — overlay registers its push function here. */
  alertPushRef: React.RefObject<AlertPushFn | null>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALERT_DURATION_MS = 5000;

// ---------------------------------------------------------------------------
// AgentAlertOverlay — self-contained DOM overlay.
// Registers a push callback on alertPushRef so the 3D scene can fire alerts
// without any state living in the Canvas parent.
// ---------------------------------------------------------------------------

export function AgentAlertOverlay({ alertPushRef }: AgentAlertOverlayProps) {
  const [alerts, setAlerts] = useState<ActiveAlert[]>([]);
  const nextIdRef = useRef(0);

  // Register push function — called from inside useFrame via queueMicrotask
  useEffect(() => {
    alertPushRef.current = (
      agentId: string,
      text: string,
      _position: [number, number, number],
    ) => {
      const agent = defaultScenario.agents.find((a) => a.id === agentId);
      const color = agent?.color ?? "#66d9ff";
      const id = `alert-${nextIdRef.current++}`;
      setAlerts((prev) => [...prev, { id, text, color }]);
    };

    return () => {
      alertPushRef.current = null;
    };
  }, [alertPushRef]);

  const dismiss = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  if (alerts.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: 15 }}
    >
      <style>{`
        @keyframes alertSlideIn {
          from { opacity: 0; transform: translateX(-12px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      {alerts.map((alert, i) => (
        <AlertCard key={alert.id} alert={alert} index={i} onDismiss={dismiss} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AlertCard — single alert with auto-dismiss timer
// ---------------------------------------------------------------------------

function AlertCard({
  alert,
  index,
  onDismiss,
}: {
  alert: ActiveAlert;
  index: number;
  onDismiss: (id: string) => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    timerRef.current = setTimeout(() => onDismiss(alert.id), ALERT_DURATION_MS);
    return () => clearTimeout(timerRef.current);
  }, [alert.id, onDismiss]);

  return (
    <div
      style={{
        position: "absolute",
        top: 16 + index * 44,
        left: 16,
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "oklch(0.16 0.01 45 / 85%)",
        border: `1px solid ${alert.color}40`,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        padding: "6px 12px",
        maxWidth: 360,
        animation: "alertSlideIn 0.3s ease-out",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: alert.color,
          boxShadow: `0 0 5px ${alert.color}`,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontFamily: "var(--font-geist-mono, monospace)",
          fontSize: "9px",
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "oklch(0.9 0 0)",
          lineHeight: 1.4,
        }}
      >
        {alert.text}
      </span>
    </div>
  );
}
