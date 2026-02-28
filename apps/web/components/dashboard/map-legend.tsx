"use client";

import { TRUCK_STATUS_COLORS } from "@/lib/dashboard-constants";
import type { TruckStatus } from "@/lib/dashboard-constants";

const STATUS_ENTRIES: { label: string; status: TruckStatus }[] = [
  { label: "RESPONDING", status: "RESPONDING" },
  { label: "ON SCENE", status: "ON_SCENE" },
  { label: "STAGED", status: "STAGED" },
];

export function MapLegend() {
  return (
    <div className="pointer-events-auto w-48 border border-[var(--grid-line)] bg-[var(--annotation-bg)] p-3 backdrop-blur-md">
      {/* Thermal intensity */}
      <div className="mb-3">
        <div className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
          Thermal Intensity
        </div>
        <div
          className="h-1.5 w-full"
          style={{
            background:
              "linear-gradient(to right, #F2A922, #F27623, #E03C31, #FF1A1A)",
          }}
        />
        <div className="mt-1 flex justify-between font-mono text-[7px] uppercase tracking-[0.1em] text-muted-foreground">
          <span>Low</span>
          <span>High</span>
        </div>
      </div>

      {/* Unit status */}
      <div className="border-t border-[var(--grid-line)] pt-2">
        <div className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
          Units
        </div>
        <div className="space-y-1">
          {STATUS_ENTRIES.map((entry) => (
            <div key={entry.status} className="flex items-center gap-2">
              <span
                className="inline-block h-2 w-2"
                style={{
                  background: TRUCK_STATUS_COLORS[entry.status],
                  boxShadow: `0 0 4px ${TRUCK_STATUS_COLORS[entry.status]}`,
                }}
              />
              <span className="font-mono text-[8px] tracking-[0.1em] text-muted-foreground">
                {entry.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
