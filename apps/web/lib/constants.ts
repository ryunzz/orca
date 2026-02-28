// ─── App Identity ────────────────────────────────────────────────────────────
export const APP_NAME = "PYROSIGHT" as const;
export const APP_TAGLINE = "AI Fire Intelligence" as const;

// ─── Hero Content ────────────────────────────────────────────────────────────
export const HERO_TITLE_LINE1 = "PREDICTIVE" as const;
export const HERO_TITLE_LINE2 = "FIRE INTELLIGENCE" as const;
export const HERO_SUBTITLE =
  "Real-time world models of burning structures. Swarms of predictive agents that see through smoke, map escape routes, and guide first responders — before the situation escalates." as const;

// ─── Metadata ────────────────────────────────────────────────────────────────
export const META_TITLE = "PyroSight — AI Fire Intelligence" as const;
export const META_DESCRIPTION =
  "Real-time structural analysis and predictive fire intelligence for emergency first responders." as const;

// ─── Capability Badges ──────────────────────────────────────────────────────
export const CAPABILITIES = [
  { label: "STRUCTURAL ANALYSIS", icon: "Shield" },
  { label: "SPREAD PREDICTION", icon: "Activity" },
  { label: "RESCUE ROUTING", icon: "Route" },
] as const;

// ─── Data Point Annotations ─────────────────────────────────────────────────
export interface DataPoint {
  id: string;
  label: string;
  unit: string;
  baseValue: number;
  criticalValue: number;
  containedValue: number;
  /** Position relative to the visualization container (0-1) */
  x: number;
  y: number;
  /** Connector line end point relative to the container */
  connectorX: number;
  connectorY: number;
}

export const DATA_POINTS: DataPoint[] = [
  {
    id: "roof-temp",
    label: "ROOF TEMP",
    unit: "°C",
    baseValue: 890,
    criticalValue: 1120,
    containedValue: 210,
    x: 0.05,
    y: 0.08,
    connectorX: 0.35,
    connectorY: 0.2,
  },
  {
    id: "spread-dir",
    label: "SPREAD DIR",
    unit: "°NE",
    baseValue: 45,
    criticalValue: 67,
    containedValue: 0,
    x: 0.72,
    y: 0.05,
    connectorX: 0.6,
    connectorY: 0.25,
  },
  {
    id: "structural",
    label: "STRUCTURAL",
    unit: "%",
    baseValue: 72,
    criticalValue: 34,
    containedValue: 89,
    x: 0.78,
    y: 0.45,
    connectorX: 0.62,
    connectorY: 0.5,
  },
  {
    id: "occupant-prob",
    label: "OCCUPANT PROB",
    unit: "%",
    baseValue: 23,
    criticalValue: 8,
    containedValue: 0,
    x: 0.02,
    y: 0.55,
    connectorX: 0.3,
    connectorY: 0.6,
  },
  {
    id: "flashover",
    label: "FLASHOVER RISK",
    unit: "%",
    baseValue: 67,
    criticalValue: 94,
    containedValue: 3,
    x: 0.75,
    y: 0.75,
    connectorX: 0.55,
    connectorY: 0.7,
  },
  {
    id: "egress",
    label: "EGRESS ROUTES",
    unit: "",
    baseValue: 3,
    criticalValue: 1,
    containedValue: 4,
    x: 0.02,
    y: 0.82,
    connectorX: 0.25,
    connectorY: 0.75,
  },
] as const;

// ─── Status Ticker ──────────────────────────────────────────────────────────
export const STATUS_LABELS = [
  { label: "12 AGENTS ACTIVE", key: "agents" },
  { label: "SPREAD: 94.2% ACC", key: "spread" },
  { label: "6 MODELS RUNNING", key: "models" },
  { label: "LATENCY: 12ms", key: "latency" },
  { label: "THERMAL GRID: ONLINE", key: "thermal" },
  { label: "PREDICTION HORIZON: 180s", key: "horizon" },
] as const;

// ─── Animation Phase Durations ────────────────────────────────────────────────
export const PHASE_DURATIONS_MS = {
  IGNITION: 3000,
  FULL_BURN: 4000,
  SUPPRESSION: 3000,
  RECOVERY: 2000,
} as const;

// ─── Fire Colors (hex for canvas — canvas doesn't support oklch) ────────────
export const FIRE_COLORS = {
  RED: "#E03C31",
  ORANGE: "#F27623",
  AMBER: "#F2A922",
  YELLOW: "#F5D547",
  GLOW: "rgba(242, 118, 35, 0.15)",
} as const;

