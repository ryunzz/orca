const API_HOST = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const API_BASE = `${API_HOST}/api`;
export const WS_BASE = API_HOST.replace(/^http/, "ws");
