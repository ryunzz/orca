import type { FullAnalysisResult } from "@/lib/api-types";
import { INCIDENT_DATA, type IncidentData, type SeverityLevel } from "@/lib/dashboard-constants";

/**
 * Map a backend FullAnalysisResult into the IncidentData shape
 * the dashboard already understands, falling back to INCIDENT_DATA
 * defaults for any missing fields.
 */
export function mapAnalysisToDashboard(
  result: FullAnalysisResult | null
): IncidentData {
  if (!result) return INCIDENT_DATA;

  const fire = result.teams.fire_severity;
  const structural = result.teams.structural;
  const personnel = result.teams.personnel;

  // --- severity ---
  const severity = mapSeverity(
    fire?.overall_severity as string | undefined
  );

  // --- fireStatus ---
  const fireDetected = fire?.fire_detected as boolean | undefined;
  const fireStatus = mapFireStatus(fireDetected, severity);

  // --- alarmLevel ---
  const classification = personnel?.incident_classification as
    | Record<string, unknown>
    | undefined;
  const alarmLevel =
    typeof classification?.alarm_level === "number"
      ? classification.alarm_level
      : INCIDENT_DATA.alarmLevel;

  // --- structuralIntegrity ---
  const integrityScore = structural?.integrity_score as number | undefined;
  const structuralIntegrity =
    typeof integrityScore === "number"
      ? Math.round(integrityScore * 100)
      : INCIDENT_DATA.structuralIntegrity;

  // --- temperatures ---
  const fireLocations = fire?.fire_locations as
    | { estimated_temperature?: number }[]
    | undefined;
  const temperatures = mapTemperatures(fireLocations);

  return {
    severity,
    fireStatus,
    alarmLevel,
    structuralIntegrity,
    temperatures,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapSeverity(raw: string | undefined): SeverityLevel {
  if (!raw) return INCIDENT_DATA.severity;
  const upper = raw.toUpperCase();
  if (upper === "LOW" || upper === "MODERATE" || upper === "HIGH" || upper === "CRITICAL") {
    return upper as SeverityLevel;
  }
  // backend may send "minor" / "severe" — normalize
  if (upper === "MINOR") return "LOW";
  if (upper === "SEVERE" || upper === "EXTREME") return "CRITICAL";
  return "MODERATE";
}

function mapFireStatus(
  detected: boolean | undefined,
  severity: SeverityLevel
): string {
  if (detected === false) return "CONTAINED";
  switch (severity) {
    case "LOW":
      return "CONTAINED";
    case "MODERATE":
      return "ACTIVE";
    case "HIGH":
      return "SPREADING";
    case "CRITICAL":
      return "UNCONTROLLED";
    default:
      return INCIDENT_DATA.fireStatus;
  }
}

function mapTemperatures(
  locations: { estimated_temperature?: number }[] | undefined
): IncidentData["temperatures"] {
  if (!locations || locations.length === 0) return INCIDENT_DATA.temperatures;

  const temps = locations
    .map((l) => l.estimated_temperature)
    .filter((t): t is number => typeof t === "number");

  if (temps.length === 0) return INCIDENT_DATA.temperatures;

  const maxTemp = Math.max(...temps);
  return {
    roof: Math.round(maxTemp * 0.9),
    interior: Math.round(maxTemp),
    exterior: Math.round(maxTemp * 0.4),
  };
}
