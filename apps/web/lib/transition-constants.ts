// ---------------------------------------------------------------------------
// Hero Exit Animation Timings
// ---------------------------------------------------------------------------
export const HERO_TEXT_FADE_DURATION_MS = 600;
export const HERO_GLOBE_FADE_DURATION_MS = 500;
export const HERO_NAV_EXIT_DURATION_MS = 400;
export const HERO_EXIT_STAGGER_MS = 100;

/** Total time before router.push fires (text + stagger + nav overlap) */
export const HERO_EXIT_TOTAL_MS =
  HERO_TEXT_FADE_DURATION_MS +
  HERO_EXIT_STAGGER_MS +
  HERO_NAV_EXIT_DURATION_MS;

// ---------------------------------------------------------------------------
// V2 Exit: Globe Zoom-Into-Urbana-Champaign
// ---------------------------------------------------------------------------
export const HERO_ALERTS_FADEOUT_MS = 300;
export const HERO_GLOBE_ROTATE_MS = 1000;
export const HERO_UC_MARKER_DELAY_MS = 500;
export const HERO_UC_MARKER_FADEIN_MS = 300;
export const HERO_GLOBE_ZOOM_DELAY_MS = 800;
export const HERO_GLOBE_ZOOM_MS = 700;
export const HERO_GLOBE_ZOOM_SCALE = 3.5;
export const HERO_EXIT_TOTAL_MS_V2 = 1600;

/** Shared mutable state between globe components during exit transition */
export interface GlobeTransitionState {
  phase: "idle" | "exiting" | "zooming" | "done";
  exitStartedAt: number;
  theta: number;
}

// ---------------------------------------------------------------------------
// Dashboard Loading Screen
// ---------------------------------------------------------------------------
export const LOADING_BAR_SEGMENT_COUNT = 12;
// Phase 1: fast burst from 0 → 10/12 segments
export const LOADING_PHASE1_DURATION_MS = 250;
export const LOADING_PHASE1_PROGRESS = 10 / 12;

// Phase 2: stall at 10/12
export const LOADING_PHASE2_DURATION_MS = 350;

// Phase 3: quick finish from 10/12 → 1.0
export const LOADING_PHASE3_DURATION_MS = 100;

// Phase 4: hold at 100% so the last bar is visible before exit
export const LOADING_HOLD_MS = 150;

/** Fade-in duration for the loading overlay entrance */
export const LOADING_FADE_IN_MS = 300;

/** Total loading time across all phases */
export const LOADING_TOTAL_DURATION_MS =
  LOADING_PHASE1_DURATION_MS +
  LOADING_PHASE2_DURATION_MS +
  LOADING_PHASE3_DURATION_MS;

export const LOADING_BG_TRANSITION_DURATION_MS = LOADING_TOTAL_DURATION_MS;
export const MAP_FADE_IN_DURATION_MS = 800;

// ---------------------------------------------------------------------------
// Loading Screen Background Colors
// ---------------------------------------------------------------------------

/** Hero background (dark theme --background) */
export const LOADING_BG_START = "oklch(0.141 0.005 285.823)";

/** Mapbox fog color — warm dark brown */
export const LOADING_BG_END = "#1a1410";
