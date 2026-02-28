"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const PARTICLE_COUNT = 18000;
const FADE_DURATION = 1.6;

type Phase = "idle" | "fadeout" | "done";

interface SplatRevealProps {
  isLoaded: boolean;
  onComplete: () => void;
}

export function SplatReveal({ isLoaded, onComplete }: SplatRevealProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const geoRef = useRef<THREE.BufferGeometry>(null);
  const matRef = useRef<THREE.PointsMaterial>(null);
  const backdropMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const phaseRef = useRef<Phase>("idle");
  const fadeTimeRef = useRef(0);
  const idleTimeRef = useRef(0);
  const completedRef = useRef(false);

  const { positions, origins, colors } = useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const origins = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const roll = Math.random();
      let x: number, y: number, z: number;

      if (roll < 0.58) {
        // ── Ground plane (58%) ──────────────────────────────────────────────
        z = Math.random() * 14;
        x = (Math.random() * 2 - 1) * (z + 1.5) * 0.55;
        y = -1.0 + (Math.random() * 2 - 1) * 0.18;
      } else if (roll < 0.73) {
        // ── Left structure (15%) ────────────────────────────────────────────
        x = -(2.0 + Math.random() * 2.5);
        y = -1.0 + Math.random() * 5.5;
        z = 2 + Math.random() * 11;
      } else if (roll < 0.88) {
        // ── Right structure (15%) ───────────────────────────────────────────
        x = 2.0 + Math.random() * 2.5;
        y = -1.0 + Math.random() * 5.5;
        z = 2 + Math.random() * 11;
      } else {
        // ── Ambient scatter (12%) ───────────────────────────────────────────
        x = (Math.random() * 2 - 1) * 7;
        y = -1.5 + Math.random() * 6;
        z = Math.random() * 14;
      }

      origins[i * 3]     = x;
      origins[i * 3 + 1] = y;
      origins[i * 3 + 2] = z;
      positions[i * 3]     = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      const pick = Math.random();
      const brightness = 0.7 + Math.random() * 0.3;
      if (pick < 0.78) {
        colors[i * 3] = brightness;
        colors[i * 3 + 1] = brightness;
        colors[i * 3 + 2] = brightness;
      } else if (pick < 0.90) {
        const g = 0.35 + Math.random() * 0.25;
        colors[i * 3] = g;
        colors[i * 3 + 1] = g;
        colors[i * 3 + 2] = g;
      } else if (pick < 0.95) {
        colors[i * 3] = 0.85 + Math.random() * 0.15;
        colors[i * 3 + 1] = 0.25 + Math.random() * 0.2;
        colors[i * 3 + 2] = 0.25 + Math.random() * 0.2;
      } else {
        colors[i * 3] = 0.3 + Math.random() * 0.2;
        colors[i * 3 + 1] = 0.7 + Math.random() * 0.25;
        colors[i * 3 + 2] = 0.3 + Math.random() * 0.2;
      }
    }

    return { positions, origins, colors };
  }, []);

  useEffect(() => {
    if (isLoaded && phaseRef.current === "idle") {
      phaseRef.current = "fadeout";
      fadeTimeRef.current = 0;
    }
  }, [isLoaded]);

  // Capture Three.js object refs at mount time so the cleanup closure holds
  // direct object pointers — not a mutable .current React may null on unmount.
  useEffect(() => {
    const geo = geoRef.current;
    const mat = matRef.current;
    const backdropMat = backdropMatRef.current;
    return () => {
      geo?.dispose();
      mat?.dispose();
      backdropMat?.dispose();
    };
  }, []);

  useFrame((_, delta) => {
    const points = pointsRef.current;
    const mat = matRef.current;
    if (!points || !mat || completedRef.current) return;

    const posAttr = points.geometry.attributes.position as THREE.BufferAttribute;
    const pos = posAttr.array as Float32Array;

    // ── Idle: subtle shimmer while the splat uploads to the GPU ─────────────
    if (phaseRef.current === "idle") {
      idleTimeRef.current += delta;
      const t = idleTimeRef.current;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        pos[i * 3]     = origins[i * 3]     + Math.sin(t * 1.2 + i * 0.003) * 0.03;
        pos[i * 3 + 1] = origins[i * 3 + 1] + Math.cos(t * 0.9 + i * 0.005) * 0.03;
        pos[i * 3 + 2] = origins[i * 3 + 2] + Math.sin(t * 1.0 + i * 0.004) * 0.03;
      }
      posAttr.needsUpdate = true;
      return;
    }

    // ── Fade out: dissolve particles and backdrop together ───────────────────
    if (phaseRef.current === "fadeout") {
      fadeTimeRef.current += delta;
      const t = Math.min(fadeTimeRef.current / FADE_DURATION, 1.0);
      const opacity = 1.0 - (t * t * (3 - 2 * t)); // smoothstep ease-out
      mat.opacity = opacity;
      if (backdropMatRef.current) backdropMatRef.current.opacity = opacity;

      if (t >= 1.0 && !completedRef.current) {
        completedRef.current = true;
        phaseRef.current = "done";
        onComplete();
      }
    }
  });

  return (
    <>
      {/* Solid backdrop — fills the canvas so no black bleeds through during
          the particle animation. Fades in lockstep with the particles. */}
      <mesh renderOrder={-1}>
        <planeGeometry args={[1000, 1000]} />
        <meshBasicMaterial
          ref={backdropMatRef}
          color="#000000"
          transparent
          opacity={1}
          depthTest={false}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <points ref={pointsRef} renderOrder={999}>
        <bufferGeometry ref={geoRef}>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          ref={matRef}
          size={0.022}
          vertexColors
          transparent
          opacity={1}
          depthWrite={false}
          depthTest={false}
          sizeAttenuation
        />
      </points>
    </>
  );
}
