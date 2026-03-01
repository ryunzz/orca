"use client";

import { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { AgentConfig, ScriptedWaypoint } from "@/lib/agent-paths";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ScriptedAgentProps {
  config: AgentConfig;
  activePath: "primary" | "alternate";
  active: boolean;
  onAlert?: (agentId: string, text: string, position: [number, number, number]) => void;
  onComplete?: (agentId: string) => void;
}

// ---------------------------------------------------------------------------
// Tuning constants (mirrored from agent-path-tracer.tsx)
// ---------------------------------------------------------------------------

const AGENT_RADIUS = 0.02;
const GLOW_INTENSITY = 1.5;
const GLOW_DISTANCE = 0.5;

const FLOOR_Y = -0.35;
const AGENT_Y_OFFSET = -0.15;
const MAX_SPEED = 1.2;
const SMOOTHING = 4.0;
const BOB_AMPLITUDE = 0.008;
const BOB_FREQUENCY = 5.0;
const DRIFT_AMPLITUDE = 0.015;
const DRIFT_FREQUENCY = 1.3;

const ARRIVAL_THRESHOLD = 0.03;

const TRAIL_SAMPLE_INTERVAL = 0.04;
const TRAIL_LIFETIME = 3.5;

// ---------------------------------------------------------------------------
// Trail entry
// ---------------------------------------------------------------------------

interface PosEntry {
  time: number;
  x: number;
  y: number;
  z: number;
}

// ---------------------------------------------------------------------------
// ScriptedAgent — waypoint state machine with organic movement
// ---------------------------------------------------------------------------

export function ScriptedAgent({
  config,
  activePath,
  active,
  onAlert,
  onComplete,
}: ScriptedAgentProps) {
  const agentRef = useRef<THREE.Mesh>(null);
  const trailGeomRef = useRef<THREE.BufferGeometry>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  const trailPointsRef = useRef<PosEntry[]>([]);
  const lastTrailTimeRef = useRef(0);

  // Waypoint state machine
  const waypointIndexRef = useRef(0);
  const phaseRef = useRef<"traveling" | "paused">("traveling");
  const pauseElapsedRef = useRef(0);
  const completedRef = useRef(false);

  // Smoothed agent position
  const smoothPos = useRef(new THREE.Vector3(0, FLOOR_Y, 0));
  const initialized = useRef(false);

  // Per-agent phase offset for drift so agents don't move in lockstep
  const phaseOffset = useRef(Math.random() * Math.PI * 2);

  // Track which alerts have already fired (by waypoint index)
  const firedAlertsRef = useRef<Set<number>>(new Set());

  // Get the current waypoints array
  const getWaypoints = (): ScriptedWaypoint[] => config.paths[activePath];

  // Reset state machine when activePath changes or agent is toggled on
  const prevPathRef = useRef(activePath);
  const prevActiveRef = useRef(active);

  useEffect(() => {
    const pathChanged = activePath !== prevPathRef.current;
    const justActivated = active && !prevActiveRef.current;

    if (pathChanged || justActivated) {
      waypointIndexRef.current = 0;
      phaseRef.current = "traveling";
      pauseElapsedRef.current = 0;
      completedRef.current = false;
      initialized.current = false;
      trailPointsRef.current = [];
      lastTrailTimeRef.current = 0;
      firedAlertsRef.current = new Set();

      if (trailGeomRef.current) {
        trailGeomRef.current.setAttribute(
          "position",
          new THREE.BufferAttribute(new Float32Array(0), 3),
        );
      }
    }

    prevPathRef.current = activePath;
    prevActiveRef.current = active;
  }, [activePath, active]);

  useFrame(({ clock }, delta) => {
    if (!active) {
      if (agentRef.current) agentRef.current.visible = false;
      if (lightRef.current) lightRef.current.visible = false;
      return;
    }

    const waypoints = getWaypoints();

    // Nothing to do if no waypoints defined
    if (waypoints.length === 0) {
      if (agentRef.current) agentRef.current.visible = false;
      if (lightRef.current) lightRef.current.visible = false;
      return;
    }

    const now = clock.elapsedTime;
    const offset = phaseOffset.current;
    const idx = waypointIndexRef.current;
    const wp = waypoints[idx];

    // Initialize position to first waypoint
    if (!initialized.current) {
      const first = waypoints[0].coordinates;
      smoothPos.current.set(first[0], FLOOR_Y, first[2]);
      initialized.current = true;
    }

    const sp = smoothPos.current;

    if (!completedRef.current) {
      if (phaseRef.current === "traveling") {
        // Compute target with organic drift
        const drift = Math.sin((now + offset) * DRIFT_FREQUENCY) * DRIFT_AMPLITUDE;
        const targetX = wp.coordinates[0] + drift;
        const targetZ =
          wp.coordinates[2] +
          Math.cos((now + offset) * DRIFT_FREQUENCY * 0.7) * DRIFT_AMPLITUDE;

        const dx = targetX - sp.x;
        const dz = targetZ - sp.z;

        // Exponential smoothing toward target
        const smoothStep = 1 - Math.exp(-SMOOTHING * delta);
        let moveX = dx * smoothStep;
        let moveZ = dz * smoothStep;

        // Clamp to max speed
        const moveLen = Math.sqrt(moveX * moveX + moveZ * moveZ);
        const maxMove = MAX_SPEED * delta;
        if (moveLen > maxMove) {
          const scale = maxMove / moveLen;
          moveX *= scale;
          moveZ *= scale;
        }

        sp.x += moveX;
        sp.z += moveZ;

        // Check arrival (distance to raw waypoint, ignoring drift)
        const rawDx = wp.coordinates[0] - sp.x;
        const rawDz = wp.coordinates[2] - sp.z;
        const rawDist = Math.sqrt(rawDx * rawDx + rawDz * rawDz);

        if (rawDist < ARRIVAL_THRESHOLD) {
          // Fire alert if waypoint has one and we haven't fired it yet
          if (wp.alert && !firedAlertsRef.current.has(idx)) {
            firedAlertsRef.current.add(idx);
            onAlert?.(config.id, wp.alert, wp.coordinates);
          }

          if (wp.delay > 0) {
            phaseRef.current = "paused";
            pauseElapsedRef.current = 0;
          } else {
            // Advance immediately
            if (idx < waypoints.length - 1) {
              waypointIndexRef.current = idx + 1;
            } else {
              completedRef.current = true;
              onComplete?.(config.id);
            }
          }
        }
      } else {
        // Paused phase — accumulate time
        pauseElapsedRef.current += delta;
        if (pauseElapsedRef.current >= wp.delay) {
          if (idx < waypoints.length - 1) {
            waypointIndexRef.current = idx + 1;
            phaseRef.current = "traveling";
          } else {
            completedRef.current = true;
            onComplete?.(config.id);
          }
        }
      }
    }

    // Walk bob — scales with movement speed
    const prevX = sp.x;
    const prevZ = sp.z;
    const speed =
      Math.sqrt(
        (sp.x - prevX) * (sp.x - prevX) + (sp.z - prevZ) * (sp.z - prevZ),
      ) / Math.max(delta, 0.001);
    const bobFactor = completedRef.current ? 0 : Math.min(speed / 0.5, 1);
    const idleBob = completedRef.current
      ? 0
      : phaseRef.current === "paused"
        ? Math.sin((now + offset) * 2) * 0.002
        : 0;
    const bob =
      Math.sin((now + offset) * BOB_FREQUENCY) * BOB_AMPLITUDE * bobFactor +
      idleBob;
    const finalY = FLOOR_Y + AGENT_Y_OFFSET + bob;

    // Position agent + light
    if (agentRef.current) {
      agentRef.current.visible = true;
      agentRef.current.position.set(sp.x, finalY, sp.z);
    }
    if (lightRef.current) {
      lightRef.current.visible = true;
      lightRef.current.position.set(sp.x, finalY + 0.03, sp.z);
    }

    // Trail — sample + expire
    const trail = trailPointsRef.current;
    if (now - lastTrailTimeRef.current >= TRAIL_SAMPLE_INTERVAL) {
      lastTrailTimeRef.current = now;
      trail.push({ time: now, x: sp.x, y: finalY, z: sp.z });
    }

    const cutoff = now - TRAIL_LIFETIME;
    while (trail.length > 0 && trail[0].time < cutoff) {
      trail.shift();
    }

    if (trailGeomRef.current) {
      if (trail.length >= 2) {
        const arr = new Float32Array(trail.length * 3);
        for (let i = 0; i < trail.length; i++) {
          arr[i * 3] = trail[i].x;
          arr[i * 3 + 1] = trail[i].y;
          arr[i * 3 + 2] = trail[i].z;
        }
        trailGeomRef.current.setAttribute(
          "position",
          new THREE.BufferAttribute(arr, 3),
        );
        trailGeomRef.current.computeBoundingSphere();
      } else {
        trailGeomRef.current.setAttribute(
          "position",
          new THREE.BufferAttribute(new Float32Array(0), 3),
        );
      }
    }
  });

  return (
    <group>
      {/* Trail line */}
      <line>
        <bufferGeometry ref={trailGeomRef} />
        <lineBasicMaterial
          color={config.color}
          transparent
          opacity={0.6}
        />
      </line>

      {/* Agent sphere */}
      <mesh ref={agentRef} visible={false}>
        <sphereGeometry args={[AGENT_RADIUS, 16, 16]} />
        <meshBasicMaterial color={config.color} toneMapped={false} />
      </mesh>

      {/* Glow */}
      <pointLight
        ref={lightRef}
        color={config.color}
        intensity={GLOW_INTENSITY}
        distance={GLOW_DISTANCE}
        visible={false}
      />
    </group>
  );
}
