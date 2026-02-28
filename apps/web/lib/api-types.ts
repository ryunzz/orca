export interface FireLocation {
  label: string;
  intensity: number;
  x: number;
  y: number;
  radius: number;
}

export interface FuelSource {
  material: string;
  flammability: "low" | "medium" | "high";
  location_label: string;
}

export interface FireSeverityResult {
  severity: number;
  fire_locations: FireLocation[];
  fuel_sources: FuelSource[];
  smoke_density: "none" | "light" | "moderate" | "heavy" | "zero_visibility";
  confidence: number;
  frame_id: string;
  timestamp: string;
}

export interface StructuralObject {
  type: string;
  condition: "intact" | "damaged" | "compromised" | "destroyed";
  location_label: string;
  x: number;
  y: number;
  notes: string;
}

export interface BlockedPassage {
  passage: string;
  reason: "fire" | "debris" | "structural_failure" | "smoke";
  severity: "partial" | "complete";
}

export interface StructuralResult {
  objects: StructuralObject[];
  integrity_score: number;
  blocked_passages: BlockedPassage[];
  collapse_risk: "none" | "low" | "moderate" | "high" | "imminent";
  degradation_timeline: {
    minutes_to_concern: number;
    minutes_to_critical: number;
    factors: string[];
  };
  frame_id: string;
  timestamp: string;
}

export interface EvacuationRoute {
  route_id: string;
  path: string[];
  risk_level: "safe" | "caution" | "dangerous" | "blocked";
  estimated_time_seconds?: number;
  hazards: string[];
  recommended: boolean;
  objective?: string;
  equipment_needed?: string[];
}

export interface EvacuationResult {
  civilian_exits: EvacuationRoute[];
  firefighter_entries: EvacuationRoute[];
  risk_scores: Record<string, Record<string, number>>;
  frame_id: string;
  timestamp: string;
}

export interface PersonnelTruck {
  type: string;
  count: number;
}

export interface PersonnelEquipment {
  item: string;
  quantity: number;
  priority: "critical" | "recommended";
}

export interface PersonnelResult {
  firefighters: number;
  trucks: PersonnelTruck[];
  equipment: PersonnelEquipment[];
  eta_containment_min: number;
  strategy: string;
  alarm_level: number;
  staging_location: string;
  priority_actions: string[];
  timestamp: string;
}

export interface AnalysisTeams {
  fire_severity: FireSeverityResult;
  structural: StructuralResult;
  evacuation: EvacuationResult;
  personnel: PersonnelResult;
}

export interface DemoAnalysisResponse {
  simulation_id: string;
  frame_id: string;
  teams: AnalysisTeams;
  spread_timeline: Record<string, unknown>[];
}

export type TeamName = keyof AnalysisTeams;

export interface WsTeamRunning {
  team: TeamName;
  status: "running";
}

export interface WsTeamComplete {
  team: TeamName;
  status: "complete";
  result: Record<string, unknown>;
}

export interface WsFinalComplete {
  status: "complete";
  all_results: DemoAnalysisResponse;
}

export type WsMessage = WsTeamRunning | WsTeamComplete | WsFinalComplete;
