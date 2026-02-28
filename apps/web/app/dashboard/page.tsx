"use client";

import dynamic from "next/dynamic";
import "./dashboard.css";

const DashboardMap = dynamic(
  () =>
    import("@/components/dashboard/dashboard-map").then(
      (mod) => mod.DashboardMap
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-background">
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping bg-[var(--fire-orange)] opacity-75" />
          <span className="relative inline-flex h-3 w-3 bg-[var(--fire-orange)]" />
        </span>
        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Initializing map...
        </p>
      </div>
    ),
  }
);

export default function DashboardPage() {
  return <DashboardMap />;
}
