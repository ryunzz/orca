"use client";

import { Suspense, useCallback, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Loader2 } from "lucide-react";
import { SplatScene } from "./splat-scene";

interface SplatViewerProps {
  spzUrl: string;
  alternateWorldId?: string;
}

export function SplatViewer({ spzUrl, alternateWorldId }: SplatViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);

  const handleLoaded = useCallback(() => setLoading(false), []);
  const handleError = useCallback((err: Error) => {
    setError(err.message);
    setLoading(false);
  }, []);

  return (
    <div className="relative h-full w-full">
      <Canvas
        gl={{ antialias: false, alpha: true }}
        camera={{ position: [0, 0, -2], fov: 60, near: 0.1, far: 100 }}
      >
        <Suspense fallback={null}>
          <SplatScene
            spzUrl={spzUrl}
            alternateWorldId={alternateWorldId}
            onLoaded={handleLoaded}
            onError={handleError}
            onTransitionStart={() => setTransitioning(true)}
            onTransitionEnd={() => setTransitioning(false)}
          />
        </Suspense>
      </Canvas>

      {loading && !error && !transitioning && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black">
          <Loader2
            className="size-6 animate-spin"
            style={{ color: "var(--fire-orange, oklch(0.752 0.217 52.149))" }}
          />
          <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            Loading 3D scene...
          </span>
        </div>
      )}

      {error && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80">
          <span
            className="text-xs font-semibold uppercase tracking-[0.15em]"
            style={{ color: "oklch(0.7 0.2 25)" }}
          >
            Failed to load 3D scene
          </span>
          <span className="max-w-md text-center text-[10px] text-muted-foreground">
            {error}
          </span>
        </div>
      )}

      {!loading && !error && alternateWorldId && (
        <div className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-1.5 rounded bg-black/50 px-2.5 py-1.5 backdrop-blur-sm">
          <kbd className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/70">
            Tab
          </kbd>
          <span className="text-[10px] uppercase tracking-[0.1em] text-white/50">
            Compare view
          </span>
        </div>
      )}
    </div>
  );
}
