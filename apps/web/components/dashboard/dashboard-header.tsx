"use client";

import Link from "next/link";
import { ArrowLeft, Flame } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { useAnalysisContext } from "@/contexts/analysis-context";

export function DashboardHeader() {
  const { incident: INCIDENT_DATA, connectionStatus } = useAnalysisContext();

  const isLive = connectionStatus === "live";

  return (
    <header className="pointer-events-auto flex h-10 items-center justify-between border-b border-[var(--grid-line)] bg-[hsl(0_0%_4%/0.85)] px-4 backdrop-blur-sm">
      {/* Left section */}
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="font-mono text-[9px] uppercase tracking-[0.15em]">
            Back
          </span>
        </Link>

        <div className="h-4 w-px bg-[var(--grid-line)]" />

        <div className="flex items-center gap-1.5">
          <Flame className="h-3.5 w-3.5 text-[var(--fire-orange)]" />
          <span className="font-mono text-[10px] font-semibold tracking-[0.2em] text-foreground">
            {APP_NAME}
          </span>
        </div>

        <div className="h-4 w-px bg-[var(--grid-line)]" />

        {/* LIVE / OFFLINE badge */}
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            {isLive && (
              <span className="absolute inline-flex h-full w-full animate-ping bg-[var(--fire-red)] opacity-75" />
            )}
            <span
              className="relative inline-flex h-2 w-2"
              style={{ background: isLive ? "var(--fire-red)" : "var(--grid-line)" }}
            />
          </span>
          <span
            className="font-mono text-[9px] font-semibold tracking-[0.15em]"
            style={{ color: isLive ? "var(--fire-red)" : "var(--grid-line)" }}
          >
            {isLive ? "LIVE" : "OFFLINE"}
          </span>
        </div>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-3 font-mono text-[9px] tracking-[0.1em] text-muted-foreground">
        <span>{INCIDENT_DATA.id}</span>
        <div className="h-4 w-px bg-[var(--grid-line)]" />
        <span>{INCIDENT_DATA.sector}</span>
        <div className="h-4 w-px bg-[var(--grid-line)]" />
        <span className="tabular-nums text-[var(--fire-amber)]">
          T+ {INCIDENT_DATA.elapsedTime}
        </span>
      </div>
    </header>
  );
}
