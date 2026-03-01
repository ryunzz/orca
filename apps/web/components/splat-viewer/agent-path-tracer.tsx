"use client";

import { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { findNearestRoom } from "@/lib/scene-waypoints";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AgentPathTracerProps {
  active: boolean;
  lagSeconds?: number;
  onRoomReached?: (room: string) => void;
}

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------

const AGENT_RADIUS = 0.02;
const AGENT_COLOR = "#66d9ff";
const TRAIL_COLOR = "#66d9ff";
const GLOW_INTENSITY = 1.5;
const GLOW_DISTANCE = 0.5;

// Floor height — agent stays grounded at this Y in the splat scene
const FLOOR_Y = -0.35;
// How far below the camera's XZ the agent walks (offset toward the ground)
const AGENT_Y_OFFSET = -0.15;
// Max walk speed in units/sec — agent can't teleport
const MAX_SPEED = 1.2;
// Exponential smoothing factor (0–1). Lower = smoother/laggier movement.
const SMOOTHING = 4.0;
// Subtle walk bob amplitude and frequency
const BOB_AMPLITUDE = 0.008;
const BOB_FREQUENCY = 5.0;
// Organic drift — slight sine-based lateral wander
const DRIFT_AMPLITUDE = 0.015;
const DRIFT_FREQUENCY = 1.3;

// Camera history + trail
const MAX_HISTORY = 1200;
const TRAIL_SAMPLE_INTERVAL = 0.04;
const TRAIL_LIFETIME = 3.5;

interface PosEntry {
  time: number;
  x: number;
  y: number;
  z: number;
}

// ---------------------------------------------------------------------------
// AgentPathTracer — follows the camera with realistic movement
// ---------------------------------------------------------------------------

export function AgentPathTracer({
  active,
  lagSeconds = 1.5,
  onRoomReached,
}: AgentPathTracerProps) {
  const agentRef = useRef<THREE.Mesh>(null);
  const trailGeomRef = useRef<THREE.BufferGeometry>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  const historyRef = useRef<PosEntry[]>([]);
  const trailPointsRef = useRef<PosEntry[]>([]);
  const lastTrailTimeRef = useRef(0);
  const lastRoomRef = useRef<string | null>(null);

  // Smoothed agent position — persists across frames
  const smoothPos = useRef(new THREE.Vector3(0, FLOOR_Y, -2));
  const initialized = useRef(false);
  const _roomCheck = useRef(new THREE.Vector3());

  // Reset when toggled back on
  const prevActiveRef = useRef(active);
  useEffect(() => {
    if (active && !prevActiveRef.current) {
      historyRef.current = [];
      trailPointsRef.current = [];
      lastTrailTimeRef.current = 0;
      lastRoomRef.current = null;
      initialized.current = false;

      if (trailGeomRef.current) {
        trailGeomRef.current.setAttribute(
          "position",
          new THREE.BufferAttribute(new Float32Array(0), 3),
        );
      }
    }
    prevActiveRef.current = active;
  }, [active]);

  useFrame(({ camera, clock }, delta) => {
    if (!active) {
      if (agentRef.current) agentRef.current.visible = false;
      if (lightRef.current) lightRef.current.visible = false;
      return;
    }

    const now = clock.elapsedTime;
    const history = historyRef.current;

    // 1. Record camera position
    history.push({
      time: now,
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
    });
    while (history.length > MAX_HISTORY) {
      history.shift();
    }

    // 2. Look up where the camera was lagSeconds ago
    const targetTime = now - lagSeconds;
    if (history.length === 0 || history[0].time > targetTime) return;

    // Binary search for bracketing entries
    let lo = 0;
    let hi = history.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (history[mid].time <= targetTime) lo = mid;
      else hi = mid;
    }

    const a = history[lo];
    const b = history[lo + 1];
    let rawX: number, rawZ: number;
    if (b && b.time > a.time) {
      const t = (targetTime - a.time) / (b.time - a.time);
      rawX = a.x + (b.x - a.x) * t;
      rawZ = a.z + (b.z - a.z) * t;
    } else {
      rawX = a.x;
      rawZ = a.z;
    }

    // 3. Compute target position — floor-projected with organic drift
    const drift = Math.sin(now * DRIFT_FREQUENCY) * DRIFT_AMPLITUDE;
    const targetX = rawX + drift;
    const targetZ = rawZ + Math.cos(now * DRIFT_FREQUENCY * 0.7) * DRIFT_AMPLITUDE;

    // 4. Smoothly move toward target with speed cap
    if (!initialized.current) {
      smoothPos.current.set(targetX, FLOOR_Y, targetZ);
      initialized.current = true;
    }

    const sp = smoothPos.current;
    const dx = targetX - sp.x;
    const dz = targetZ - sp.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

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

    // Walk bob — only when actually moving
    const speed = moveLen / Math.max(delta, 0.001);
    const bobFactor = Math.min(speed / 0.5, 1); // ramp bob with speed
    const bob = Math.sin(now * BOB_FREQUENCY) * BOB_AMPLITUDE * bobFactor;
    const finalY = FLOOR_Y + AGENT_Y_OFFSET + bob;

    // 5. Position agent + light
    if (agentRef.current) {
      agentRef.current.visible = true;
      agentRef.current.position.set(sp.x, finalY, sp.z);
    }
    if (lightRef.current) {
      lightRef.current.visible = true;
      lightRef.current.position.set(sp.x, finalY + 0.03, sp.z);
    }

    // 6. Trail — sample + expire
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

    // 7. Room proximity
    _roomCheck.current.set(sp.x, FLOOR_Y, sp.z);
    const room = findNearestRoom(_roomCheck.current);
    if (room && room !== lastRoomRef.current) {
      lastRoomRef.current = room;
      onRoomReached?.(room);
    }
  });

  return (
    <group>
      {/* Trail line */}
      <line>
        <bufferGeometry ref={trailGeomRef} />
        <lineBasicMaterial color={TRAIL_COLOR} transparent opacity={0.6} />
      </line>

      {/* Agent sphere */}
      <mesh ref={agentRef} visible={false}>
        <sphereGeometry args={[AGENT_RADIUS, 16, 16]} />
        <meshBasicMaterial color={AGENT_COLOR} toneMapped={false} />
      </mesh>

      {/* Glow */}
      <pointLight
        ref={lightRef}
        color={AGENT_COLOR}
        intensity={GLOW_INTENSITY}
        distance={GLOW_DISTANCE}
        visible={false}
      />
    </group>
  );
}
