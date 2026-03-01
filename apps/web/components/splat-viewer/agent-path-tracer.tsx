"use client";

import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import { getPathWaypoints, getRoomIndices } from "@/lib/scene-waypoints";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AgentPathTracerProps {
  path: string[];
  speed?: number; // units per second (default 0.5)
  active: boolean;
  onRoomReached?: (room: string, index: number) => void;
  onComplete?: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGENT_RADIUS = 0.025;
const AGENT_COLOR = "#66d9ff";
const TRAIL_COLOR = "#66d9ff";
const AHEAD_COLOR = "#66d9ff";
const TRAIL_LINE_WIDTH = 2.5;
const AHEAD_LINE_WIDTH = 1;
const AHEAD_OPACITY = 0.15;
const GLOW_INTENSITY = 2;
const GLOW_DISTANCE = 0.6;

// ---------------------------------------------------------------------------
// AgentPathTracer
// ---------------------------------------------------------------------------

export function AgentPathTracer({
  path,
  speed = 0.5,
  active,
  onRoomReached,
  onComplete,
}: AgentPathTracerProps) {
  const agentRef = useRef<THREE.Mesh>(null);
  const trailRef = useRef<THREE.BufferGeometry>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  // Memoize the 3D waypoint path from room names
  const waypoints = useMemo(() => getPathWaypoints(path), [path]);

  // Room boundary indices for triggering callbacks
  const roomIndices = useMemo(
    () => getRoomIndices(path, waypoints.length),
    [path, waypoints.length],
  );

  // Precompute cumulative distances for parameterization
  const { cumulativeDistances, totalLength } = useMemo(() => {
    const dists: number[] = [0];
    let total = 0;
    for (let i = 1; i < waypoints.length; i++) {
      total += waypoints[i].distanceTo(waypoints[i - 1]);
      dists.push(total);
    }
    return { cumulativeDistances: dists, totalLength: total };
  }, [waypoints]);

  // Animation state — using refs to avoid re-renders each frame
  const progressRef = useRef(0); // 0 → totalLength (distance traveled)
  const trailCountRef = useRef(1); // number of trail vertices written
  const completedRef = useRef(false);
  const lastRoomIdxRef = useRef(-1);

  // Reset animation when path or active changes
  useEffect(() => {
    progressRef.current = 0;
    trailCountRef.current = 1;
    completedRef.current = false;
    lastRoomIdxRef.current = -1;

    // Seed the trail geometry with the first point
    if (trailRef.current && waypoints.length > 0) {
      const initial = new Float32Array([
        waypoints[0].x,
        waypoints[0].y,
        waypoints[0].z,
      ]);
      trailRef.current.setAttribute(
        "position",
        new THREE.BufferAttribute(initial, 3),
      );
    }
  }, [path, active, waypoints]);

  // Trail geometry — preallocated buffer
  const trailPositions = useMemo(() => {
    const arr = new Float32Array(waypoints.length * 3);
    if (waypoints.length > 0) {
      arr[0] = waypoints[0].x;
      arr[1] = waypoints[0].y;
      arr[2] = waypoints[0].z;
    }
    return arr;
  }, [waypoints]);

  // Ahead path points for the faint planned route
  const aheadPoints = useMemo(
    () => (waypoints.length >= 2 ? waypoints : undefined),
    [waypoints],
  );

  // ---------------------------------------------------------------------------
  // Frame loop — advance agent, grow trail, fire callbacks
  // ---------------------------------------------------------------------------

  useFrame((_, delta) => {
    if (
      !active ||
      completedRef.current ||
      waypoints.length < 2 ||
      totalLength === 0
    )
      return;

    // Advance distance
    progressRef.current = Math.min(
      progressRef.current + speed * delta,
      totalLength,
    );
    const dist = progressRef.current;

    // Find current segment
    let segIdx = 0;
    for (let i = 1; i < cumulativeDistances.length; i++) {
      if (cumulativeDistances[i] >= dist) {
        segIdx = i - 1;
        break;
      }
      if (i === cumulativeDistances.length - 1) segIdx = i - 1;
    }

    // Interpolate position within segment
    const segStart = cumulativeDistances[segIdx];
    const segEnd = cumulativeDistances[segIdx + 1];
    const segLen = segEnd - segStart;
    const t = segLen > 0 ? (dist - segStart) / segLen : 1;

    const pos = new THREE.Vector3().lerpVectors(
      waypoints[segIdx],
      waypoints[segIdx + 1],
      t,
    );

    // Update agent mesh position
    if (agentRef.current) {
      agentRef.current.position.copy(pos);
    }
    if (lightRef.current) {
      lightRef.current.position.copy(pos);
    }

    // Grow trail — add all waypoints up to current segment + interpolated point
    const targetCount = segIdx + 2; // include current interpolated point
    const count = Math.min(targetCount, waypoints.length);

    for (let i = trailCountRef.current; i < count - 1; i++) {
      trailPositions[i * 3] = waypoints[i].x;
      trailPositions[i * 3 + 1] = waypoints[i].y;
      trailPositions[i * 3 + 2] = waypoints[i].z;
    }

    // Write the current interpolated position at the end
    const writeIdx = count - 1;
    trailPositions[writeIdx * 3] = pos.x;
    trailPositions[writeIdx * 3 + 1] = pos.y;
    trailPositions[writeIdx * 3 + 2] = pos.z;

    trailCountRef.current = count;

    // Update trail geometry
    if (trailRef.current) {
      trailRef.current.setAttribute(
        "position",
        new THREE.BufferAttribute(trailPositions.slice(0, count * 3), 3),
      );
      trailRef.current.computeBoundingSphere();
    }

    // Check room boundary callbacks
    for (const [idx, room] of roomIndices) {
      if (segIdx + 1 >= idx && idx > lastRoomIdxRef.current) {
        lastRoomIdxRef.current = idx;
        onRoomReached?.(room, idx);
      }
    }

    // Check completion
    if (dist >= totalLength) {
      completedRef.current = true;
      onComplete?.();
    }
  });

  if (waypoints.length < 2) return null;

  return (
    <group>
      {/* Faint ahead path — shows the full planned route */}
      {aheadPoints && (
        <Line
          points={aheadPoints}
          color={AHEAD_COLOR}
          lineWidth={AHEAD_LINE_WIDTH}
          opacity={AHEAD_OPACITY}
          transparent
          dashed
          dashSize={0.04}
          gapSize={0.03}
        />
      )}

      {/* Progressive trail line — geometry built imperatively in useFrame */}
      <line>
        <bufferGeometry ref={trailRef} />
        <lineBasicMaterial color={TRAIL_COLOR} linewidth={TRAIL_LINE_WIDTH} />
      </line>

      {/* Agent dot — glowing sphere */}
      <mesh ref={agentRef} position={waypoints[0].toArray()}>
        <sphereGeometry args={[AGENT_RADIUS, 16, 16]} />
        <meshBasicMaterial color={AGENT_COLOR} toneMapped={false} />
      </mesh>

      {/* Point light for glow effect */}
      <pointLight
        ref={lightRef}
        color={AGENT_COLOR}
        intensity={GLOW_INTENSITY}
        distance={GLOW_DISTANCE}
        position={waypoints[0].toArray()}
      />
    </group>
  );
}
