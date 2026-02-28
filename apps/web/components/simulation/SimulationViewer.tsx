"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Html } from "@react-three/drei";
import { Suspense } from "react";
import { useSimulation } from "@/hooks/useSimulation";

function Scene({ simulationId }: { simulationId: string }) {
  const { environment } = useSimulation(simulationId);

  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight position={[3, 8, 5]} intensity={1} />
      <Grid args={[40, 20]} />
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[2, 1, 2]} />
        <meshStandardMaterial color={environment?.environment_type === "burning_building" ? "#ef4444" : "#38bdf8"} />
      </mesh>
      <Html position={[0, 2, 0]} center>
        <div className="rounded bg-black/60 px-2 py-1 text-xs">World: {environment?.name ?? simulationId}</div>
      </Html>
      <OrbitControls />
    </>
  );
}

export function SimulationViewer({ simulationId }: { simulationId: string }) {
  return (
    <div className="h-full w-full">
      <Canvas camera={{ position: [6, 6, 8], fov: 50 }}>
        <Suspense fallback={null}>
          <Scene simulationId={simulationId} />
        </Suspense>
      </Canvas>
    </div>
  );
}
