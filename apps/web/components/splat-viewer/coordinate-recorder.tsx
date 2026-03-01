"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";

/**
 * Dev-only utility that captures the current camera position when R is pressed,
 * then logs a formatted ScriptedWaypoint JSON object to the console for easy
 * copy-paste into agent-scenario.ts path arrays.
 *
 * Mount inside <Canvas> — only rendered in development mode.
 */
export function CoordinateRecorder() {
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "r" && e.key !== "R") return;
      // Avoid capturing when user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      const { x, y, z } = camera.position;
      const waypoint = `{ coordinates: [${x.toFixed(4)}, ${y.toFixed(4)}, ${z.toFixed(4)}], delay: 0, alert: null },`;

      console.log(
        "%c[Waypoint Recorded]",
        "color: #66d9ff; font-weight: bold;",
        `\n${waypoint}`,
      );
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [camera]);

  return null;
}
