"use client";

import { useEffect, useState } from "react";
import { fetchSimulation } from "@/lib/api";
import type { Simulation } from "@/types";

export function useSimulation(simulationId: string) {
  const [environment, setEnvironment] = useState<Simulation | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchSimulation(simulationId).then((data) => {
      if (mounted) setEnvironment(data);
    });

    return () => {
      mounted = false;
    };
  }, [simulationId]);

  return { environment };
}
