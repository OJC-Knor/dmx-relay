import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HexColorPicker } from "react-colorful";

import { Button } from "@/components/Button";
import { Section } from "@/components/Section";
import { useToast } from "@/components/Toast";
import {
  deletePattern, fetchPatterns, fetchRig, fetchScenes, playScene, savePattern, stopScene,
} from "@/lib/api";
import type { FixtureMeta, Pattern, RgbCell } from "@/lib/types";
import { cn, rgbToHex } from "@/lib/utils";

// ----- palettes & track-row registry -----

const COLOR_PALETTE: { name: string; rgb: RgbCell | null }[] = [
  { name: "off",    rgb: null },
  { name: "red",    rgb: [255, 30, 30] },
  { name: "orange", rgb: [255, 130, 0] },
  { name: "yellow", rgb: [255, 230, 30] },
  { name: "green",  rgb: [30, 230, 80] },
  { name: "cyan",   rgb: [30, 220, 255] },
  { name: "blue",   rgb: [50, 100, 255] },
  { name: "purple", rgb: [180, 50, 255] },
  { name: "pink",   rgb: [255, 80, 200] },
  { name: "white",  rgb: [255, 255, 255] },
];

const GOBOS = [
  { name: "off",   value: null },
  { name: "open",  value: "open" },
  { name: "1",     value: "gobo1" },
  { name: "2",     value: "gobo2" },
  { name: "3",     value: "gobo3" },
  { name: "4",     value: "gobo4" },
  { name: "5",     value: "gobo5" },
  { name: "6",     value: "gobo6" },
];

const POSITIONS = [
  { name: "off",         value: null,         dot: { x: 0.5, y: 0.5 } },
  { name: "center",      value: "center",     dot: { x: 0.5, y: 0.5 } },
  { name: "up",          value: "up",         dot: { x: 0.5, y: 0.2 } },
  { name: "down",        value: "down",       dot: { x: 0.5, y: 0.8 } },
  { name: "left",        value: "left",       dot: { x: 0.2, y: 0.5 } },
  { name: "right",       value: "right",      dot: { x: 0.8, y: 0.5 } },
  { name: "up-left",     value: "up-left",    dot: { x: 0.2, y: 0.2 } },
  { name: "up-right",    value: "up-right",   dot: { x: 0.8, y: 0.2 } },
  { name: "down-left",   value: "down-left",  dot: { x: 0.2, y: 0.8 } },
  { name: "down-right",  value: "down-right", dot: { x: 0.8, y: 0.8 } },
];

const TYPE_GROUPS: { type: FixtureMeta["type"]; label: string; rgb: boolean }[] = [
  { type: "tripar",    label: "Tripars",       rgb: true },
  { type: "pinspot",   label: "Pinspots",      rgb: false },
  { type: "spotlight", label: "Spotlight",     rgb: false },
  { type: "atomic",    label: "Atomic",        rgb: false },
  { type: "focus",     label: "Focus Spots",   rgb: false },
  { type: "groot",     label: "Groot heads",   rgb: false },
  { type: "fog",       label: "Fog",           rgb: false },
];

// each "row" the grid renders is one of these:
type RowKind = "color" | "gobo" | "pos";
type Row = { trackId: string; label: string; kind: RowKind; rgbRow: boolean };

// expand a fixture into its track rows. For Tripars/Pinspots/etc:
// just one colour row. For Focus heads: color + gobo + pos. For Groot:
// color + pos (no gobo wheel exposed yet).
function fixtureRows(f: FixtureMeta): Row[] {
  if (f.type === "focus") {
    return [
      { trackId: f.id,            label: `${f.label} colour`, kind: "color", rgbRow: false },
      { trackId: `${f.id}.gobo`,  label: `${f.label} gobo`,   kind: "gobo",  rgbRow: false },
      { trackId: `${f.id}.pos`,   label: `${f.label} pos`,    kind: "pos",   rgbRow: false },
    ];
  }
  if (f.type === "groot") {
    return [
      { trackId: f.id,           label: `${f.label} colour`, kind: "color", rgbRow: false },
      { trackId: `${f.id}.pos`,  label: `${f.label} pos`,    kind: "pos",   rgbRow: false },
    ];
  }
  return [
    { trackId: f.id, label: f.label, kind: "color", rgbRow: f.type === "tripar" },
  ];
}

// ----- track storage -----

type Cell = RgbCell | string | null;
type Tracks = Record<string, Cell[]>;

function blank(steps: number, rows: Row[]): Tracks {
  return Object.fromEntries(rows.map((r) => [r.trackId, Array.from({ length: steps }, () => null)]));
}

function reshape(tracks: Tracks, steps: number, rows: Row[]): Tracks {
  const out: Tracks = {};
  for (const r of rows) {
    const arr = (tracks[r.trackId] ?? []).slice(0, steps);
    while (arr.length < steps) arr.push(null);
    out[r.trackId] = arr as Cell[];
  }
  return out;
}

// ----- component -----

export default function Builder() {
  const toast = useToast();
  const qc = useQueryClient();

  const rig = useQuery({ queryKey: ["rig"], queryFn: fetchRig });
  const fixtures = rig.data?.fixtures ?? [];
  const allRows = useMemo<Row[]>(() => fixtures.flatMap(fixtureRows), [fixtures]);

  const [name, setName] = useState("");
  const [steps, setSteps] = useState(16);
  const [bpm, setBpm] = useState(120);
  const [tracks, setTracks] = useState<Tracks>({});

  const [colorIdx, setColorIdx] = useState(1);
  const [customColor, setCustomColor] = useState<RgbCell>([255, 255, 255]);
  const [useCustom, setUseCustom] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [goboIdx, setGoboIdx] = useState(2);  // gobo1 by default
  const [posIdx, setPosIdx] = useState(1);    // center by default

  const [enabledTypes, setEnabledTypes] = useState<Set<string>>(
    () => new Set(["tripar", "pinspot", "spotlight", "atomic", "focus", "groot", "fog"]),
  );
  const [paintMode, setPaintMode] = useState<"draw" | "tap">("draw");

  // initialise tracks once we know the rows
  useEffect(() => {
    if (allRows.length && Object.keys(tracks).length === 0) {
      setTracks(blank(steps, allRows));
    }
  }, [allRows, steps, tracks]);

  const stepMs = useMemo(() => Math.round(60_000 / (bpm * 4)), [bpm]);

  const scenes = useQuery({ queryKey: ["scenes"], queryFn: fetchScenes, refetchInterval: 1500 });
  const running = scenes.data?.running ?? null;
  const playingThis = !!running && running === `pattern:${name || "__live"}`;

  const [playCol, setPlayCol] = useState(-1);
  const playTimer = useRef<number | null>(null);
  useEffect(() => {
    if (playTimer.current) { clearInterval(playTimer.current); playTimer.current = null; }
    if (playingThis) {
      setPlayCol(0);
      playTimer.current = window.setInterval(() => setPlayCol((c) => (c + 1) % steps), stepMs);
    } else {
      setPlayCol(-1);
    }
    return () => { if (playTimer.current) clearInterval(playTimer.current); };
  }, [playingThis, steps, stepMs]);

  const patterns = useQuery({ queryKey: ["patterns"], queryFn: fetchPatterns });

  const saveMut = useMutation({
    mutationFn: ({ name, p }: { name: string; p: Pattern }) => savePattern(name, p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patterns"] });
      qc.invalidateQueries({ queryKey: ["scenes"] });
    },
  });
  const delMut = useMutation({
    mutationFn: deletePattern,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patterns"] });
      qc.invalidateQueries({ queryKey: ["scenes"] });
    },
  });
  const playMut = useMutation({ mutationFn: playScene });
  const stopMut = useMutation({ mutationFn: stopScene });

  const onResize = (newSteps: number) => {
    const n = Math.max(2, Math.min(64, newSteps));
    setSteps(n);
    setTracks((t) => reshape(t, n, allRows));
  };

  const packPattern = (): Pattern => ({
    step_ms: stepMs,
    bpm,
    steps,
    tracks: Object.fromEntries(
      Object.entries(tracks).map(([id, cells]) => [id, cells]),
    ),
  });

  const save = async () => {
    const n = (name || "").trim();
    if (!n) { toast("Name the pattern first", "error"); return; }
    await saveMut.mutateAsync({ name: n, p: packPattern() });
    toast("Saved");
  };

  const togglePlay = async () => {
    if (playingThis) {
      await stopMut.mutateAsync();
      qc.invalidateQueries({ queryKey: ["scenes"] });
      return;
    }
    const n = (name || "").trim() || "__live";
    if (!name) setName(n);
    await saveMut.mutateAsync({ name: n, p: packPattern() });
    await playMut.mutateAsync(`pattern:${n}`);
    qc.invalidateQueries({ queryKey: ["scenes"] });
  };

  const clear = () => {
    if (!confirm("Clear the whole pattern?")) return;
    setTracks(blank(steps, allRows));
  };

  const loadPattern = (n: string) => {
    const p = patterns.data?.patterns?.[n];
    if (!p) return;
    setName(n);
    setSteps(p.steps);
    setBpm(p.bpm);
    const next: Tracks = {};
    for (const r of allRows) {
      const arr = (p.tracks[r.trackId] ?? []).slice(0, p.steps);
      next[r.trackId] = arr.map((c: unknown) => {
        if (c == null) return null;
        if (Array.isArray(c)) {
          const [r0, g0, b0] = c as number[];
          return (r0 || g0 || b0) ? ([r0, g0, b0] as RgbCell) : null;
        }
        return c as string;  // already a name
      });
      while (next[r.trackId].length < p.steps) next[r.trackId].push(null);
    }
    setTracks(next);
  };

  // ----- painting -----

  const dragging = useRef(false);
  const brushFor = (kind: RowKind): Cell => {
    if (kind === "color") {
      if (useCustom) return [...customColor] as RgbCell;
      return COLOR_PALETTE[colorIdx].rgb ? ([...(COLOR_PALETTE[colorIdx].rgb as RgbCell)] as RgbCell) : null;
    }
    if (kind === "gobo") return GOBOS[goboIdx].value;
    /* pos */            return POSITIONS[posIdx].value;
  };

  const paint = (row: Row, col: number) => {
    const c = brushFor(row.kind);
    setTracks((t) => {
      const prev = t[row.trackId];
      if (!prev) return t;
      const nextRow = prev.slice();
      nextRow[col] = c;
      return { ...t, [row.trackId]: nextRow };
    });
  };

  // group rows by fixture type for header dividers + filtering
  const byType = TYPE_GROUPS.map((g) => ({
    ...g,
    rows: fixtures
      .filter((f) => f.type === g.type)
      .flatMap(fixtureRows),
  })).filter((g) => g.rows.length > 0);

  // ----- render -----

  return (
    <>
      {/* Top toolbar */}
      <Section>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my pattern"
              className="w-44 rounded-lg border border-line bg-bg px-2.5 py-2 text-sm"
            />
          </Field>
          <Field label="Steps">
            <input
              type="number"
              value={steps}
              min={2}
              max={64}
              onChange={(e) => onResize(+e.target.value || 16)}
              className="w-20 rounded-lg border border-line bg-bg px-2.5 py-2 text-sm tabular-nums"
            />
          </Field>
          <Field label="BPM">
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={bpm}
                min={40}
                max={240}
                onChange={(e) => setBpm(Math.max(40, Math.min(240, +e.target.value || 120)))}
                className="w-20 rounded-lg border border-line bg-bg px-2.5 py-2 text-sm tabular-nums"
              />
              <span className="text-[11px] text-muted tabular-nums">{stepMs} ms/step</span>
            </div>
          </Field>
          <Field label="Saved">
            <div className="flex gap-2">
              <select
                onChange={(e) => { if (e.target.value) loadPattern(e.target.value); }}
                value={name || ""}
                className="rounded-lg border border-line bg-bg px-2 py-2 text-sm"
              >
                <option value="">— pick —</option>
                {Object.keys(patterns.data?.patterns ?? {})
                  .filter((k) => !k.startsWith("__"))
                  .sort()
                  .map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              {name && !name.startsWith("__") && (
                <Button
                  className="!min-h-0 !py-1.5"
                  onClick={async () => {
                    if (!confirm(`Delete "${name}"?`)) return;
                    await delMut.mutateAsync(name);
                    toast("Deleted");
                    setName("");
                  }}
                >Delete</Button>
              )}
            </div>
          </Field>

          <div className="ml-auto flex flex-wrap gap-2">
            <Button onClick={clear}>Clear</Button>
            <Button onClick={save}>Save</Button>
            <Button variant="primary" onClick={togglePlay}>
              {playingThis ? "■ Stop" : "▶ Play"}
            </Button>
          </div>
        </div>
      </Section>

      {/* Brushes */}
      <Section title="Brushes" hint={<span>painting auto-uses the brush matching each row</span>}>
        <div className="space-y-3">
          <BrushRow label="Color">
            {COLOR_PALETTE.map((c, i) => (
              <button
                key={c.name}
                title={c.name}
                onClick={() => { setColorIdx(i); setUseCustom(false); }}
                className={cn(
                  "h-8 w-8 rounded-md border-2 transition relative",
                  !useCustom && i === colorIdx ? "border-text scale-110" : "border-line",
                  c.name === "off" && "bg-surface2",
                )}
                style={c.rgb ? { background: `rgb(${c.rgb.join(",")})` } : undefined}
              >
                {c.name === "off" && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="block h-full w-0.5 -rotate-45 bg-danger/80" />
                  </span>
                )}
              </button>
            ))}
            <span className="ml-2 h-6 w-px bg-line" />
            <button
              onClick={() => { setShowPicker((v) => !v); setUseCustom(true); }}
              title="Custom colour"
              className={cn(
                "h-8 w-8 rounded-md border-2 transition",
                useCustom ? "border-text scale-110" : "border-line",
              )}
              style={{ background: `rgb(${customColor.join(",")})` }}
            />
            {showPicker && (
              <div className="ml-2 rounded-xl border border-line bg-surface p-2">
                <HexColorPicker
                  color={rgbToHex(...customColor)}
                  onChange={(hex) => {
                    const v = parseInt(hex.replace("#", ""), 16);
                    setCustomColor([(v >> 16) & 255, (v >> 8) & 255, v & 255]);
                    setUseCustom(true);
                  }}
                  style={{ width: 200, height: 130 }}
                />
              </div>
            )}
          </BrushRow>

          <BrushRow label="Gobo">
            {GOBOS.map((g, i) => (
              <button
                key={g.name}
                title={g.value ?? "off"}
                onClick={() => setGoboIdx(i)}
                className={cn(
                  "h-8 min-w-[2.25rem] rounded-md border-2 px-2 text-xs font-semibold transition",
                  i === goboIdx ? "border-text bg-surface2 scale-105" : "border-line bg-bg text-muted",
                  g.value === null && "italic",
                )}
              >
                {g.name}
              </button>
            ))}
          </BrushRow>

          <BrushRow label="Position">
            {POSITIONS.map((p, i) => (
              <button
                key={p.name}
                title={p.value ?? "off"}
                onClick={() => setPosIdx(i)}
                className={cn(
                  "relative h-8 w-8 rounded-md border-2 transition",
                  i === posIdx ? "border-text scale-110" : "border-line",
                  "bg-surface2",
                )}
              >
                {p.value !== null && (
                  <span
                    className="absolute h-1.5 w-1.5 rounded-full bg-accent"
                    style={{
                      left: `${p.dot.x * 100}%`,
                      top:  `${p.dot.y * 100}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                  />
                )}
                {p.value === null && (
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] italic text-muted">off</span>
                )}
              </button>
            ))}
          </BrushRow>
        </div>
      </Section>

      {/* Paint mode + group filter */}
      <Section title="Paint mode" hint={<span>tap = single cell · draw = drag to paint many</span>}>
        <div className="inline-flex rounded-full border border-line bg-surface2 p-1 text-xs">
          {(["tap", "draw"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setPaintMode(m)}
              className={cn(
                "rounded-full px-4 py-1.5 transition",
                paintMode === m
                  ? "bg-accent font-semibold text-black"
                  : "text-muted hover:text-text",
              )}
            >
              {m === "tap" ? "Tap" : "Draw"}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Show rows">
        <div className="flex flex-wrap gap-2">
          {TYPE_GROUPS.map((g) => {
            const has = fixtures.some((f) => f.type === g.type);
            if (!has) return null;
            const on = enabledTypes.has(g.type);
            return (
              <button
                key={g.type}
                onClick={() => setEnabledTypes((s) => {
                  const next = new Set(s);
                  if (on) next.delete(g.type); else next.add(g.type);
                  return next;
                })}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs",
                  on ? "border-accent bg-accent/15 text-accent" : "border-line text-muted",
                )}
              >
                {g.label}
              </button>
            );
          })}
        </div>
      </Section>

      {/* Grid */}
      <Section
        title="Pattern"
        hint={<span>{playingThis ? <span className="text-accent">▶ playing</span> : "tap or drag to paint"}</span>}
      >
        <div className="scrollbar-thin overflow-x-auto">
          <div className="inline-block min-w-full rounded-lg border border-line bg-surface p-3">
            {/* step header */}
            <div className="mb-1 flex">
              <div className="w-24" />
              {Array.from({ length: steps }).map((_, s) => (
                <div
                  key={s}
                  className={cn(
                    "flex h-4 w-7 items-center justify-center text-[10px] tabular-nums",
                    playCol === s ? "text-accent font-semibold" : "text-muted",
                  )}
                >
                  {s % 4 === 0 ? s + 1 : ""}
                </div>
              ))}
            </div>

            {byType.filter((g) => enabledTypes.has(g.type)).map((g) => (
              <div key={g.type} className="mt-2">
                <div className="mb-1 mt-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-muted">
                  <span className="h-px flex-1 bg-line/60" />
                  <span>{g.label}</span>
                  <span className="h-px flex-1 bg-line/60" />
                </div>
                {g.rows.map((row) => (
                  <RowEl
                    key={row.trackId}
                    row={row}
                    rgbDisplay={g.rgb && row.kind === "color"}
                    cells={tracks[row.trackId] ?? []}
                    steps={steps}
                    playCol={playCol}
                    onPaintStart={(s) => {
                      dragging.current = paintMode === "draw";
                      paint(row, s);
                    }}
                    onPaintEnter={(s) => {
                      if (paintMode === "draw" && dragging.current) paint(row, s);
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 text-[11px] text-muted">
          {(stepMs * steps / 1000).toFixed(2)}s loop ·
          {" "}
          {Object.values(tracks).flat().filter((c) => c !== null).length} cells lit
        </div>
      </Section>
    </>
  );
}

// ----- helpers -----

function BrushRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-16 text-[10px] uppercase tracking-[0.12em] text-muted">{label}</span>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-[0.12em] text-muted">{label}</span>
      {children}
    </div>
  );
}

function RowEl({
  row, rgbDisplay, cells, steps, playCol, onPaintStart, onPaintEnter,
}: {
  row: Row;
  rgbDisplay: boolean;          // tripar gets full colour, others get greyscale
  cells: Cell[];
  steps: number;
  playCol: number;
  onPaintStart: (s: number) => void;
  onPaintEnter: (s: number) => void;
}) {
  return (
    <div className="flex items-center">
      <div className="w-24 truncate pr-2 text-right text-[11px] text-muted">{row.label}</div>
      {Array.from({ length: steps }).map((_, s) => {
        const c = cells[s];
        const isPlaying = playCol === s;
        const beat = s % 4 === 0;
        const fill = cellFill(row.kind, c, rgbDisplay);
        return (
          <button
            key={s}
            onPointerDown={(e) => {
              e.preventDefault();
              (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
              onPaintStart(s);
            }}
            onPointerEnter={() => onPaintEnter(s)}
            className={cn(
              "relative m-px h-7 w-6 rounded border touch-none",
              beat ? "border-accent/40" : "border-line",
              isPlaying && "ring-2 ring-accent ring-inset",
            )}
            style={fill.bg ? { background: fill.bg } : { backgroundColor: "#1f1f25" }}
          >
            {fill.label && (
              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold leading-none text-black/80">
                {fill.label}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function cellFill(kind: RowKind, c: Cell, rgbDisplay: boolean): { bg?: string; label?: string } {
  if (c == null) return {};
  if (kind === "color") {
    const arr = c as RgbCell;
    if (rgbDisplay) return { bg: `rgb(${arr.join(",")})` };
    const v = Math.max(arr[0], arr[1], arr[2]);
    return { bg: `rgb(${v}, ${v}, ${v})` };
  }
  if (kind === "gobo") {
    const name = c as string;
    return {
      bg: "rgb(140, 200, 255)",
      label: name === "open" ? "○" : name.replace(/^gobo/, ""),
    };
  }
  // pos
  return {
    bg: "rgb(108, 142, 255)",
    label: posSymbol(c as string),
  };
}

function posSymbol(name: string): string {
  switch (name) {
    case "center":     return "●";
    case "up":         return "↑";
    case "down":       return "↓";
    case "left":       return "←";
    case "right":      return "→";
    case "up-left":    return "↖";
    case "up-right":   return "↗";
    case "down-left":  return "↙";
    case "down-right": return "↘";
    default:           return "•";
  }
}
