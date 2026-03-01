"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Loader2 } from "lucide-react";
import { SplatScene } from "./splat-scene";
import { AgentSquad } from "./agent-squad";
import { AgentAlertOverlay, type ActiveAlert } from "./agent-alert-overlay";
import { CoordinateRecorder } from "./coordinate-recorder";
import { SceneMetricsOverlay } from "./scene-metrics-overlay";
import { defaultScenario } from "@/data/agent-scenario";
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

  // Agent starts inactive — activates on first click in the scene.
  // Press N to toggle off after that.
  const [agentActive, setAgentActive] = useState(false);
  const [hasClicked, setHasClicked] = useState(false);

  // Which splat world is active (mirrored from SplatScene)
  const [activeSlot, setActiveSlot] = useState<"primary" | "alternate">("primary");

  // Room proximity state
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);
  const [roomsVisited, setRoomsVisited] = useState<Set<string>>(new Set());

  // Alert state
  const [activeAlerts, setActiveAlerts] = useState<ActiveAlert[]>([]);
  const alertIdCounter = useRef(0);

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

  const handleSlotChange = useCallback((slot: "primary" | "alternate") => {
    setActiveSlot(slot);
  }, []);

  const handleAlert = useCallback(
    (agentId: string, text: string, position: [number, number, number]) => {
      const agent = defaultScenario.agents.find((a) => a.id === agentId);
      const color = agent?.color ?? "#66d9ff";
      const id = `alert-${alertIdCounter.current++}`;
      setActiveAlerts((prev) => [
        ...prev,
        { id, agentId, text, color, position, createdAt: 0 },
      ]);
      // createdAt is set to 0 here — the AlertFlag component uses clock.elapsedTime
      // on its first frame to calibrate. We pass 0 as a sentinel; the component
      // handles it by snapping createdAt on mount.
    },
    [],
  );

  const handleAlertDismiss = useCallback((id: string) => {
    setActiveAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // First click activates the agent
  const handleCanvasClick = useCallback(() => {
    if (!hasClicked) {
      setHasClicked(true);
      setAgentActive(true);
    }
  }, [hasClicked]);

  // N key toggles agent following (only after first click)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.key === "n" || e.key === "N") && hasClicked) {
        setAgentActive((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasClicked]);

  const sceneReady = !loading && !error;

  // Progress based on rooms visited from the optimal path
  const pathRooms = metrics?.optimized_path.path ?? [];
  const visitedOnPath = pathRooms.filter((r) => roomsVisited.has(r)).length;
  const progress =
    pathRooms.length > 0 ? Math.round((visitedOnPath / pathRooms.length) * 100) : 0;

  return (
    <div className="relative h-full w-full" onClick={handleCanvasClick}>
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
            onSlotChange={handleSlotChange}
          />
        </Suspense>

        {/* Multi-agent squad — waypoint-driven */}
        {sceneReady && (
          <AgentSquad
            scenario={defaultScenario}
            activePath={activeSlot}
            active={agentActive}
            onAlert={handleAlert}
          />
        )}

        {/* 3D alert flags */}
        {sceneReady && (
          <AgentAlertOverlay
            alerts={activeAlerts}
            onDismiss={handleAlertDismiss}
          />
        )}

        {/* Dev coordinate recorder — R key logs waypoint JSON */}
        {sceneReady && process.env.NODE_ENV === "development" && (
          <CoordinateRecorder />
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

      {/* Multi-agent legend */}
      {sceneReady && (
        <div className="pointer-events-none absolute bottom-4 left-4 flex flex-col gap-1.5 rounded bg-black/50 px-2.5 py-1.5 backdrop-blur-sm">
          {hasClicked ? (
            <>
              <div className="flex items-center gap-1.5">
                <kbd className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/70">
                  N
                </kbd>
                <span className="text-[10px] uppercase tracking-[0.1em] text-white/50">
                  {agentActive ? "Agents on" : "Agents off"}
                </span>
              </div>
              {defaultScenario.agents.map((agent) => (
                <div key={agent.id} className="flex items-center gap-1.5">
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: agentActive ? agent.color : "oklch(0.5 0 0)",
                      boxShadow: agentActive
                        ? `0 0 4px ${agent.color}`
                        : "none",
                      flexShrink: 0,
                    }}
                  />
                  <span className="text-[10px] uppercase tracking-[0.08em] text-white/50">
                    {agent.label}
                  </span>
                </div>
              ))}
            </>
          ) : (
            <span className="text-[10px] uppercase tracking-[0.1em] text-white/50">
              Click to start agents
            </span>
          )}
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
