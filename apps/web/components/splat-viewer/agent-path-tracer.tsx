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
  lagSeconds?: number; // how far the agent trails the camera (default 1.5)
  onRoomReached?: (room: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGENT_RADIUS = 0.025;
const AGENT_COLOR = "#66d9ff";
const TRAIL_COLOR = "#66d9ff";
const GLOW_INTENSITY = 2;
const GLOW_DISTANCE = 0.6;

interface PosEntry {
  time: number;
  x: number;
  y: number;
  z: number;
}

const MAX_HISTORY = 1200;
const TRAIL_SAMPLE_INTERVAL = 0.05;
const TRAIL_LIFETIME = 3; // seconds — trail points older than this are dropped

// ---------------------------------------------------------------------------
// AgentPathTracer — follows the camera with a configurable lag
// ---------------------------------------------------------------------------

export function AgentPathTracer({
  active,
  lagSeconds = 1.5,
  onRoomReached,
}: AgentPathTracerProps) {
  const agentRef = useRef<THREE.Mesh>(null);
  const trailRef = useRef<THREE.BufferGeometry>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  const historyRef = useRef<PosEntry[]>([]);
  // Trail stores timestamped points so old ones can expire
  const trailRef2 = useRef<{ time: number; x: number; y: number; z: number }[]>([]);
  const lastTrailTimeRef = useRef(0);
  const lastRoomRef = useRef<string | null>(null);
  const _agentPos = useRef(new THREE.Vector3());

  // Reset trail + history when toggled off then back on
  const prevActiveRef = useRef(active);
  useEffect(() => {
    if (active && !prevActiveRef.current) {
      // Re-activated — clear history so the lag starts fresh
      historyRef.current = [];
      trailRef2.current = [];
      lastTrailTimeRef.current = 0;
      lastRoomRef.current = null;

      if (trailRef.current) {
        trailRef.current.setAttribute(
          "position",
          new THREE.BufferAttribute(new Float32Array(0), 3),
        );
      }
    }
    prevActiveRef.current = active;
  }, [active]);

  useFrame(({ camera, clock }) => {
    if (!active) {
      // Hide agent when inactive
      if (agentRef.current) agentRef.current.visible = false;
      if (lightRef.current) lightRef.current.visible = false;
      return;
    }

    const now = clock.elapsedTime;
    const history = historyRef.current;

    // 1. Record camera position every frame
    history.push({
      time: now,
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
    });

    while (history.length > MAX_HISTORY) {
      history.shift();
    }

    // 2. Compute lagged target time
    const targetTime = now - lagSeconds;

    // Not enough history yet — keep agent hidden
    if (history.length === 0 || history[0].time > targetTime) return;

    // 3. Binary search for the two bracketing entries
    let lo = 0;
    let hi = history.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (history[mid].time <= targetTime) lo = mid;
      else hi = mid;
    }

    const a = history[lo];
    const b = history[lo + 1];
    let lx: number, ly: number, lz: number;
    if (b && b.time > a.time) {
      const t = (targetTime - a.time) / (b.time - a.time);
      lx = a.x + (b.x - a.x) * t;
      ly = a.y + (b.y - a.y) * t;
      lz = a.z + (b.z - a.z) * t;
    } else {
      lx = a.x;
      ly = a.y;
      lz = a.z;
    }

    // 4. Show + position agent
    if (agentRef.current) {
      agentRef.current.visible = true;
      agentRef.current.position.set(lx, ly, lz);
    }
    if (lightRef.current) {
      lightRef.current.visible = true;
      lightRef.current.position.set(lx, ly, lz);
    }

    // 5. Sample trail + expire old points
    const trail = trailRef2.current;

    if (now - lastTrailTimeRef.current >= TRAIL_SAMPLE_INTERVAL) {
      lastTrailTimeRef.current = now;
      trail.push({ time: now, x: lx, y: ly, z: lz });
    }

    // Drop points older than TRAIL_LIFETIME
    const cutoff = now - TRAIL_LIFETIME;
    while (trail.length > 0 && trail[0].time < cutoff) {
      trail.shift();
    }

    // Rebuild geometry from surviving points
    if (trailRef.current) {
      if (trail.length >= 2) {
        const arr = new Float32Array(trail.length * 3);
        for (let i = 0; i < trail.length; i++) {
          arr[i * 3] = trail[i].x;
          arr[i * 3 + 1] = trail[i].y;
          arr[i * 3 + 2] = trail[i].z;
        }
        trailRef.current.setAttribute(
          "position",
          new THREE.BufferAttribute(arr, 3),
        );
        trailRef.current.computeBoundingSphere();
      } else {
        trailRef.current.setAttribute(
          "position",
          new THREE.BufferAttribute(new Float32Array(0), 3),
        );
      }
    }

    // 6. Room proximity detection
    _agentPos.current.set(lx, ly, lz);
    const room = findNearestRoom(_agentPos.current);
    if (room && room !== lastRoomRef.current) {
      lastRoomRef.current = room;
      onRoomReached?.(room);
    }
  });

  return (
    <group>
      <line>
        <bufferGeometry ref={trailRef} />
        <lineBasicMaterial color={TRAIL_COLOR} />
      </line>

      <mesh ref={agentRef} visible={false}>
        <sphereGeometry args={[AGENT_RADIUS, 16, 16]} />
        <meshBasicMaterial color={AGENT_COLOR} toneMapped={false} />
      </mesh>

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
