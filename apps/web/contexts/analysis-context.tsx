"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { initialAnalysisState } from "@/lib/api-types";
import { mapAnalysisToDashboard } from "@/lib/map-analysis-to-dashboard";
import type { AnalysisState } from "@/lib/api-types";
import type { IncidentData } from "@/lib/dashboard-constants";

interface AnalysisContextValue {
  analysisState: AnalysisState;
  startAnalysis: (framePath: string, frameId: string, simulationId?: string) => void;
  startDemo: () => void;
  isConnected: boolean;
  incidentData: IncidentData;
}

const AnalysisContext = createContext<AnalysisContextValue | null>(null);

const noop = () => {};

export function AnalysisProvider({ children }: { children: ReactNode }) {
  const value = useMemo<AnalysisContextValue>(
    () => ({
      analysisState: initialAnalysisState(),
      startAnalysis: noop,
      startDemo: noop,
      isConnected: false,
      incidentData: mapAnalysisToDashboard(null),
    }),
    [],
  );

  return (
    <AnalysisContext.Provider value={value}>
      {children}
    </AnalysisContext.Provider>
  );
}

export function useAnalysisContext(): AnalysisContextValue {
  const ctx = useContext(AnalysisContext);
  if (!ctx) {
    throw new Error("useAnalysisContext must be used within an AnalysisProvider");
  }
  return ctx;
}
