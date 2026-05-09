import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HexColorPicker } from "react-colorful";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  ChevronDown, FolderOpen, Hand, Minus, MousePointerClick, Pause, Play, Plus,
  Save, Trash2, Wand2, X,
} from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import {
  DropdownContent, DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator, DropdownTrigger,
} from "@/components/ui/DropdownMenu";
import { Field, Input } from "@/components/ui/Field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { ToggleGroup, ToggleItem } from "@/components/ui/ToggleGroup";
import { Tooltip } from "@/components/ui/Tooltip";
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

type RowKind = "color" | "gobo" | "pos";
type Row = { trackId: string; label: string; kind: RowKind; rgbRow: boolean };

function fixtureRows(f: FixtureMeta): Row[] {
  if (f.type === "focus") return [
    { trackId: f.id,           label: `${f.label} colour`, kind: "color", rgbRow: false },
    { trackId: `${f.id}.gobo`, label: `${f.label} gobo`,   kind: "gobo",  rgbRow: false },
    { trackId: `${f.id}.pos`,  label: `${f.label} pos`,    kind: "pos",   rgbRow: false },
  ];
  if (f.type === "groot") return [
    { trackId: f.id,          label: `${f.label} colour`, kind: "color", rgbRow: false },
    { trackId: `${f.id}.pos`, label: `${f.label} pos`,    kind: "pos",   rgbRow: false },
  ];
  return [{ trackId: f.id, label: f.label, kind: "color", rgbRow: f.type === "tripar" }];
}

type Cell = RgbCell | string | null;
type Tracks = Record<string, Cell[]>;

const blank = (steps: number, rows: Row[]): Tracks =>
  Object.fromEntries(rows.map((r) => [r.trackId, Array.from({ length: steps }, () => null)]));

function reshape(t: Tracks, steps: number, rows: Row[]): Tracks {
  const out: Tracks = {};
  for (const r of rows) {
    const arr = (t[r.trackId] ?? []).slice(0, steps);
    while (arr.length < steps) arr.push(null);
    out[r.trackId] = arr as Cell[];
  }
  return out;
}

// ----- component -----

export default function Builder() {
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
  const [goboIdx, setGoboIdx] = useState(2);
  const [posIdx, setPosIdx] = useState(1);

  const [enabledTypes, setEnabledTypes] = useState<Set<string>>(
    () => new Set(["tripar", "pinspot", "spotlight", "atomic", "focus", "groot", "fog"]),
  );
  const [paintMode, setPaintMode] = useState<"draw" | "tap">("draw");

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
    if (!n) { toast.error("Name the pattern first"); return; }
    await saveMut.mutateAsync({ name: n, p: packPattern() });
    toast.success(`Saved “${n}”`);
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
        return c as string;
      });
      while (next[r.trackId].length < p.steps) next[r.trackId].push(null);
    }
    setTracks(next);
  };

  const dragging = useRef(false);
  const brushFor = (kind: RowKind): Cell => {
    if (kind === "color") {
      if (useCustom) return [...customColor] as RgbCell;
      return COLOR_PALETTE[colorIdx].rgb ? ([...(COLOR_PALETTE[colorIdx].rgb as RgbCell)] as RgbCell) : null;
    }
    if (kind === "gobo") return GOBOS[goboIdx].value;
    return POSITIONS[posIdx].value;
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

  const byType = TYPE_GROUPS.map((g) => ({
    ...g,
    rows: fixtures.filter((f) => f.type === g.type).flatMap(fixtureRows),
  })).filter((g) => g.rows.length > 0);

  const savedNames = Object.keys(patterns.data?.patterns ?? {})
    .filter((k) => !k.startsWith("__")).sort();

  return (
    <div className="space-y-4">
      {/* Transport / metadata bar */}
      <Card>
        <CardBody className="!pt-4">
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Name" className="min-w-[200px]">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my pattern"
              />
            </Field>

            <Field label="Steps">
              <div className="flex items-center gap-1">
                <Button size="icon" variant="outline" className="!h-10 !w-10" onClick={() => onResize(steps - 1)}>
                  <Minus className="size-3.5" />
                </Button>
                <Input
                  type="number"
                  value={steps}
                  min={2}
                  max={64}
                  onChange={(e) => onResize(+e.target.value || 16)}
                  className="w-16 text-center tabular-nums"
                />
                <Button size="icon" variant="outline" className="!h-10 !w-10" onClick={() => onResize(steps + 1)}>
                  <Plus className="size-3.5" />
                </Button>
              </div>
            </Field>

            <Field label={`BPM • ${stepMs}ms/step`}>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="outline" className="!h-10 !w-10" onClick={() => setBpm((v) => Math.max(40, v - 1))}>
                  <Minus className="size-3.5" />
                </Button>
                <Input
                  type="number"
                  value={bpm}
                  min={40}
                  max={240}
                  onChange={(e) => setBpm(Math.max(40, Math.min(240, +e.target.value || 120)))}
                  className="w-16 text-center tabular-nums"
                />
                <Button size="icon" variant="outline" className="!h-10 !w-10" onClick={() => setBpm((v) => Math.min(240, v + 1))}>
                  <Plus className="size-3.5" />
                </Button>
              </div>
            </Field>

            <div className="ml-auto flex flex-wrap items-end gap-2">
              <DropdownMenu>
                <DropdownTrigger asChild>
                  <Button variant="outline">
                    <FolderOpen className="size-4" /> Patterns
                    <ChevronDown className="size-3 opacity-60" />
                  </Button>
                </DropdownTrigger>
                <DropdownContent>
                  <DropdownLabel>Saved patterns</DropdownLabel>
                  {savedNames.length === 0 && (
                    <div className="px-3 py-3 text-xs text-mutedFg">No patterns yet</div>
                  )}
                  {savedNames.map((n) => (
                    <DropdownItem key={n} onSelect={() => loadPattern(n)}>
                      <Wand2 className="size-3.5 text-accent" />
                      {n}
                    </DropdownItem>
                  ))}
                  {name && !name.startsWith("__") && savedNames.includes(name) && (
                    <>
                      <DropdownSeparator />
                      <DropdownItem
                        danger
                        onSelect={async () => {
                          if (!confirm(`Delete "${name}"?`)) return;
                          await delMut.mutateAsync(name);
                          toast.success(`Deleted “${name}”`);
                          setName("");
                        }}
                      >
                        <Trash2 className="size-3.5" />
                        Delete current
                      </DropdownItem>
                    </>
                  )}
                </DropdownContent>
              </DropdownMenu>

              <Tooltip content="Clear all cells">
                <Button variant="ghost" onClick={clear}>
                  <X className="size-4" /> Clear
                </Button>
              </Tooltip>

              <Button variant="outline" onClick={save}>
                <Save className="size-4" /> Save
              </Button>

              <Button variant="primary" onClick={togglePlay} className="min-w-[120px]">
                {playingThis ? (
                  <><Pause className="size-4" /> Stop</>
                ) : (
                  <><Play className="size-4" /> Play</>
                )}
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Brushes */}
      <Card>
        <CardHeader title="Brushes" subtitle="Painting auto-uses the brush matching each row" />
        <CardBody className="space-y-4">
          <BrushRow label="Color">
            {COLOR_PALETTE.map((c, i) => (
              <Tooltip key={c.name} content={c.name}>
                <button
                  onClick={() => { setColorIdx(i); setUseCustom(false); }}
                  className={cn(
                    "relative h-9 w-9 rounded-lg border-2 transition",
                    !useCustom && i === colorIdx ? "border-text scale-110 shadow-glow" : "border-line hover:border-line2",
                    c.name === "off" && "bg-surface3",
                  )}
                  style={c.rgb ? { background: `rgb(${c.rgb.join(",")})` } : undefined}
                >
                  {c.name === "off" && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="block h-full w-0.5 -rotate-45 bg-danger/80" />
                    </span>
                  )}
                </button>
              </Tooltip>
            ))}
            <span className="mx-1 h-7 w-px bg-line" />
            <Popover>
              <PopoverTrigger asChild>
                <button
                  onClick={() => setUseCustom(true)}
                  className={cn(
                    "h-9 w-9 rounded-lg border-2 transition",
                    useCustom ? "border-text scale-110 shadow-glow" : "border-line hover:border-line2",
                  )}
                  style={{ background: `rgb(${customColor.join(",")})` }}
                />
              </PopoverTrigger>
              <PopoverContent className="!p-3">
                <HexColorPicker
                  color={rgbToHex(...customColor)}
                  onChange={(hex) => {
                    const v = parseInt(hex.replace("#", ""), 16);
                    setCustomColor([(v >> 16) & 255, (v >> 8) & 255, v & 255]);
                    setUseCustom(true);
                  }}
                  style={{ width: 220, height: 160 }}
                />
                <div className="mt-3 text-center font-mono text-xs text-mutedFg">
                  {rgbToHex(...customColor)}
                </div>
              </PopoverContent>
            </Popover>
          </BrushRow>

          <BrushRow label="Gobo">
            {GOBOS.map((g, i) => (
              <Tooltip key={g.name} content={g.value ?? "off"}>
                <button
                  onClick={() => setGoboIdx(i)}
                  className={cn(
                    "h-9 min-w-[2.5rem] rounded-lg border-2 px-2 text-xs font-bold transition",
                    i === goboIdx ? "border-text bg-tripar/20 scale-105" : "border-line bg-bg2 text-mutedFg hover:border-line2",
                    g.value === null && "italic",
                  )}
                >
                  {g.name}
                </button>
              </Tooltip>
            ))}
          </BrushRow>

          <BrushRow label="Position">
            {POSITIONS.map((p, i) => (
              <Tooltip key={p.name} content={p.value ?? "off"}>
                <button
                  onClick={() => setPosIdx(i)}
                  className={cn(
                    "relative h-9 w-9 rounded-lg border-2 transition bg-surface3",
                    i === posIdx ? "border-text scale-110 shadow-glow" : "border-line hover:border-line2",
                  )}
                >
                  {p.value !== null ? (
                    <span
                      className="absolute size-1.5 rounded-full bg-accent"
                      style={{ left: `${p.dot.x * 100}%`, top: `${p.dot.y * 100}%`, transform: "translate(-50%, -50%)" }}
                    />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] italic text-muted">off</span>
                  )}
                </button>
              </Tooltip>
            ))}
          </BrushRow>
        </CardBody>
      </Card>

      {/* Filters & paint mode */}
      <Card>
        <CardBody className="!pt-4">
          <div className="flex flex-wrap items-center gap-4">
            <Field label="Mode" className="!gap-1">
              <ToggleGroup value={paintMode} onValueChange={(v) => setPaintMode(v as "draw" | "tap")}>
                <ToggleItem value="tap"><span className="flex items-center gap-1.5"><MousePointerClick className="size-3.5" /> Tap</span></ToggleItem>
                <ToggleItem value="draw"><span className="flex items-center gap-1.5"><Hand className="size-3.5" /> Draw</span></ToggleItem>
              </ToggleGroup>
            </Field>

            <Field label="Show rows" className="!gap-1">
              <div className="flex flex-wrap gap-1.5">
                {TYPE_GROUPS.map((g) => {
                  const has = fixtures.some((f) => f.type === g.type);
                  if (!has) return null;
                  const on = enabledTypes.has(g.type);
                  return (
                    <button
                      key={g.type}
                      onClick={() => setEnabledTypes((s) => {
                        const n = new Set(s);
                        if (on) n.delete(g.type); else n.add(g.type);
                        return n;
                      })}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs transition",
                        on ? "border-accent bg-accent/15 text-accent"
                           : "border-line text-mutedFg hover:text-text",
                      )}
                    >
                      {g.label}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>
        </CardBody>
      </Card>

      {/* Grid */}
      <Card>
        <CardHeader
          title="Pattern"
          subtitle={`${(stepMs * steps / 1000).toFixed(2)}s loop · ${Object.values(tracks).flat().filter((c) => c !== null).length} cells lit`}
          action={playingThis && <Badge tone="accent">▶ playing</Badge>}
        />
        <CardBody>
          <div className="scrollbar-thin overflow-x-auto">
            <div className="inline-block min-w-full rounded-lg border border-line bg-bg2 p-3">
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
        </CardBody>
      </Card>
    </div>
  );
}

// ----- helpers -----

function BrushRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-16 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</span>
      {children}
    </div>
  );
}

function RowEl({
  row, rgbDisplay, cells, steps, playCol, onPaintStart, onPaintEnter,
}: {
  row: Row;
  rgbDisplay: boolean;
  cells: Cell[];
  steps: number;
  playCol: number;
  onPaintStart: (s: number) => void;
  onPaintEnter: (s: number) => void;
}) {
  return (
    <div className="flex items-center">
      <div className="w-24 truncate pr-2 text-right text-[11px] text-mutedFg">{row.label}</div>
      {Array.from({ length: steps }).map((_, s) => {
        const c = cells[s];
        const isPlaying = playCol === s;
        const beat = s % 4 === 0;
        const fill = cellFill(row.kind, c, rgbDisplay);
        return (
          <motion.button
            key={s}
            whileTap={{ scale: 0.85 }}
            onPointerDown={(e) => {
              e.preventDefault();
              (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
              onPaintStart(s);
            }}
            onPointerEnter={() => onPaintEnter(s)}
            className={cn(
              "relative m-px h-7 w-6 rounded border touch-none transition-colors",
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
          </motion.button>
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
    return { bg: "rgb(140, 200, 255)", label: name === "open" ? "○" : name.replace(/^gobo/, "") };
  }
  return { bg: "rgb(124, 146, 255)", label: posSymbol(c as string) };
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
