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

// Position history entry
interface PosEntry {
  time: number;
  x: number;
  y: number;
  z: number;
}

const MAX_HISTORY = 1200; // ~60s at 20 fps sampling
const TRAIL_SAMPLE_INTERVAL = 0.05; // 50ms between trail point samples
const MAX_TRAIL_POINTS = 2000;

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

  // Ring buffer of camera positions over time
  const historyRef = useRef<PosEntry[]>([]);
  // Flat array of trail XYZ coords the agent has drawn
  const trailCoordsRef = useRef<number[]>([]);
  const lastTrailTimeRef = useRef(0);
  // Track which room we last fired a callback for
  const lastRoomRef = useRef<string | null>(null);
  // Whether the agent has started moving (enough history accumulated)
  const startedRef = useRef(false);

  // Reusable vector for room proximity checks
  const _agentPos = useRef(new THREE.Vector3());

  // Reset state when active toggles
  useEffect(() => {
    historyRef.current = [];
    trailCoordsRef.current = [];
    lastTrailTimeRef.current = 0;
    lastRoomRef.current = null;
    startedRef.current = false;

    if (trailRef.current) {
      trailRef.current.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(0), 3),
      );
    }
  }, [active]);

  // ---------------------------------------------------------------------------
  // Frame loop
  // ---------------------------------------------------------------------------

  useFrame(({ camera, clock }) => {
    if (!active) return;

    const now = clock.elapsedTime;
    const history = historyRef.current;

    // 1. Record camera position
    history.push({
      time: now,
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
    });

    // Trim old entries beyond what we'd ever need
    while (history.length > MAX_HISTORY) {
      history.shift();
    }

    // 2. Compute the target time (lagged)
    const targetTime = now - lagSeconds;

    // Not enough history accumulated yet
    if (history.length === 0 || history[0].time > targetTime) return;

    // 3. Find the lagged position via linear interpolation
    let lx: number, ly: number, lz: number;

    // Binary-ish scan from the end (most recent)
    let lo = 0;
    let hi = history.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (history[mid].time <= targetTime) lo = mid;
      else hi = mid;
    }

    const a = history[lo];
    const b = history[lo + 1];
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

    // Mark started once we have a valid lagged position
    if (!startedRef.current) startedRef.current = true;

    // 4. Update agent mesh + light
    if (agentRef.current) {
      agentRef.current.position.set(lx, ly, lz);
    }
    if (lightRef.current) {
      lightRef.current.position.set(lx, ly, lz);
    }

    // 5. Sample trail points at a steady interval
    if (now - lastTrailTimeRef.current >= TRAIL_SAMPLE_INTERVAL) {
      lastTrailTimeRef.current = now;

      const coords = trailCoordsRef.current;
      coords.push(lx, ly, lz);

      // Cap trail length
      while (coords.length > MAX_TRAIL_POINTS * 3) {
        coords.splice(0, 3);
      }

      // Write to geometry
      if (trailRef.current && coords.length >= 6) {
        const arr = new Float32Array(coords);
        trailRef.current.setAttribute(
          "position",
          new THREE.BufferAttribute(arr, 3),
        );
        trailRef.current.computeBoundingSphere();
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
      {/* Progressive trail line */}
      <line>
        <bufferGeometry ref={trailRef} />
        <lineBasicMaterial color={TRAIL_COLOR} />
      </line>

      {/* Agent dot — glowing sphere */}
      <mesh ref={agentRef} visible={startedRef.current || false}>
        <sphereGeometry args={[AGENT_RADIUS, 16, 16]} />
        <meshBasicMaterial color={AGENT_COLOR} toneMapped={false} />
      </mesh>

      {/* Point light for glow effect */}
      <pointLight
        ref={lightRef}
        color={AGENT_COLOR}
        intensity={GLOW_INTENSITY}
        distance={GLOW_DISTANCE}
      />
    </group>
  );
}
