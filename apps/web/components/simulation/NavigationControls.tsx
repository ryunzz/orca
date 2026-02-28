"use client";

import { useEffect } from "react";
import { useTelemetry } from "@/hooks/useTelemetry";

export function NavigationControls({ simulationId: _simulationId }: { simulationId: string }) {
  const { sendEvent } = useTelemetry(_simulationId);
  const sendAction = (action: string) => {
    sendEvent({ action, position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 } });
  };

  useEffect(() => {
    const keyMap: Record<string, string> = {
      w: "move_forward",
      s: "move_backward",
      a: "move_left",
      d: "move_right",
      ArrowLeft: "turn_left",
      ArrowRight: "turn_right",
    };

    const handler = (event: KeyboardEvent) => {
      const action = keyMap[event.key];
      if (!action) return;
      event.preventDefault();
      sendAction(action);
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [sendEvent]);

  return (
    <div className="absolute left-4 top-4 rounded-lg border border-slate-600 bg-black/50 p-3 text-sm">
      <p className="mb-2 font-semibold">Controls</p>
      <p>W/A/S/D move | Arrow keys turn</p>
      <button
        className="mt-2 rounded bg-cyan-500 px-3 py-1 text-black"
        onClick={() => sendEvent({ action: "interact", position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 }, })}
      >
        Interact
      </button>
    </div>
  );
}
