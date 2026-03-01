"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Loader2 } from "lucide-react";
import { SplatScene } from "./splat-scene";
import { AgentPathTracer } from "./agent-path-tracer";
import { SceneMetricsOverlay } from "./scene-metrics-overlay";
import type { MetricsSnapshot } from "@/lib/api-types";

interface SplatViewerProps {
  spzUrl: string;
  alternateWorldId?: string;
  metrics?: MetricsSnapshot | null;
}

export function SplatViewer({
  spzUrl,
  alternateWorldId,
  metrics = null,
}: SplatViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);

  // Agent follows camera by default. Press N to toggle off.
  const [agentActive, setAgentActive] = useState(true);

  // Room proximity state
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);
  const [roomsVisited, setRoomsVisited] = useState<Set<string>>(new Set());

  const handleLoaded = useCallback(() => setLoading(false), []);
  const handleError = useCallback((err: Error) => {
    setError(err.message);
    setLoading(false);
  }, []);

  const handleRoomReached = useCallback((room: string) => {
    setCurrentRoom(room);
    setRoomsVisited((prev) => {
      if (prev.has(room)) return prev;
      const next = new Set(prev);
      next.add(room);
      return next;
    });
  }, []);

  // N key toggles agent following
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "n" || e.key === "N") {
        setAgentActive((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const sceneReady = !loading && !error;

  // Progress based on rooms visited from the optimal path
  const pathRooms = metrics?.optimized_path.path ?? [];
  const visitedOnPath = pathRooms.filter((r) => roomsVisited.has(r)).length;
  const progress =
    pathRooms.length > 0 ? Math.round((visitedOnPath / pathRooms.length) * 100) : 0;

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

        {/* Agent always mounts when scene is ready — active toggles via N key */}
        {sceneReady && (
          <AgentPathTracer
            active={agentActive}
            lagSeconds={1.5}
            onRoomReached={handleRoomReached}
          />
        )}
      </Canvas>

      {/* Metrics overlay — only when analysis data is available */}
      {sceneReady && metrics && (
        <SceneMetricsOverlay
          metrics={metrics}
          currentRoom={currentRoom}
          progress={progress}
          complete={progress >= 100}
        />
      )}

      {/* Agent status hint */}
      {sceneReady && (
        <div className="pointer-events-none absolute bottom-4 left-4 flex items-center gap-1.5 rounded bg-black/50 px-2.5 py-1.5 backdrop-blur-sm">
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: agentActive ? "#66d9ff" : "oklch(0.5 0 0)",
              boxShadow: agentActive ? "0 0 6px #66d9ff" : "none",
              flexShrink: 0,
            }}
          />
          <kbd className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/70">
            N
          </kbd>
          <span className="text-[10px] uppercase tracking-[0.1em] text-white/50">
            {agentActive ? "Agent on" : "Agent off"}
          </span>
        </div>
      )}

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
