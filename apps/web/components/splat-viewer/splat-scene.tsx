"use client";

import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { SplatMesh, SparkRenderer } from "@sparkjsdev/spark";
import "./spark-extend";

interface SplatSceneProps {
  spzUrl: string;
  onLoaded?: () => void;
  onError?: (error: Error) => void;
}

export function SplatScene({ spzUrl, onLoaded, onError }: SplatSceneProps) {
  const gl = useThree((state) => state.gl);
  const splatRef = useRef<SplatMesh>(null);
  const sparkRef = useRef<SparkRenderer>(null);

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
        enableDamping
        dampingFactor={0.12}
        minDistance={0.5}
        maxDistance={20}
      />
    </>
  );
}
