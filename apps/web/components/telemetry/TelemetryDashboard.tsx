"use client";

import { useTelemetryStream } from "@/hooks/useTelemetry";

export function TelemetryDashboard({ simulationId }: { simulationId: string }) {
  const { samples } = useTelemetryStream(simulationId);

  return (
    <section className="h-full rounded-lg border border-slate-700 bg-surface p-4">
      <h3 className="font-semibold">Telemetry</h3>
      <p className="text-xs text-slate-300">Events: {samples.length}</p>
      <div className="mt-3 max-h-[55vh] space-y-2 overflow-auto text-sm">
        {samples.slice(-10).map((sample, idx) => (
          <div key={`${sample.timestamp_ms}-${idx}`} className="rounded border border-slate-700 bg-slate-900/40 p-2">
            <p>{sample.action ?? "tick"}</p>
            <p className="text-xs text-slate-400">
              pos: ({sample.position.x.toFixed(2)}, {sample.position.y.toFixed(2)}, {sample.position.z.toFixed(2)})
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
