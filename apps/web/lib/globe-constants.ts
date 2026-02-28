// ─── Globe Configuration ─────────────────────────────────────────────────────

/** Cobe globe rendering options (fire-themed) */
export const GLOBE_CONFIG = {
  MAP_SAMPLES: 16000,
  MAP_BRIGHTNESS: 6,
  BASE_COLOR: [0.15, 0.08, 0.03] as [number, number, number],
  GLOW_COLOR: [0.95, 0.47, 0.14] as [number, number, number],
  MARKER_COLOR: [0.88, 0.24, 0.19] as [number, number, number],
  DARK: 1,
  DIFFUSE: 1.2,
  MAP_BASE_COLOR: [0.15, 0.08, 0.03] as [number, number, number],
  /** Globe dot size */
  DOT_SIZE: 1,
  /** Globe canvas scale (pixels) */
  WIDTH: 800,
  HEIGHT: 800,
  /** DPR cap to limit GPU load */
  MAX_DPR: 2,
} as const;

// ─── Target Location: Urbana-Champaign ──────────────────────────────────────

export const TARGET_LOCATION = {
  LAT: 40.11,
  LNG: -88.21,
  LABEL: "URBANA-CHAMPAIGN",
  SECTOR: "SECTOR 7-ALPHA",
} as const;

// ─── Coordinate Conversion ──────────────────────────────────────────────────

const DEG_TO_RAD = Math.PI / 180;

/** Convert longitude to cobe phi (radians) */
export function latLngToPhi(lng: number): number {
  return Math.PI - (lng * DEG_TO_RAD - Math.PI / 2);
}

/** Convert latitude to cobe theta (radians) */
export function latLngToTheta(lat: number): number {
  return lat * DEG_TO_RAD;
}

/** Pre-computed target phi/theta */
export const TARGET_PHI = latLngToPhi(TARGET_LOCATION.LNG);
export const TARGET_THETA = latLngToTheta(TARGET_LOCATION.LAT);

// ─── State Machine Phases ───────────────────────────────────────────────────

export type GlobePhase = "IDLE" | "LOCK" | "SCOPE" | "ZOOM" | "NAVIGATE";

export const PHASE_DURATIONS_MS: Record<
  Exclude<GlobePhase, "IDLE" | "NAVIGATE">,
  number
> = {
  LOCK: 1200,
  SCOPE: 800,
  ZOOM: 1000,
} as const;

// ─── Idle Spin ──────────────────────────────────────────────────────────────

/** Phi increment per frame during IDLE */
export const IDLE_SPIN_SPEED = 0.005;

// ─── Radar Config ───────────────────────────────────────────────────────────

/** Full sweep period in seconds */
export const RADAR_SWEEP_PERIOD_S = 12;

/** Sweep wedge arc in degrees */
export const RADAR_SWEEP_ARC_DEG = 60;

// ─── Easing Functions ───────────────────────────────────────────────────────

export function easeInCubic(t: number): number {
  return t * t * t;
}

export function easeOutCubic(t: number): number {
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

// ─── Shortest-Arc Interpolation ─────────────────────────────────────────────

/** Normalize an angle delta to [-PI, PI] for shortest-arc interpolation */
export function normalizeAngleDelta(delta: number): number {
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  return delta;
}
