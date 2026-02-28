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
  DOT_SIZE: 1,
  WIDTH: 800,
  HEIGHT: 800,
  MAX_DPR: 2,
} as const;

// ─── Target Location: Urbana-Champaign ──────────────────────────────────────

export const TARGET_LOCATION = {
  LAT: 40.11,
  LNG: -88.21,
  LABEL: "URBANA-CHAMPAIGN",
} as const;

// ─── Incident Nodes ─────────────────────────────────────────────────────────

export const INCIDENT_NODES = [
  { lat: 40.71, lng: -74.01, label: "NEW YORK", alertType: "FIRE DETECTED" },
  { lat: -33.87, lng: 151.21, label: "SYDNEY", alertType: "SEISMIC EVENT" },
  { lat: 51.51, lng: -0.13, label: "LONDON", alertType: "DEPLOYING AGENTS" },
  { lat: 34.05, lng: -118.24, label: "LOS ANGELES", alertType: "EVACUATION ACTIVE" },
  { lat: 35.68, lng: 139.69, label: "TOKYO", alertType: "STRUCTURAL ALERT" },
  { lat: 19.08, lng: 72.88, label: "MUMBAI", alertType: "FLOOD WARNING" },
  { lat: 23.42, lng: 3.84, label: "SAHARA", alertType: "SANDSTORM WARNING" },
  { lat: 4.71, lng: -74.07, label: "BOGOTÁ", alertType: "VOLCANIC ACTIVITY" },
  { lat: 20.90, lng: -156.33, label: "HAWAII", alertType: "WILDFIRE ALERT" },
  { lat: -6.21, lng: 106.85, label: "JAKARTA", alertType: "TSUNAMI ALERT" },
] as const;

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

// ─── Idle Spin ──────────────────────────────────────────────────────────────

/** Phi increment per frame during IDLE */
export const IDLE_SPIN_SPEED = 0.002;

/** Initial globe theta (latitude tilt) */
export const INITIAL_THETA = 0.3;

// ─── Easing Functions ───────────────────────────────────────────────────────

export function easeInCubic(t: number): number {
  return t * t * t;
}

export function easeOutCubic(t: number): number {
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ─── Shortest-Arc Interpolation ─────────────────────────────────────────────

/** Normalize an angle delta to [-PI, PI] for shortest-arc interpolation */
export function normalizeAngleDelta(delta: number): number {
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  return delta;
}

// ─── Globe Radius ─────────────────────────────────────────────────────────

/** Cobe sphere radius as fraction of container min-dimension (sqrt(0.64) ≈ 0.8 in NDC → 0.40 of container) */
export const GLOBE_SCREEN_RADIUS_FACTOR = 0.40;

// ─── Screen Projection ─────────────────────────────────────────────────────

/**
 * Project a lat/lng coordinate to 2D screen position given the globe's
 * current rotation. Matches cobe's GLSL shader coordinate system.
 */
export function projectToScreen(
  lat: number,
  lng: number,
  globePhi: number,
  globeTheta: number,
  centerX: number,
  centerY: number,
  radius: number
): { x: number; y: number; visible: boolean; vz: number } {
  const latRad = lat * DEG_TO_RAD;
  const lngRad = lng * DEG_TO_RAD;
  const phiPlusLng = globePhi + lngRad;

  const cosLat = Math.cos(latRad);
  const sinLat = Math.sin(latRad);
  const cosPhiLng = Math.cos(phiPlusLng);
  const sinPhiLng = Math.sin(phiPlusLng);
  const cosTheta = Math.cos(globeTheta);
  const sinTheta = Math.sin(globeTheta);

  // Cobe view-space (derived from cobe's GLSL shader)
  const vx = cosLat * cosPhiLng;
  const vy = sinTheta * cosLat * sinPhiLng + cosTheta * sinLat;
  const vz = -cosTheta * cosLat * sinPhiLng + sinTheta * sinLat;

  // Screen Y is flipped (CSS top-down vs GL bottom-up)
  const x = centerX + vx * radius;
  const y = centerY - vy * radius;
  const visible = vz > 0.15;

  return { x, y, visible, vz };
}
