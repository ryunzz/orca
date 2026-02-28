export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export const API_PROXY_PREFIX = "/api/proxy";
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";
export const TELEMETRY_WS_URL = `${WS_URL}/ws`;
export const AGENTS_WS_URL = `${WS_URL}/ws/agents`;
