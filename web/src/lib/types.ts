// Server-side response shapes.

export type FixtureMeta = {
  id: string;
  type: "tripar" | "pinspot" | "spotlight" | "focus" | "groot" | "atomic" | "fog";
  label: string;
  addr: number;
};

export type PinspotState = {
  id: string;
  level: number;
};

export type LayoutPositions = Record<string, { x: number; y: number }>;

export type Tempo = "slow" | "medium" | "fast" | "insane" | "pattern";

export type SceneItem = {
  key: string;          // built-in key, or "pattern:<name>"
  label: string;
  kind: "scene" | "pattern";
  tempo: Tempo;
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
  spotlight: number;       // 0 or 255
  focus: HeadState[];
  groot: HeadState[];
  atomic: AtomicState;
  fog: number;             // live output (255 during a puff)
  fog_level: number;       // slider setting shared by all clients
  revs: { layout: number; patterns: number; aim: number };  // bumped on save; clients refetch
  vj: VJState | null;
};

// Calibrated pan/tilt (16-bit) per head, per named target: { ball: { "focus-1": {pan, tilt} } }
export type AimPos = { pan: number; tilt: number };
export type AimPoints = Record<string, Record<string, AimPos>>;

export type VJEffect = "flash" | "pulse" | "chase" | "colour_bar";
export type VJHold = "blinder" | "strobe" | "blackout" | "fog";

export type VJState = {
  effects: Record<VJEffect, boolean>;
  rate: 0.25 | 0.5 | 1 | 2 | 4;
  colour: [number, number, number, number] | null;
  master: number;
  quantize: boolean;             // scene pads switch on the next bar
  holds: VJHold[];
  queued_scene: string | null;
  clock: { bpm: number; beat: number; sync: boolean; source: "tap" | "mic" };
};

// Cells are per-step values. RGB triples for colour rows;
// strings (or null) for gobo / position sub-rows.
export type RgbCell = [number, number, number];
export type StrCell = string | null;
export type AnyCell = RgbCell | StrCell;

export type Pattern = {
  step_ms: number;
  bpm: number;
  steps: number;
  tracks: Record<string, AnyCell[]>;
};

export type PatternsResponse = { patterns: Record<string, Pattern> };
