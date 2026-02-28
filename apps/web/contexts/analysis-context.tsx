"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { useAnalysis, type ConnectionStatus } from "@/hooks/use-analysis";
import type { AnalysisTeams } from "@/lib/api-types";
import type {
  IncidentData,
  FireTruck,
} from "@/lib/dashboard-constants";
import {
  INCIDENT_DATA as FALLBACK_INCIDENT,
  FIRE_TRUCKS as FALLBACK_TRUCKS,
  HEAT_MAP_POINTS as FALLBACK_HEAT,
} from "@/lib/dashboard-constants";
import {
  mapIncidentData,
  mapFireTrucks,
  mapHeatMapPoints,
} from "@/lib/map-analysis-to-dashboard";
import type { TeamName } from "@/lib/api-types";

interface AnalysisContextValue {
  incident: IncidentData;
  trucks: FireTruck[];
  heatMapPoints: [number, number, number][];
  teams: Partial<AnalysisTeams>;
  runningTeam: TeamName | null;
  connectionStatus: ConnectionStatus;
  loading: boolean;
}

const AnalysisContext = createContext<AnalysisContextValue | null>(null);

export function AnalysisProvider({ children }: { children: ReactNode }) {
  const { teams, runningTeam, connectionStatus, loading } = useAnalysis();

  const hasData = Object.keys(teams).length > 0;
  const incident = hasData ? mapIncidentData(teams) : FALLBACK_INCIDENT;
  const trucks = hasData ? mapFireTrucks(teams) : [...FALLBACK_TRUCKS];
  const heatMapPoints = hasData ? mapHeatMapPoints(teams) : FALLBACK_HEAT;

  return (
    <AnalysisContext.Provider
      value={{
        incident,
        trucks,
        heatMapPoints,
        teams,
        runningTeam,
        connectionStatus,
        loading,
      }}
    >
      {children}
    </AnalysisContext.Provider>
  );
}

export function useAnalysisContext(): AnalysisContextValue {
  const ctx = useContext(AnalysisContext);
  if (!ctx) {
    throw new Error("useAnalysisContext must be used within <AnalysisProvider>");
  }
  return ctx;
}
