export interface ScriptedWaypoint {
  coordinates: [number, number, number];
  delay: number; // pause seconds at this waypoint before proceeding
  alert: string | null; // optional alert text
}

export interface AgentConfig {
  id: string;
  label: string;
  color: string;
  paths: {
    primary: ScriptedWaypoint[];
    alternate: ScriptedWaypoint[];
  };
}

export interface AgentScenario {
  agents: AgentConfig[];
}
