// WebSocket-backed live state, shared by every component in the tab.
//
// The server pushes the whole rig state at ~20 Hz to every connected
// browser, so all phones/laptops show the same thing. One socket per tab:
// the first subscriber opens it, the last one to leave closes it.
import { useEffect, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  fog_level: 0,
  revs: { layout: 0, patterns: 0, aim: 0 },
  vj: null,
};

// receivedAt (performance.now) lets the beat display extrapolate between pushes.
type Snapshot = { state: LiveState; connected: boolean; receivedAt: number };

let snapshot: Snapshot = { state: EMPTY, connected: false, receivedAt: 0 };
const listeners = new Set<() => void>();
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function emit(next: Snapshot) {
  snapshot = next;
  listeners.forEach((l) => l());
}

function connect() {
  if (listeners.size === 0) return;
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const sock = new WebSocket(`${proto}://${window.location.host}/ws/state`);
  ws = sock;
  sock.onopen = () => emit({ ...snapshot, connected: true });
  sock.onmessage = (e) => {
    try {
      emit({ state: JSON.parse(e.data), connected: true, receivedAt: performance.now() });
    } catch { /* ignore */ }
  };
  sock.onclose = () => {
    if (ws !== sock) return;
    ws = null;
    emit({ ...snapshot, connected: false });
    if (listeners.size > 0) reconnectTimer = setTimeout(connect, 1000);
  };
  sock.onerror = () => sock.close();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!ws && !reconnectTimer) connect();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      const sock = ws;
      ws = null;
      sock?.close();
    }
  };
}

export function useLiveState(): Snapshot {
  return useSyncExternalStore(subscribe, () => snapshot);
}

/** Refetch queries when another browser changes the scene, layout or patterns. */
export function useLiveInvalidation(): void {
  const qc = useQueryClient();
  const { state } = useLiveState();
  const { running_scene, revs } = state;
  useEffect(() => { qc.invalidateQueries({ queryKey: ["scenes"] }); }, [qc, running_scene]);
  useEffect(() => { qc.invalidateQueries({ queryKey: ["layout"] }); }, [qc, revs.layout]);
  useEffect(() => { qc.invalidateQueries({ queryKey: ["aim"] }); }, [qc, revs.aim]);
  useEffect(() => {
    qc.invalidateQueries({ queryKey: ["patterns"] });
    qc.invalidateQueries({ queryKey: ["scenes"] });
  }, [qc, revs.patterns]);
}
