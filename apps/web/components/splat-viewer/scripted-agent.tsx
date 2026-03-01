"use client";

import { Suspense, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import * as THREE from "three";
import type { AgentConfig, ScriptedWaypoint } from "@/lib/agent-paths";

// ---------------------------------------------------------------------------
// Props — active / activePath are refs so the memo'd Canvas parent never
// needs to re-render for the agents to pick up changes.
// ---------------------------------------------------------------------------

interface ScriptedAgentProps {
  config: AgentConfig;
  activePathRef: React.RefObject<"primary" | "alternate">;
  activeRef: React.RefObject<boolean>;
  onAlert?: (agentId: string, text: string, position: [number, number, number]) => void;
  onComplete?: (agentId: string) => void;
}

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------

const AGENT_RADIUS = 0.05;
const GLOW_INTENSITY = 2.5;
const GLOW_DISTANCE = 0.8;

const FLOOR_Y = -0.35;
const AGENT_Y_OFFSET = -0.15;
const MAX_SPEED = 1.2;
const SMOOTHING = 4.0;
const BOB_AMPLITUDE = 0.008;
const BOB_FREQUENCY = 5.0;
const DRIFT_AMPLITUDE = 0.015;
const DRIFT_FREQUENCY = 1.3;

const ARRIVAL_THRESHOLD = 0.03;

const TRAIL_SAMPLE_INTERVAL = 0.016;
const TRAIL_LIFETIME = 4.5;

// Pre-allocate enough slots for the max trail length
const MAX_TRAIL_POINTS = Math.ceil(TRAIL_LIFETIME / TRAIL_SAMPLE_INTERVAL) + 16;

// Alert billboard constants
const ALERT_Y_OFFSET = 0.22;
const ALERT_CARD_WIDTH = 0.62;
const ALERT_CARD_HEIGHT = 0.18;

function phaseOffsetFromId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return ((hash >>> 0) % 6283) / 1000;
}

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
// ScriptedAgent — waypoint state machine with organic movement.
// Reads active/activePath from refs every frame — zero React re-renders.
// ---------------------------------------------------------------------------

export function ScriptedAgent({
  config,
  activePathRef,
  activeRef,
  onAlert,
  onComplete,
}: ScriptedAgentProps) {
  const agentRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const trailLineObj = useMemo(() => new THREE.Line(), []);

  // Pre-allocated trail buffer — written in-place each frame, no allocations
  const trailPosArray = useRef(new Float32Array(MAX_TRAIL_POINTS * 3));
  const trailGeomRef = useRef<THREE.BufferGeometry>(null);
  const trailAttrRef = useRef<THREE.BufferAttribute | null>(null);

  const trailPointsRef = useRef<PosEntry[]>([]);
  const trailStartRef = useRef(0); // logical start index — avoids O(n) shift()
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
  const phaseOffset = useRef(phaseOffsetFromId(config.id));

  // Track which alerts have already fired (by waypoint index)
  const firedAlertsRef = useRef<Set<number>>(new Set());

  // Track previous values for reset detection (read inside useFrame)
  const prevPathRef = useRef<"primary" | "alternate">("primary");
  const prevActiveRef = useRef(false);
  const prevInputsInitializedRef = useRef(false);

  // Alert billboard refs — keyed by waypoint index
  const alertRefsMap = useRef<Map<string, THREE.Group>>(new Map());

  // Collect the alert waypoint indices for each path
  const alertWaypoints = useMemo(() => {
    const result: { pathName: "primary" | "alternate"; wpIndex: number; wp: ScriptedWaypoint }[] = [];
    for (const pathName of ["primary", "alternate"] as const) {
      const wps = config.paths[pathName];
      for (let i = 0; i < wps.length; i++) {
        if (wps[i].alert) {
          result.push({ pathName, wpIndex: i, wp: wps[i] });
        }
      }
    }
    return result;
  }, [config.paths]);

  const resetState = () => {
    waypointIndexRef.current = 0;
    phaseRef.current = "traveling";
    pauseElapsedRef.current = 0;
    completedRef.current = false;
    initialized.current = false;
    trailPointsRef.current = [];
    trailStartRef.current = 0;
    lastTrailTimeRef.current = 0;
    firedAlertsRef.current = new Set();

    // Clear trail draw range
    trailGeomRef.current?.setDrawRange(0, 0);

    // Hide all alert billboards
    alertRefsMap.current.forEach((group) => {
      group.visible = false;
    });
  };

  useFrame(({ clock }, delta) => {
    const active = activeRef.current;
    const activePath = activePathRef.current;

    if (!prevInputsInitializedRef.current) {
      prevInputsInitializedRef.current = true;
      prevPathRef.current = activePath;
      prevActiveRef.current = active;
    }

    // Lazy-init: attach the pre-allocated buffer attribute once
    if (trailGeomRef.current && !trailAttrRef.current) {
      const attr = new THREE.BufferAttribute(trailPosArray.current, 3);
      attr.setUsage(THREE.DynamicDrawUsage);
      trailGeomRef.current.setAttribute("position", attr);
      trailGeomRef.current.setDrawRange(0, 0);
      trailAttrRef.current = attr;
    }

    // Detect changes that require a reset — done inside useFrame, not useEffect
    const pathChanged = activePath !== prevPathRef.current;
    const justActivated = active && !prevActiveRef.current;
    if (pathChanged || justActivated) {
      resetState();
    }
    prevPathRef.current = activePath;
    prevActiveRef.current = active;

    if (!active) {
      if (agentRef.current) agentRef.current.visible = false;
      if (lightRef.current) lightRef.current.visible = false;
      return;
    }

    const waypoints: ScriptedWaypoint[] = config.paths[activePath];

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
          // Fire alert — deferred so React state update happens after frame
          if (wp.alert && !firedAlertsRef.current.has(idx)) {
            firedAlertsRef.current.add(idx);
            const alertArgs = [config.id, wp.alert, wp.coordinates] as const;
            queueMicrotask(() => onAlert?.(...alertArgs));

            // Show 3D billboard
            const key = `${activePath}-${idx}`;
            const alertGroup = alertRefsMap.current.get(key);
            if (alertGroup) alertGroup.visible = true;
          }

          if (wp.delay > 0) {
            phaseRef.current = "paused";
            pauseElapsedRef.current = 0;
          } else {
            if (idx < waypoints.length - 1) {
              waypointIndexRef.current = idx + 1;
            } else {
              completedRef.current = true;
              const id = config.id;
              queueMicrotask(() => onComplete?.(id));
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
            const id = config.id;
            queueMicrotask(() => onComplete?.(id));
          }
        }
      }
    }

    // Walk bob
    const bobFactor = completedRef.current ? 0 : 1;
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

    // Trail — sample + expire (O(1) via start index instead of shift())
    const trail = trailPointsRef.current;
    if (now - lastTrailTimeRef.current >= TRAIL_SAMPLE_INTERVAL) {
      lastTrailTimeRef.current = now;
      trail.push({ time: now, x: sp.x, y: finalY, z: sp.z });
    }

    const cutoff = now - TRAIL_LIFETIME;
    let start = trailStartRef.current;
    while (start < trail.length && trail[start].time < cutoff) {
      start++;
    }
    trailStartRef.current = start;

    // Compact when dead entries exceed half the array to bound memory
    if (start > trail.length / 2 && start > 64) {
      trailPointsRef.current = trail.slice(start);
      trailStartRef.current = 0;
    }

    // Update pre-allocated trail buffer in-place (zero allocations)
    const buf = trailPosArray.current;
    const liveTrail = trailPointsRef.current;
    const liveStart = trailStartRef.current;
    const count = Math.min(liveTrail.length - liveStart, MAX_TRAIL_POINTS);
    for (let i = 0; i < count; i++) {
      const entry = liveTrail[liveStart + i];
      buf[i * 3] = entry.x;
      buf[i * 3 + 1] = entry.y;
      buf[i * 3 + 2] = entry.z;
    }
    if (trailAttrRef.current) {
      trailAttrRef.current.needsUpdate = true;
    }
    if (trailGeomRef.current) {
      trailGeomRef.current.setDrawRange(0, count);
      if (count >= 2) {
        trailGeomRef.current.computeBoundingSphere();
      }
    }
  });

  return (
    <group>
      {/* Thin continuous trail */}
      <primitive object={trailLineObj} renderOrder={9} frustumCulled={false}>
        <bufferGeometry ref={trailGeomRef} attach="geometry" />
        <lineBasicMaterial
          attach="material"
          color={config.color}
          transparent
          opacity={0.95}
          depthWrite={false}
          depthTest={false}
          linewidth={1}
          blending={THREE.NormalBlending}
          toneMapped={false}
        />
      </primitive>

      {/* Agent sphere */}
      <mesh ref={agentRef} visible={false}>
        <sphereGeometry args={[AGENT_RADIUS, 24, 24]} />
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

      {/* 3D alert billboards — pre-rendered, revealed via ref on arrival */}
      {alertWaypoints.map(({ pathName, wpIndex, wp }) => {
        const key = `${pathName}-${wpIndex}`;
        return (
          <group
            key={key}
            ref={(el) => {
              if (el) alertRefsMap.current.set(key, el);
              else alertRefsMap.current.delete(key);
            }}
            position={[
              wp.coordinates[0],
              FLOOR_Y + AGENT_Y_OFFSET + ALERT_Y_OFFSET,
              wp.coordinates[2],
            ]}
            visible={false}
          >
            <Suspense fallback={null}>
              <Billboard follow lockX={false} lockY={false} lockZ={false}>
                {/* Dark semi-transparent card background */}
                <mesh position={[0, 0, 0]}>
                  <planeGeometry args={[ALERT_CARD_WIDTH, ALERT_CARD_HEIGHT]} />
                  <meshBasicMaterial
                    color="#1a1a1a"
                    transparent
                    opacity={0.85}
                    depthTest={true}
                    side={THREE.DoubleSide}
                  />
                </mesh>

                {/* Agent-colored left accent bar */}
                <mesh position={[-ALERT_CARD_WIDTH / 2 + 0.008, 0, 0.001]}>
                  <planeGeometry args={[0.016, ALERT_CARD_HEIGHT]} />
                  <meshBasicMaterial
                    color={config.color}
                    depthTest={true}
                    side={THREE.DoubleSide}
                  />
                </mesh>

                {/* Octagonal warning icon */}
                <mesh position={[-ALERT_CARD_WIDTH / 2 + 0.06, 0.04, 0.001]}>
                  <circleGeometry args={[0.02, 8]} />
                  <meshBasicMaterial
                    color="#ff4444"
                    depthTest={true}
                  />
                </mesh>

                {/* Agent label */}
                <Text
                  position={[-ALERT_CARD_WIDTH / 2 + 0.1, 0.042, 0.001]}
                  fontSize={0.03}
                  color={config.color}
                  anchorX="left"
                  anchorY="middle"
                  fontWeight={700}
                >
                  {config.label.toUpperCase()}
                </Text>

                {/* Alert text */}
                <Text
                  position={[-ALERT_CARD_WIDTH / 2 + 0.035, -0.038, 0.001]}
                  fontSize={0.024}
                  color="#e0e0e0"
                  anchorX="left"
                  anchorY="middle"
                  maxWidth={ALERT_CARD_WIDTH - 0.07}
                  fontWeight={600}
                >
                  {wp.alert}
                </Text>
              </Billboard>
            </Suspense>
          </group>
        );
      })}
    </group>
  );
}
