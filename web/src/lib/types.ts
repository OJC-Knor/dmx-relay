// Server-side response shapes.

export type FixtureMeta = {
  id: string;
  type: "tripar" | "pinspot" | "focus" | "groot" | "atomic" | "fog";
  label: string;
  addr: number;
};

export type PinspotState = {
  id: string;
  level: number;
};

export type LayoutPositions = Record<string, { x: number; y: number }>;

export type SceneItem = {
  key: string;          // built-in key, or "pattern:<name>"
  label: string;
  kind: "scene" | "pattern";
};

export type ScenesResponse = {
  scenes: SceneItem[];
  running: string | null;
};

export type TriparState = {
  id: string;
  red: number;
  green: number;
  blue: number;
  white: number;
  dimmer: number;
  strobe: number;
};

export type HeadState = {
  id: string;
  pan: number;
  tilt: number;
  color: number;
  shutter: number;
  dimmer: number;
  // (other channels omitted; we don't currently render them)
  [k: string]: number | string;
};

export type AtomicState = {
  intensity: number;
  duration: number;
  rate: number;
  effect: number;
};

export type LiveState = {
  running_scene: string | null;
  tripars: TriparState[];
  pinspots: PinspotState[];
  focus: HeadState[];
  groot: HeadState[];
  atomic: AtomicState;
  fog: number;
};

export type Pattern = {
  step_ms: number;
  bpm: number;
  steps: number;
  tracks: Record<string, [number, number, number][]>;  // tripar-id -> per-step rgb
};

export type PatternsResponse = { patterns: Record<string, Pattern> };
