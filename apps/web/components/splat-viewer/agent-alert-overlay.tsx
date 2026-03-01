"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActiveAlert {
  id: string;
  agentId: string;
  text: string;
  color: string;
  position: [number, number, number];
  createdAt: number; // clock.elapsedTime when spawned
}

interface AgentAlertOverlayProps {
  alerts: ActiveAlert[];
  onDismiss: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALERT_DURATION = 5; // seconds before auto-dismiss
const POLE_HEIGHT = 0.12; // height of the vertical anchor line
const FLOOR_Y = -0.35;
const AGENT_Y_OFFSET = -0.15;

// ---------------------------------------------------------------------------
// Single alert flag — 3D positioned with Html overlay
// ---------------------------------------------------------------------------

function AlertFlag({
  alert,
  onDismiss,
}: {
  alert: ActiveAlert;
  onDismiss: (id: string) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const dismissedRef = useRef(false);
  const mountTimeRef = useRef(-1);

  useFrame(({ clock }) => {
    if (dismissedRef.current) return;
    // Capture the clock time on the first frame this flag renders
    if (mountTimeRef.current < 0) {
      mountTimeRef.current = clock.elapsedTime;
    }
    const age = clock.elapsedTime - mountTimeRef.current;
    if (age > ALERT_DURATION) {
      dismissedRef.current = true;
      onDismiss(alert.id);
    }
  });

  const baseY = FLOOR_Y + AGENT_Y_OFFSET;
  const poleTop = baseY + POLE_HEIGHT;

  return (
    <group
      ref={groupRef}
      position={[alert.position[0], 0, alert.position[2]]}
    >
      {/* Vertical anchor line */}
      <mesh position={[0, baseY + POLE_HEIGHT / 2, 0]}>
        <cylinderGeometry args={[0.001, 0.001, POLE_HEIGHT, 4]} />
        <meshBasicMaterial color={alert.color} transparent opacity={0.4} />
      </mesh>

      {/* Html label at top of pole */}
      <Html
        position={[0, poleTop + 0.01, 0]}
        center
        distanceFactor={1.5}
        style={{ pointerEvents: "none" }}
      >
        <div
          style={{
            background: "oklch(0.16 0.01 45 / 85%)",
            border: `1px solid ${alert.color}40`,
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            padding: "4px 10px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            whiteSpace: "nowrap",
            animation: "alertFadeIn 0.3s ease-out",
          }}
        >
          {/* Agent color dot */}
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: alert.color,
              boxShadow: `0 0 4px ${alert.color}`,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: "var(--font-geist-mono, monospace)",
              fontSize: "8px",
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "oklch(0.9 0 0)",
            }}
          >
            {alert.text}
          </span>
        </div>
      </Html>
    </group>
  );
}

// ---------------------------------------------------------------------------
// AgentAlertOverlay — renders all active alerts
// ---------------------------------------------------------------------------

export function AgentAlertOverlay({
  alerts,
  onDismiss,
}: AgentAlertOverlayProps) {
  return (
    <group>
      {alerts.map((alert) => (
        <AlertFlag key={alert.id} alert={alert} onDismiss={onDismiss} />
      ))}

      {/* Inject fade-in animation — Html doesn't inherit R3F styles */}
      {alerts.length > 0 && (
        <Html>
          <style>{`
            @keyframes alertFadeIn {
              from { opacity: 0; transform: translateY(4px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>
        </Html>
      )}
    </group>
  );
}
