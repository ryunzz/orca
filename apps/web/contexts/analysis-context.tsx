"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useAnalysis } from "@/hooks/use-analysis";
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

export function AnalysisProvider({ children }: { children: ReactNode }) {
  const { state, startAnalysis, startDemo, isConnected } = useAnalysis();
  const demoStarted = useRef(false);

  // Auto-start demo analysis once connected
  useEffect(() => {
    if (isConnected && !demoStarted.current) {
      demoStarted.current = true;
      startDemo();
    }
  }, [isConnected, startDemo]);

  const incidentData = useMemo(
    () => mapAnalysisToDashboard(state.fullResult),
    [state.fullResult]
  );

  const value = useMemo<AnalysisContextValue>(
    () => ({
      analysisState: state,
      startAnalysis,
      startDemo,
      isConnected,
      incidentData,
    }),
    [state, startAnalysis, startDemo, isConnected, incidentData]
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
