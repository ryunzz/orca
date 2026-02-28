import { API_URL } from "@/lib/constants";
import type { SimulationCreateRequest, Simulation, TelemetryBatchRequest, AgentCreateRequest, RoutingRequest, PaymentRequest, PaymentStatusResponse } from "@/types";

export async function createSimulation(payload: SimulationCreateRequest) {
  const response = await fetch(`${API_URL}/api/simulation/create`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.json();
}

export async function fetchSimulation(id: string): Promise<Simulation> {
  const response = await fetch(`${API_URL}/api/simulation/${id}`);
  return response.json();
}

export async function fetchTelemetryAgg(id: string) {
  const response = await fetch(`${API_URL}/api/simulation/${id}/telemetry`);
  return response.json();
}

export async function submitTelemetryBatch(payload: TelemetryBatchRequest) {
  const response = await fetch(`${API_URL}/api/telemetry/batch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.json();
}

export async function createAgent(payload: AgentCreateRequest) {
  const response = await fetch(`${API_URL}/api/agents/spawn`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.json();
}

export async function fetchAgentStatus() {
  const response = await fetch(`${API_URL}/api/agents/status`);
  return response.json();
}

export async function optimizeRoute(payload: RoutingRequest) {
  const response = await fetch(`${API_URL}/api/routing/optimize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.json();
}

export async function distributePayments(payload: PaymentRequest) {
  const response = await fetch(`${API_URL}/api/payments/distribute`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.json();
}

export async function getPaymentStatus(nodeId: string): Promise<PaymentStatusResponse> {
  const response = await fetch(`${API_URL}/api/payments/status/${nodeId}`);
  return response.json();
}
