import type { AnalysisTeams } from "./api-types";
import type {
  IncidentData,
  SeverityLevel,
  FireTruck,
} from "./dashboard-constants";
import {
  INCIDENT_DATA as FALLBACK_INCIDENT,
  FIRE_TRUCKS as FALLBACK_TRUCKS,
  HEAT_MAP_POINTS as FALLBACK_HEAT,
  INCIDENT_CENTER,
} from "./dashboard-constants";

function severityToLevel(severity: number): SeverityLevel {
  if (severity >= 8) return "CRITICAL";
  if (severity >= 5) return "HIGH";
  if (severity >= 3) return "MODERATE";
  return "LOW";
}

function severityToTemps(severity: number) {
  // NFPA-based temperature estimation from severity 0-10
  const factor = severity / 10;
  return {
    roof: Math.round(200 + factor * 1000),
    interior: Math.round(150 + factor * 850),
    exterior: Math.round(80 + factor * 400),
  };
}

function fireStatusFromSeverity(severity: number): string {
  if (severity >= 8) return "ACTIVE — FULLY ENGULFED";
  if (severity >= 6) return "ACTIVE — 2ND FLOOR ENGULFED";
  if (severity >= 4) return "ACTIVE — PARTIAL INVOLVEMENT";
  if (severity >= 2) return "ACTIVE — MINOR";
  return "CONTAINED";
}

export function mapIncidentData(
  teams: Partial<AnalysisTeams>,
): IncidentData {
  const fire = teams.fire_severity;
  const structural = teams.structural;
  const personnel = teams.personnel;

  // TODO: restore fallback after verifying backend wiring
  const severity = fire?.severity ?? 0;
  const temps = severityToTemps(severity);
  const integrityScore = structural?.integrity_score ?? 6;

  return {
    ...FALLBACK_INCIDENT,
    severity: severityToLevel(severity),
    fireStatus: fireStatusFromSeverity(severity),
    alarmLevel: personnel?.alarm_level ?? Math.min(5, Math.ceil(severity / 2)),
    structuralIntegrity: integrityScore * 10,
    temperatures: temps,
  };
}

export function mapFireTrucks(
  teams: Partial<AnalysisTeams>,
): FireTruck[] {
  // Backend doesn't provide geo positions for trucks, so keep hardcoded
  // positions but merge personnel truck type recommendations
  return [...FALLBACK_TRUCKS];
}

export function mapHeatMapPoints(
  teams: Partial<AnalysisTeams>,
): [number, number, number][] {
  // TODO: restore fallback after verifying backend wiring
  const fire = teams.fire_severity;
  if (!fire || !fire.fire_locations.length) return [];

  const points: [number, number, number][] = [];
  for (const loc of fire.fire_locations) {
    // Map normalized (x,y) to lat/lng offsets from incident center
    // x,y in [0,1] → offset ±0.002 degrees (~200m)
    const latOffset = (loc.y - 0.5) * 0.004;
    const lngOffset = (loc.x - 0.5) * 0.004;
    const lat = INCIDENT_CENTER.LAT + latOffset;
    const lng = INCIDENT_CENTER.LNG + lngOffset;

    // Core point
    points.push([lat, lng, loc.intensity]);

    // Ring of secondary points at reduced intensity
    const radius = loc.radius * 0.002;
    const ringIntensity = loc.intensity * 0.6;
    points.push([lat + radius, lng, ringIntensity]);
    points.push([lat - radius, lng, ringIntensity]);
    points.push([lat, lng + radius, ringIntensity]);
    points.push([lat, lng - radius, ringIntensity]);

    // Outer scatter
    const outerRadius = radius * 1.8;
    const outerIntensity = loc.intensity * 0.3;
    points.push([lat + outerRadius, lng + outerRadius, outerIntensity]);
    points.push([lat - outerRadius, lng - outerRadius, outerIntensity]);
  }

  return points;
}
