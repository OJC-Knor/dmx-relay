// WebSocket-backed live state hook with auto-reconnect.
import { useEffect, useState } from "react";
import type { LiveState } from "./types";

const EMPTY: LiveState = {
  running_scene: null,
  tripars: [],
  pinspots: [],
  spotlight: 0,
  focus: [],
  groot: [],
  atomic: { intensity: 0, duration: 0, rate: 0, effect: 0 },
  fog: 0,
};

export function useLiveState(): { state: LiveState; connected: boolean } {
  const [state, setState] = useState<LiveState>(EMPTY);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (cancelled) return;
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${window.location.host}/ws/state`);
      ws.onopen = () => setConnected(true);
      ws.onmessage = (e) => {
        try { setState(JSON.parse(e.data)); } catch { /* ignore */ }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!cancelled) reconnectTimer = setTimeout(connect, 1000);
      };
      ws.onerror = () => ws?.close();
    };
    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  return { state, connected };
}
