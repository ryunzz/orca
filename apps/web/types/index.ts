export type SimulationSummary = {
  id: string;
  name: string;
  environment_type: string;
  status: string;
};

export type Simulation = {
  id: string;
  name: string;
  environment_type: string;
  world_model_config: Record<string, unknown>;
  status: string;
  metadata?: Record<string, unknown>;
};

export type Vector3 = { x: number; y: number; z: number };
export type Rotation = { pitch: number; yaw: number; roll: number };

export type TelemetryEvent = {
  simulation_id: string;
  user_id: string;
  position: Vector3;
  rotation: Rotation;
  action?: string;
  timestamp_ms: number;
};

export type TelemetryBatchRequest = {
  simulation_id: string;
  user_id: string;
  events: Omit<TelemetryEvent, "simulation_id" | "user_id">[];
};

export type AgentNode = {
  id: string;
  node_type: string;
  status: string;
  wallet_address?: string | null;
};

export type AgentCreateRequest = {
  node_type: string;
  wallet_address?: string;
  compute_specs?: Record<string, unknown>;
};

export type RoutingRequest = {
  simulation_id: string;
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  vehicle_type: string;
};

export type PaymentRequest = {
  agent_node_ids: string[];
  amount_lamports: number;
};

export type PaymentStatusResponse = {
  status: string;
  tx_signature?: string | null;
};

export type SimulationCreateRequest = {
  name: string;
  environment_type: string;
  world_model_config: Record<string, unknown>;
};
