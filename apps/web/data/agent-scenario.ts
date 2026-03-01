import type { AgentScenario } from "@/lib/agent-paths";

/**
 * Static agent scenario data.
 *
 * To record waypoints:
 * 1. Run `bun dev` and open the scene
 * 2. Navigate the camera to a desired position
 * 3. Press R — coordinates are logged to the browser console
 * 4. Paste the logged waypoint objects into the path arrays below
 */
export const defaultScenario: AgentScenario = {
  agents: [
    {
      id: "alpha",
      label: "Engine 1",
      color: "#66d9ff",
      paths: {
        primary: [],
        alternate: [
          { coordinates: [-1.0, -0.1493, 0.1050], delay: 0.25, alert: null },
          { coordinates: [1.7490, -0.3302, 0.8379], delay: 0.25, alert: null },
          { coordinates: [2.6880, -0.2270, 0.4778], delay: 0.25, alert: null },
          { coordinates: [4.5835, 0.3242, 0.9589], delay: 0.25, alert: "BARRED WINDOWS — COLLAPSE RISK" },
          { coordinates: [6.4370, 0.3697, 1.7754], delay: 0.25, alert: "DEBRIS FIELD — NO ENTRY" },
          { coordinates: [9.2503, 0.0008, 2.0473], delay: 0.25, alert: null },
          { coordinates: [11.5, 0.0887, 1.1450], delay: 0.25, alert: "FIRE BEHIND DOOR — EXTREME HEAT" },
        ],
      },
    },
    {
      id: "bravo",
      label: "Ladder 1",
      color: "#ff6b6b",
      paths: {
        primary: [],
        alternate: [],
      },
    },
    {
      id: "charlie",
      label: "Rescue 1",
      color: "#ffd93d",
      paths: {
        primary: [],
        alternate: [],
      },
    },
    {
      id: "delta",
      label: "Command",
      color: "#6bff6b",
      paths: {
        primary: [],
        alternate: [],
      },
    },
  ],
};
