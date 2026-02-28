"use client";

import { useTelemetryStream } from "@/hooks/useTelemetry";

export function TelemetryOverlay({ simulationId }: { simulationId: string }) {
  const { latest } = useTelemetryStream(simulationId);

  if (!latest) return null;

  return (
    <div className="pointer-events-none absolute right-4 top-4 rounded bg-black/60 px-3 py-2 text-xs">
      <p>x: {latest.position.x.toFixed(2)}</p>
      <p>y: {latest.position.y.toFixed(2)}</p>
      <p>z: {latest.position.z.toFixed(2)}</p>
      <p>action: {latest.action ?? "idle"}</p>
    </div>
  );
}
