// Thin wrappers around the FastAPI endpoints.

import type {
  AimPoints,
  FixtureMeta,
  VJEffect,
  VJHold,
  LayoutPositions,
  Pattern,
  PatternsResponse,
  ScenesResponse,
} from "./types";

async function jsonOrThrow(r: Response) {
  if (!r.ok) {
    const detail = await r.json().catch(() => ({}));
    throw new Error(detail?.detail || `${r.status} ${r.statusText}`);
  }
  return r.json();
}

const post = (path: string, body?: unknown) =>
  fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  }).then(jsonOrThrow);

const get = (path: string) =>
  fetch(path).then(jsonOrThrow);

const del = (path: string) =>
  fetch(path, { method: "DELETE" }).then(jsonOrThrow);

// --- rig + scenes ---

export const fetchRig = (): Promise<{ fixtures: FixtureMeta[] }> =>
  get("/api/rig");

export const fetchScenes = (): Promise<ScenesResponse> =>
  get("/api/scenes");

export const playScene = (key: string) => post(`/scene/${encodeURIComponent(key)}`);
export const stopScene = () => post("/scene/stop");

// --- tripars ---

export const setAllColor = (rgbw: { r: number; g: number; b: number; w: number }) =>
  post("/tripars/color", rgbw);

export const setAllDim = (level: number) =>
  post("/tripars/dim", { level });

// --- atomic ---

export const atomicFlash      = () => post("/atomic/flash");
export const atomicStrobeSlow = () => post("/atomic/strobe_slow");
export const atomicStrobeFast = () => post("/atomic/strobe_fast");
export const atomicLightning  = () => post("/atomic/lightning");
export const atomicOff        = () => post("/atomic/off");

// --- fog ---

export const fogLevel = (level: number) => post("/fog/level", { level });
export const fogPuff  = () => post("/fog/puff");
export const fogOff   = () => post("/fog/off");

// --- spotlight ---

export const spotlightOn     = () => post("/spotlight/on");
export const spotlightOff    = () => post("/spotlight/off");
export const spotlightToggle = () => post("/spotlight/toggle");

// --- master ---

export const blackout = () => post("/blackout");

// --- layout ---

export const fetchLayout = (): Promise<LayoutPositions> =>
  get("/api/layout");

export const saveLayout = (layout: LayoutPositions) =>
  post("/api/layout", layout);

// --- patterns ---

export const fetchPatterns = (): Promise<PatternsResponse> =>
  get("/api/patterns");

export const savePattern = (name: string, pattern: Pattern) =>
  post(`/api/patterns/${encodeURIComponent(name)}`, pattern);

export const deletePattern = (name: string) =>
  del(`/api/patterns/${encodeURIComponent(name)}`);

// --- VJ ---

export const vjTap = (bpm: number | null, index: number, source: "tap" | "mic" = "tap") =>
  post("/vj/tap", { bpm, index, source });
export const vjTempo = (t: {
  bpm?: number; downbeat?: boolean; beat_now?: boolean; nudge_ms?: number;
  sync?: boolean; source?: "tap" | "mic";
}) => post("/vj/tempo", t);
export const vjSettings = (s: {
  effects?: Partial<Record<VJEffect, boolean>>; rate?: number;
  colour?: [number, number, number, number] | null; master?: number; quantize?: boolean;
}) => post("/vj/settings", s);
export const vjHold = (name: VJHold, on: boolean) => post("/vj/hold", { name, on });
export const vjScene = (key: string) => post(`/vj/scene/${encodeURIComponent(key)}`);

// --- aim points ---

export const fetchAim = (): Promise<{ points: AimPoints; heads: string[] }> => get("/api/aim");
export const aimJog = (head: string, pan: number, tilt: number, solo = true) =>
  post("/api/aim/jog", { head, pan, tilt, solo });
export const aimSave = (point: string, head: string, pan: number, tilt: number) =>
  fetch(`/api/aim/${encodeURIComponent(point)}/${encodeURIComponent(head)}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pan, tilt }),
  }).then(jsonOrThrow);
export const aimClear = (point: string, head: string) =>
  del(`/api/aim/${encodeURIComponent(point)}/${encodeURIComponent(head)}`);
