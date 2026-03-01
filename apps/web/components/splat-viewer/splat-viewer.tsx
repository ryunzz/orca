"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  memo,
} from "react";
import { Canvas } from "@react-three/fiber";
import { Loader2 } from "lucide-react";
import { SplatScene } from "./splat-scene";
import { AgentSquad } from "./agent-squad";
import { AgentAlertOverlay } from "./agent-alert-overlay";
import { CoordinateRecorder } from "./coordinate-recorder";
import { SceneMetricsOverlay } from "./scene-metrics-overlay";
import { defaultScenario } from "@/data/agent-scenario";
import type { MetricsSnapshot } from "@/lib/api-types";

// ---------------------------------------------------------------------------
// Alert callback ref — allows the 3D scene to push alerts into the DOM
// overlay without triggering any React state change in the Canvas parent.
// ---------------------------------------------------------------------------

export type AlertPushFn = (
  agentId: string,
  text: string,
  position: [number, number, number],
) => void;

// ---------------------------------------------------------------------------
// Stable Canvas shell — memoized so parent state changes never re-render it.
// All communication with the outer DOM goes through refs / stable callbacks.
// ---------------------------------------------------------------------------

interface CanvasShellProps {
  spzUrl: string;
  alternateWorldId?: string;
  sceneReady: boolean;
  onLoaded: () => void;
  onError: (err: Error) => void;
  onTransitionStart: () => void;
  onTransitionEnd: () => void;
  onSlotChange: (slot: "primary" | "alternate") => void;
  alertPushRef: React.RefObject<AlertPushFn | null>;
  activeSlotRef: React.RefObject<"primary" | "alternate">;
  agentActiveRef: React.RefObject<boolean>;
}

const CanvasShell = memo(function CanvasShell({
  spzUrl,
  alternateWorldId,
  sceneReady,
  onLoaded,
  onError,
  onTransitionStart,
  onTransitionEnd,
  onSlotChange,
  alertPushRef,
  activeSlotRef,
  agentActiveRef,
}: CanvasShellProps) {
  // Bridge: read refs from the outer component via a thin R3F wrapper
  return (
    <Canvas
      gl={GL_PROPS}
      camera={CAMERA_PROPS}
    >
      <Suspense fallback={null}>
        <SplatScene
          spzUrl={spzUrl}
          alternateWorldId={alternateWorldId}
          onLoaded={onLoaded}
          onError={onError}
          onTransitionStart={onTransitionStart}
          onTransitionEnd={onTransitionEnd}
          onSlotChange={onSlotChange}
        />
        {sceneReady && (
          <AgentSquadBridge
            alertPushRef={alertPushRef}
            activeSlotRef={activeSlotRef}
            agentActiveRef={agentActiveRef}
          />
        )}
        {sceneReady && process.env.NODE_ENV === "development" && <CoordinateRecorder />}
      </Suspense>
    </Canvas>
  );
});

// Stable object refs so Canvas never sees new prop references
const GL_PROPS = { antialias: false, alpha: true } as const;
const CAMERA_PROPS = { position: [0, 0, -2] as const, fov: 60, near: 0.1, far: 100 };

// ---------------------------------------------------------------------------
// AgentSquadBridge — lives inside Canvas, reads refs each frame so it never
// needs React state or re-renders to pick up changes from the outer DOM.
// ---------------------------------------------------------------------------

function AgentSquadBridge({
  alertPushRef,
  activeSlotRef,
  agentActiveRef,
}: {
  alertPushRef: React.RefObject<AlertPushFn | null>;
  activeSlotRef: React.RefObject<"primary" | "alternate">;
  agentActiveRef: React.RefObject<boolean>;
}) {
  // Stable callback that forwards to the ref — never changes identity
  const handleAlert = useCallback(
    (agentId: string, text: string, position: [number, number, number]) => {
      alertPushRef.current?.(agentId, text, position);
    },
    [alertPushRef],
  );

  return (
    <AgentSquad
      scenario={defaultScenario}
      activePathRef={activeSlotRef}
      activeRef={agentActiveRef}
      onAlert={handleAlert}
    />
  );
}

// ---------------------------------------------------------------------------
// SplatViewer — outer component that owns DOM overlays + state.
// The Canvas is fully isolated inside CanvasShell (memo'd).
// ---------------------------------------------------------------------------

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

  const [agentActive, setAgentActive] = useState(false);
  const [hasClicked, setHasClicked] = useState(false);

  // --- Refs that the Canvas reads without triggering re-renders -----------
  const activeSlotRef = useRef<"primary" | "alternate">("primary");
  const agentActiveRef = useRef(false);

  // --- Stable callbacks (identity never changes) --------------------------
  const handleLoaded = useCallback(() => setLoading(false), []);
  const handleError = useCallback((err: Error) => {
    setError(err.message);
    setLoading(false);
  }, []);
  const handleTransitionStart = useCallback(() => setTransitioning(true), []);
  const handleTransitionEnd = useCallback(() => setTransitioning(false), []);
  const handleSlotChange = useCallback((slot: "primary" | "alternate") => {
    activeSlotRef.current = slot;
  }, []);

  // --- Alert channel: 3D scene writes here, DOM overlay reads it ----------
  // The alert overlay manages its own state — SplatViewer never re-renders.
  const alertPushRef = useRef<AlertPushFn | null>(null);

  // First click activates agents
  const handleCanvasClick = useCallback(() => {
    if (!hasClicked) {
      setHasClicked(true);
      agentActiveRef.current = true;
      setAgentActive(true);
    }
  }, [hasClicked]);

  // N key toggles agents
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.key === "n" || e.key === "N") && hasClicked) {
        setAgentActive((prev) => {
          agentActiveRef.current = !prev;
          return !prev;
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasClicked]);

  const sceneReady = !loading && !error;

  return (
    <div className="relative h-full w-full" onClick={handleCanvasClick}>
      <CanvasShell
        spzUrl={spzUrl}
        alternateWorldId={alternateWorldId}
        sceneReady={sceneReady}
        onLoaded={handleLoaded}
        onError={handleError}
        onTransitionStart={handleTransitionStart}
        onTransitionEnd={handleTransitionEnd}
        onSlotChange={handleSlotChange}
        alertPushRef={alertPushRef}
        activeSlotRef={activeSlotRef}
        agentActiveRef={agentActiveRef}
      />

      {/* Alert overlay — manages its own state, decoupled from Canvas */}
      {sceneReady && <AgentAlertOverlay alertPushRef={alertPushRef} />}

      {/* Metrics overlay */}
      {sceneReady && metrics && (
        <SceneMetricsOverlay
          metrics={metrics}
          currentRoom={null}
          progress={0}
          complete={false}
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
