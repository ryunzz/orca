"use client";

import { useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { SplatMesh, SparkRenderer } from "@sparkjsdev/spark";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import "./spark-extend";

const MOVE_SPEED = 2;

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();

function KeyboardNav({
  controls,
}: {
  controls: React.RefObject<OrbitControlsImpl | null>;
}) {
  const keysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key.toLowerCase());
    };
    const onUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  useFrame(({ camera }, delta) => {
    const keys = keysRef.current;
    if (keys.size === 0 || !controls.current) return;

    const shift = keys.has("shift");

    // Camera forward projected onto XZ plane
    camera.getWorldDirection(_forward);
    _forward.y = 0;
    _forward.normalize();

    // Right vector from forward
    _right.crossVectors(_forward, camera.up).normalize();

    _move.set(0, 0, 0);

    // Forward / backward
    if ((keys.has("arrowup") || keys.has("w")) && !shift) {
      _move.add(_forward);
    }
    if ((keys.has("arrowdown") || keys.has("s")) && !shift) {
      _move.sub(_forward);
    }

    // Strafe left / right
    if (keys.has("arrowleft") || keys.has("a")) {
      _move.sub(_right);
    }
    if (keys.has("arrowright") || keys.has("d")) {
      _move.add(_right);
    }

    // Vertical movement
    if ((shift && keys.has("arrowup")) || keys.has(" ")) {
      _move.y += 1;
    }
    if ((shift && keys.has("arrowdown")) || keys.has("q")) {
      _move.y -= 1;
    }

    if (_move.lengthSq() === 0) return;

    _move.normalize().multiplyScalar(MOVE_SPEED * delta);

    camera.position.add(_move);
    controls.current.target.add(_move);
  });

  return null;
}

interface SplatSceneProps {
  spzUrl: string;
  onLoaded?: () => void;
  onError?: (error: Error) => void;
}

export function SplatScene({ spzUrl, onLoaded, onError }: SplatSceneProps) {
  const gl = useThree((state) => state.gl);
  const splatRef = useRef<SplatMesh>(null);
  const sparkRef = useRef<SparkRenderer>(null);
  const controlsRef = useRef<OrbitControlsImpl>(null);

  useEffect(() => {
    const splat = splatRef.current;
    if (!splat) return;

    splat.initialized
      .then(() => onLoaded?.())
      .catch((err: unknown) => {
        const error = err instanceof Error ? err : new Error("Failed to load splat");
        onError?.(error);
      });
  }, [spzUrl, onLoaded, onError]);

  return (
    <>
      <sparkSparkRenderer ref={sparkRef} args={[{ renderer: gl }]} />
      <sparkSplatMesh
        ref={splatRef}
        args={[{ url: spzUrl }]}
        rotation={[Math.PI, 0, 0]}
      />
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.12}
        minDistance={0.5}
        maxDistance={20}
      />
      <KeyboardNav controls={controlsRef} />
    </>
  );
}
