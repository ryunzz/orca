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
        alternate: [],
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
