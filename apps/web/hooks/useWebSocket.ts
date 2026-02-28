"use client";

import { useEffect, useRef } from "react";

export function useWebSocket<T>(url: string, onMessage: (payload: T) => void) {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as T;
        onMessage(parsed);
      } catch {
        // Ignore malformed payloads for resilience.
      }
    };

    return () => {
      ws.close();
    };
  }, [url, onMessage]);

  const send = (payload: unknown) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify(payload));
  };

  return { send };
}
