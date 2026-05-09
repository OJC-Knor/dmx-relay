// Thin wrappers around the FastAPI endpoints.

import type {
  FixtureMeta,
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
