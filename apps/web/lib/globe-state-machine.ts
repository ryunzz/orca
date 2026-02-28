"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type GlobePhase,
  PHASE_DURATIONS_MS,
} from "@/lib/globe-constants";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GlobePhaseInfo {
  state: GlobePhase;
  /** 0-1 progress within the current phase (0 for IDLE/NAVIGATE) */
  progress: number;
}

// ─── Ordered transition sequence ────────────────────────────────────────────

const SEQUENCE: Exclude<GlobePhase, "IDLE">[] = [
  "LOCK",
  "SCOPE",
  "ZOOM",
  "NAVIGATE",
];

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useGlobeStateMachine(onNavigate: () => void) {
  const [phaseInfo, setPhaseInfo] = useState<GlobePhaseInfo>({
    state: "IDLE",
    progress: 0,
  });

  // Refs to avoid stale closures in rAF
  const phaseRef = useRef<GlobePhaseInfo>(phaseInfo);
  const onNavigateRef = useRef(onNavigate);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const sequenceIndexRef = useRef<number>(0);
  const triggeredRef = useRef(false);

  // Keep navigate ref current
  useEffect(() => {
    onNavigateRef.current = onNavigate;
  }, [onNavigate]);

  // Sync ref with state
  useEffect(() => {
    phaseRef.current = phaseInfo;
  }, [phaseInfo]);

  const advancePhase = useCallback((now: number) => {
    const idx = sequenceIndexRef.current;
    const currentPhase = SEQUENCE[idx];

    if (!currentPhase || currentPhase === "NAVIGATE") {
      // Reached navigate — fire callback and stop
      setPhaseInfo({ state: "NAVIGATE", progress: 1 });
      onNavigateRef.current();
      return;
    }

    const duration =
      PHASE_DURATIONS_MS[currentPhase as keyof typeof PHASE_DURATIONS_MS];
    const elapsed = now - startTimeRef.current;
    const progress = Math.min(elapsed / duration, 1);

    setPhaseInfo({ state: currentPhase, progress });

    if (progress >= 1) {
      // Move to next phase
      sequenceIndexRef.current = idx + 1;
      startTimeRef.current = now;
      rafRef.current = requestAnimationFrame(advancePhase);
    } else {
      rafRef.current = requestAnimationFrame(advancePhase);
    }
  }, []);

  const trigger = useCallback(() => {
    // Idempotent — ignore if already triggered
    if (triggeredRef.current) return;
    triggeredRef.current = true;

    sequenceIndexRef.current = 0;
    startTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(advancePhase);
  }, [advancePhase]);

  // Cleanup rAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return { phaseInfo, trigger } as const;
}
