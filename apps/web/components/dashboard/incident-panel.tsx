"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Flame } from "lucide-react";
import {
  INCIDENT_DATA,
  FIRE_TRUCKS,
  TRUCK_STATUS_COLORS,
  SEVERITY_COLORS,
  SEVERITY_TEXT_CLASSES,
} from "@/lib/dashboard-constants";

// ---------------------------------------------------------------------------
// Flickering temperature hook — random ±5 fluctuation every 2-3s
// ---------------------------------------------------------------------------
function useFlickeringValue(base: number): number {
  const [value, setValue] = useState(base);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tick = useCallback(() => {
    const offset = Math.round((Math.random() - 0.5) * 10);
    setValue(base + offset);
    const delay = 2000 + Math.random() * 1000;
    timerRef.current = setTimeout(tick, delay);
  }, [base]);

  useEffect(() => {
    const delay = 2000 + Math.random() * 1000;
    timerRef.current = setTimeout(tick, delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [tick]);

  return value;
}

// ---------------------------------------------------------------------------
// Temperature color helper
// ---------------------------------------------------------------------------
function tempColor(temp: number): string {
  if (temp >= 1000) return "var(--fire-red)";
  if (temp >= 500) return "var(--fire-orange)";
  return "var(--fire-amber)";
}

// ---------------------------------------------------------------------------
// Section label component
// ---------------------------------------------------------------------------
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data row component
// ---------------------------------------------------------------------------
function DataRow({
  label,
  value,
  color,
}: {
  label: string;
  value: React.ReactNode;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </span>
      <span
        className="font-mono text-xs font-semibold tabular-nums"
        style={color ? { color } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// IncidentPanel
// ---------------------------------------------------------------------------
export function IncidentPanel() {
  const roofTemp = useFlickeringValue(INCIDENT_DATA.temperatures.roof);
  const interiorTemp = useFlickeringValue(INCIDENT_DATA.temperatures.interior);
  const exteriorTemp = useFlickeringValue(INCIDENT_DATA.temperatures.exterior);

  const severity = INCIDENT_DATA.severity;

  return (
    <motion.div
      initial={{ opacity: 0, x: -24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: "spring", stiffness: 100, damping: 20, delay: 0.3 }}
      className="pointer-events-auto w-80 border border-[var(--annotation-line)] bg-[var(--annotation-bg)] backdrop-blur-md"
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[var(--grid-line)] px-4 py-2.5">
        <Flame className="h-3.5 w-3.5 text-[var(--fire-red)]" />
        <span className="font-mono text-[10px] font-semibold tracking-[0.1em] text-foreground">
          {INCIDENT_DATA.id}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2"
            style={{ background: SEVERITY_COLORS[severity] }}
          />
          <span
            className={`font-mono text-[9px] font-semibold tracking-[0.1em] ${SEVERITY_TEXT_CLASSES[severity]}`}
          >
            {severity}
          </span>
        </div>
      </div>

      {/* Building info */}
      <div className="border-b border-[var(--grid-line)] px-4 py-2.5">
        <div className="font-display text-sm font-semibold text-foreground">
          {INCIDENT_DATA.buildingName}
        </div>
        <div className="mt-0.5 font-mono text-[9px] text-muted-foreground">
          {INCIDENT_DATA.address}
        </div>
      </div>

      {/* Status block */}
      <div className="space-y-1.5 border-b border-[var(--grid-line)] px-4 py-2.5">
        <DataRow
          label="Status"
          value={INCIDENT_DATA.fireStatus}
          color="var(--fire-red)"
        />
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
            Alarm Level
          </span>
          <div className="flex items-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <span
                key={i}
                className="inline-block h-1.5 w-1.5"
                style={{
                  background:
                    i < INCIDENT_DATA.alarmLevel
                      ? "var(--fire-red)"
                      : "var(--grid-line)",
                }}
              />
            ))}
            <span className="ml-1 font-mono text-[9px] font-semibold tabular-nums text-foreground">
              {INCIDENT_DATA.alarmLevel}
            </span>
          </div>
        </div>
        <DataRow
          label="Elapsed"
          value={INCIDENT_DATA.elapsedTime}
          color="var(--fire-amber)"
        />
      </div>

      {/* Structural data */}
      <div className="space-y-1.5 border-b border-[var(--grid-line)] px-4 py-2.5">
        <SectionLabel>Structural</SectionLabel>
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
            Integrity
          </span>
          <div className="flex items-center gap-2">
            <div className="h-1 w-20 bg-[var(--grid-line)]">
              <div
                className="h-full transition-all duration-500"
                style={{
                  width: `${INCIDENT_DATA.structuralIntegrity}%`,
                  background:
                    INCIDENT_DATA.structuralIntegrity > 70
                      ? "var(--fire-amber)"
                      : INCIDENT_DATA.structuralIntegrity > 40
                        ? "var(--fire-orange)"
                        : "var(--fire-red)",
                }}
              />
            </div>
            <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
              {INCIDENT_DATA.structuralIntegrity}%
            </span>
          </div>
        </div>
        <DataRow
          label="Roof Temp"
          value={`${roofTemp}°C`}
          color={tempColor(roofTemp)}
        />
        <DataRow
          label="Interior"
          value={`${interiorTemp}°C`}
          color={tempColor(interiorTemp)}
        />
        <DataRow
          label="Exterior"
          value={`${exteriorTemp}°C`}
          color={tempColor(exteriorTemp)}
        />
      </div>

      {/* Environmental */}
      <div className="space-y-1.5 border-b border-[var(--grid-line)] px-4 py-2.5">
        <SectionLabel>Environmental</SectionLabel>
        <DataRow label="Spread" value={INCIDENT_DATA.spreadDirection} />
        <DataRow
          label="Wind"
          value={`${INCIDENT_DATA.windSpeed} km/h ${INCIDENT_DATA.windDirection}`}
        />
        <DataRow label="Occupancy Est." value={INCIDENT_DATA.occupancyEstimate} />
        <DataRow label="Active Floors" value={INCIDENT_DATA.activeFloors} />
      </div>

      {/* Units */}
      <div className="px-4 py-2.5">
        <SectionLabel>Units Deployed</SectionLabel>
        <div className="mt-1.5 space-y-1">
          {FIRE_TRUCKS.map((truck) => {
            const color = TRUCK_STATUS_COLORS[truck.status];
            return (
              <div
                key={truck.id}
                className="flex items-center gap-2 font-mono text-[9px]"
              >
                <span
                  className="inline-block h-1.5 w-1.5 shrink-0"
                  style={{ background: color, boxShadow: `0 0 4px ${color}` }}
                />
                <span className="w-16 font-semibold tracking-[0.05em] text-foreground">
                  {truck.callsign}
                </span>
                <span
                  className="w-20 tracking-[0.05em]"
                  style={{ color }}
                >
                  {truck.status.replace("_", " ")}
                </span>
                <span className="ml-auto tabular-nums text-muted-foreground">
                  {truck.distanceM}m
                </span>
                {truck.etaSeconds > 0 && (
                  <span className="tabular-nums text-[var(--fire-amber)]">
                    {truck.etaSeconds}s
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
