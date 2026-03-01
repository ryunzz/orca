// ---------------------------------------------------------------------------
// Types matching the backend /ws/analysis WebSocket message format
// ---------------------------------------------------------------------------

export type TeamType =
  | "fire_severity"
  | "structural"
  | "evacuation"
  | "personnel";

export const TEAM_ORDER: TeamType[] = [
  "fire_severity",
  "structural",
  "evacuation",
  "personnel",
];

/** Sent by backend when a team starts or finishes. */
export interface TeamStatusMessage {
  team: TeamType;
  status: "running" | "complete";
  result?: Record<string, unknown>;
}

/** Final message sent after all teams complete. */
export interface AnalysisCompleteMessage {
  status: "complete";
  all_results: FullAnalysisResult;
}

/** Error message from the server. */
export interface AnalysisErrorMessage {
  status: "error";
  error: string;
}

// ---------------------------------------------------------------------------
// Observability metrics
// ---------------------------------------------------------------------------

export interface OptimizedPathMetric {
  path: string[];
  total_cost: number;
  risk_level: "safe" | "caution" | "dangerous" | "blocked";
  room_count: number;
  room_risks: Record<string, Record<string, number>>;
}

export interface SurvivabilityMetric {
  minutes_remaining: number | null;
  viable: boolean;
  worst_room: string | null;
  worst_room_intensity: number;
}

export interface HeatExposureMetric {
  total_score: number;
  classification: "minimal" | "moderate" | "severe" | "lethal";
  per_room: Record<string, number>;
}

export interface MetricsSnapshot {
  optimized_path: OptimizedPathMetric;
  survivability: SurvivabilityMetric;
  heat_exposure: HeatExposureMetric;
}

/** Shape of the full analysis payload from the backend. */
export interface FullAnalysisResult {
  simulation_id: string;
  frame_id: string;
  teams: Record<TeamType, Record<string, unknown>>;
  spread_timeline: Record<string, unknown>[];
  metrics?: MetricsSnapshot;
}

/** Per-team status tracked on the client side. */
export interface TeamState {
  status: "pending" | "running" | "complete";
  result: Record<string, unknown> | null;
}

/** Top-level state managed by the useAnalysis hook. */
export interface AnalysisState {
  connected: boolean;
  analyzing: boolean;
  teams: Record<TeamType, TeamState>;
  fullResult: FullAnalysisResult | null;
  metrics: MetricsSnapshot | null;
  error: string | null;
}

export function initialAnalysisState(): AnalysisState {
  const teams = {} as Record<TeamType, TeamState>;
  for (const t of TEAM_ORDER) {
    teams[t] = { status: "pending", result: null };
  }
  return {
    connected: false,
    analyzing: false,
    teams,
    fullResult: null,
    metrics: null,
    error: null,
  };
}
