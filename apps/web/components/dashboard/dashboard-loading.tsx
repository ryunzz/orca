"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  LOADING_BAR_SEGMENT_COUNT,
  LOADING_PHASE1_DURATION_MS,
  LOADING_PHASE1_PROGRESS,
  LOADING_PHASE2_DURATION_MS,
  LOADING_PHASE3_DURATION_MS,
  LOADING_TOTAL_DURATION_MS,
  LOADING_HOLD_MS,
  LOADING_FADE_IN_MS,
  LOADING_BG_TRANSITION_DURATION_MS,
  LOADING_BG_START,
  LOADING_BG_END,
  MAP_FADE_IN_DURATION_MS,
} from "@/lib/transition-constants";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface DashboardLoadingProps {
  onComplete: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function DashboardLoading({ onComplete }: DashboardLoadingProps) {
  const [progress, setProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);

  // Three-phase progress: fast burst → stall → quick finish
  const tick = useCallback(() => {
    if (startTimeRef.current === null) {
      startTimeRef.current = performance.now();
    }

    const elapsed = performance.now() - startTimeRef.current;
    const phase1End = LOADING_PHASE1_DURATION_MS;
    const phase2End = phase1End + LOADING_PHASE2_DURATION_MS;
    const phase3End = LOADING_TOTAL_DURATION_MS;

    let t: number;
    if (elapsed < phase1End) {
      // Phase 1: fast burst 0 → 10/12
      t = (elapsed / phase1End) * LOADING_PHASE1_PROGRESS;
    } else if (elapsed < phase2End) {
      // Phase 2: stall at 10/12
      t = LOADING_PHASE1_PROGRESS;
    } else if (elapsed < phase3End) {
      // Phase 3: quick finish 10/12 → 1
      const phase3Elapsed = elapsed - phase2End;
      t =
        LOADING_PHASE1_PROGRESS +
        (phase3Elapsed / LOADING_PHASE3_DURATION_MS) *
          (1 - LOADING_PHASE1_PROGRESS);
    } else {
      t = 1;
    }

    setProgress(Math.min(t, 1));

    if (t < 1) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      // Hold at 100% so the last bar is visible before exit
      setProgress(1);
      setTimeout(() => setIsComplete(true), LOADING_HOLD_MS);
    }
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [tick]);

  // After fade-out completes, notify parent
  useEffect(() => {
    if (!isComplete) return;
    const timer = setTimeout(onComplete, MAP_FADE_IN_DURATION_MS);
    return () => clearTimeout(timer);
  }, [isComplete, onComplete]);

  const filledSegments = Math.floor(progress * LOADING_BAR_SEGMENT_COUNT);

  return (
    <AnimatePresence>
      {!isComplete && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: LOADING_FADE_IN_MS / 1000, ease: "easeOut" } }}
          exit={{ opacity: 0, transition: { duration: MAP_FADE_IN_DURATION_MS / 1000, ease: "easeInOut" } }}
          style={{
            backgroundColor: LOADING_BG_START,
            transition: `background-color ${LOADING_BG_TRANSITION_DURATION_MS}ms ease-in-out`,
            ...(progress > 0 ? { backgroundColor: LOADING_BG_END } : {}),
          }}
        >
          {/* Dot grid — replicates CommandCenterFrame */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage: `
                radial-gradient(circle 1px at center, oklch(1 0 0 / 2%) 0%, transparent 100%),
                radial-gradient(circle 1px at center, oklch(1 0 0 / 4%) 0%, transparent 100%)
              `,
              backgroundSize: "32px 32px, 160px 160px",
              opacity: 1 - progress,
              transition: "opacity 300ms ease-out",
            }}
          />

          {/* Orange proximity glow — fades out with progress */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 50% 45% at 50% 50%, oklch(0.752 0.217 52.149 / 12%), transparent)",
              opacity: 1 - progress,
              transition: "opacity 300ms ease-out",
            }}
          />

          {/* Loading label */}
          <p className="mb-6 font-mono text-[10px] uppercase tracking-[0.25em] text-[oklch(1_0_0/40%)]">
            Loading map
          </p>

          {/* Segmented loading bar */}
          <div className="flex gap-1">
            {Array.from({ length: LOADING_BAR_SEGMENT_COUNT }, (_, i) => {
              const isFilled = i < filledSegments;
              return (
                <div
                  key={i}
                  className="h-1.5 w-4 transition-all duration-150"
                  style={{
                    backgroundColor: isFilled
                      ? "oklch(0.752 0.217 52.149)"
                      : "oklch(1 0 0 / 8%)",
                    boxShadow: isFilled
                      ? "0 0 8px oklch(0.752 0.217 52.149 / 50%), 0 0 16px oklch(0.752 0.217 52.149 / 20%)"
                      : "none",
                  }}
                />
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
