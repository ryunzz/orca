import { PHASE_DURATIONS_MS } from "./constants";

// ─── Phase Enum ─────────────────────────────────────────────────────────────
export enum AnimationPhase {
  IGNITION = "IGNITION",
  FULL_BURN = "FULL_BURN",
  SUPPRESSION = "SUPPRESSION",
  RECOVERY = "RECOVERY",
}

// ─── Phase Order ────────────────────────────────────────────────────────────
const PHASE_ORDER: AnimationPhase[] = [
  AnimationPhase.IGNITION,
  AnimationPhase.FULL_BURN,
  AnimationPhase.SUPPRESSION,
  AnimationPhase.RECOVERY,
];

// ─── Total Cycle ────────────────────────────────────────────────────────────
export const TOTAL_CYCLE_MS =
  PHASE_DURATIONS_MS.IGNITION +
  PHASE_DURATIONS_MS.FULL_BURN +
  PHASE_DURATIONS_MS.SUPPRESSION +
  PHASE_DURATIONS_MS.RECOVERY;

// ─── Phase Boundaries (precomputed) ─────────────────────────────────────────
const PHASE_BOUNDARIES: { phase: AnimationPhase; start: number; end: number }[] = [];
{
  let offset = 0;
  for (const phase of PHASE_ORDER) {
    const duration = PHASE_DURATIONS_MS[phase];
    PHASE_BOUNDARIES.push({ phase, start: offset, end: offset + duration });
    offset += duration;
  }
}

// ─── Get Phase at Time ──────────────────────────────────────────────────────
export interface PhaseInfo {
  phase: AnimationPhase;
  /** 0-1 progress within the current phase */
  progress: number;
}

export function getPhaseAtTime(elapsedMs: number): PhaseInfo {
  const cycleTime = elapsedMs % TOTAL_CYCLE_MS;

  for (const boundary of PHASE_BOUNDARIES) {
    if (cycleTime < boundary.end) {
      const progress = (cycleTime - boundary.start) / (boundary.end - boundary.start);
      return { phase: boundary.phase, progress };
    }
  }

  // Fallback (shouldn't reach here due to modulo)
  return { phase: AnimationPhase.RECOVERY, progress: 1 };
}

// ─── Easing Helpers ─────────────────────────────────────────────────────────
function easeInCubic(t: number): number {
  return t * t * t;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// ─── Get Fire Intensity ─────────────────────────────────────────────────────
export function getFireIntensity(phase: AnimationPhase, progress: number): number {
  switch (phase) {
    case AnimationPhase.IGNITION:
      return easeInCubic(progress);
    case AnimationPhase.FULL_BURN:
      return 1.0;
    case AnimationPhase.SUPPRESSION:
      return 1.0 - easeOutCubic(progress);
    case AnimationPhase.RECOVERY:
      return 0;
  }
}
