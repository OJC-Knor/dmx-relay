import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HexColorPicker } from "react-colorful";

import { Button } from "@/components/Button";
import { Section } from "@/components/Section";
import { useToast } from "@/components/Toast";
import {
  deletePattern, fetchPatterns, fetchRig, fetchScenes, playScene, savePattern, stopScene,
} from "@/lib/api";
import type { FixtureMeta, Pattern } from "@/lib/types";
import { cn, rgbToHex } from "@/lib/utils";

const PALETTE: { name: string; rgb: [number, number, number] | null }[] = [
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

const TYPE_GROUPS: { type: FixtureMeta["type"]; label: string; rgb: boolean }[] = [
  { type: "tripar",    label: "Tripars",       rgb: true },
  { type: "pinspot",   label: "Pinspots",      rgb: false },
  { type: "spotlight", label: "Spotlight",     rgb: false },
  { type: "atomic",    label: "Atomic",        rgb: false },
  { type: "focus",     label: "Focus Spots",   rgb: false },
  { type: "groot",     label: "Groot heads",   rgb: false },
  { type: "fog",       label: "Fog",           rgb: false },
];

type Cell = [number, number, number] | null;
type Tracks = Record<string, Cell[]>;

function blank(steps: number, fixtures: FixtureMeta[]): Tracks {
  return Object.fromEntries(fixtures.map((f) => [f.id, Array.from({ length: steps }, () => null)]));
}

function reshape(tracks: Tracks, steps: number, fixtures: FixtureMeta[]): Tracks {
  const out: Tracks = {};
  for (const f of fixtures) {
    const arr = (tracks[f.id] ?? []).slice(0, steps);
    while (arr.length < steps) arr.push(null);
    out[f.id] = arr;
  }
  return out;
}

export default function Builder() {
  const toast = useToast();
  const qc = useQueryClient();

  const rig = useQuery({ queryKey: ["rig"], queryFn: fetchRig });
  const fixtures = rig.data?.fixtures ?? [];

  const [name, setName] = useState("");
  const [steps, setSteps] = useState(16);
  const [bpm, setBpm] = useState(120);
  const [tracks, setTracks] = useState<Tracks>({});
  const [brushIdx, setBrushIdx] = useState(1);
  const [customColor, setCustomColor] = useState<[number, number, number]>([255, 255, 255]);
  const [useCustom, setUseCustom] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [enabledTypes, setEnabledTypes] = useState<Set<string>>(
    () => new Set(["tripar", "pinspot", "spotlight", "atomic", "focus", "groot", "fog"]),
  );

  // initialise tracks once we know the fixture list
  useEffect(() => {
    if (fixtures.length && Object.keys(tracks).length === 0) {
      setTracks(blank(steps, fixtures));
    }
  }, [fixtures, steps, tracks]);

  const stepMs = useMemo(() => Math.round(60_000 / (bpm * 4)), [bpm]);

  const scenes = useQuery({ queryKey: ["scenes"], queryFn: fetchScenes, refetchInterval: 1500 });
  const running = scenes.data?.running ?? null;
  const playingThis = !!running && running === `pattern:${name || "__live"}`;

  // local playhead (cosmetic)
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
    setTracks((t) => reshape(t, n, fixtures));
  };

  const packPattern = (): Pattern => ({
    step_ms: stepMs,
    bpm,
    steps,
    tracks: Object.fromEntries(
      Object.entries(tracks).map(([id, cells]) => [
        id,
        cells.map((c) => (c ?? [0, 0, 0]) as [number, number, number]),
      ]),
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
    setTracks(blank(steps, fixtures));
  };

  const loadPattern = (n: string) => {
    const p = patterns.data?.patterns?.[n];
    if (!p) return;
    setName(n);
    setSteps(p.steps);
    setBpm(p.bpm);
    const next: Tracks = {};
    for (const f of fixtures) {
      const arr = (p.tracks[f.id] ?? []).slice(0, p.steps);
      next[f.id] = arr.map((c) => ((c[0] || c[1] || c[2]) ? c : null));
      while (next[f.id].length < p.steps) next[f.id].push(null);
    }
    setTracks(next);
  };

  // ----- painting -----

  const dragging = useRef(false);
  const currentBrush = (): Cell => {
    if (useCustom) return [...customColor];
    return PALETTE[brushIdx].rgb ? [...PALETTE[brushIdx].rgb!] : null;
  };

  const paint = (id: string, col: number) => {
    const c = currentBrush();
    setTracks((t) => {
      const prev = t[id];
      if (!prev) return t;
      const nextRow = prev.slice();
      nextRow[col] = c;
      return { ...t, [id]: nextRow };
    });
  };

  // group fixtures
  const groups = TYPE_GROUPS.map((g) => ({
    ...g,
    fixtures: fixtures.filter((f) => f.type === g.type),
  })).filter((g) => g.fixtures.length > 0);

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

      {/* Brush */}
      <Section title="Brush">
        <div className="flex flex-wrap items-center gap-2">
          {PALETTE.map((c, i) => (
            <button
              key={c.name}
              title={c.name}
              onClick={() => { setBrushIdx(i); setUseCustom(false); }}
              className={cn(
                "h-9 w-9 rounded-md border-2 transition relative",
                !useCustom && i === brushIdx ? "border-text scale-110" : "border-line",
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
              "h-9 w-9 rounded-md border-2 transition",
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
        </div>
      </Section>

      {/* Group filter */}
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
              <div className="w-12" />
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

            {groups.filter((g) => enabledTypes.has(g.type)).map((g) => (
              <div key={g.type} className="mt-2">
                <div className="mb-1 mt-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-muted">
                  <span className="h-px flex-1 bg-line/60" />
                  <span>{g.label}</span>
                  <span className="h-px flex-1 bg-line/60" />
                </div>
                {g.fixtures.map((f) => (
                  <div key={f.id} className="flex">
                    <div className="flex w-12 items-center justify-end pr-2 text-[11px] tabular-nums text-muted">
                      {f.label}
                    </div>
                    {Array.from({ length: steps }).map((_, s) => {
                      const c = tracks[f.id]?.[s];
                      const isPlaying = playCol === s;
                      const beat = s % 4 === 0;
                      // For non-RGB rows, render the cell as a brightness-only
                      // grey so the user can see "this fixture is on" without
                      // misleading colour info.
                      const fill = !c
                        ? undefined
                        : g.rgb
                          ? `rgb(${c.join(",")})`
                          : (() => {
                              const v = Math.max(c[0], c[1], c[2]);
                              return `rgb(${v}, ${v}, ${v})`;
                            })();
                      return (
                        <button
                          key={s}
                          onPointerDown={(e) => {
                            e.preventDefault();
                            (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
                            dragging.current = true;
                            paint(f.id, s);
                          }}
                          onPointerEnter={() => { if (dragging.current) paint(f.id, s); }}
                          onPointerUp={() => { dragging.current = false; }}
                          onPointerCancel={() => { dragging.current = false; }}
                          className={cn(
                            "m-px h-7 w-6 rounded border touch-none",
                            beat ? "border-accent/40" : "border-line",
                            isPlaying && "ring-2 ring-accent ring-inset",
                          )}
                          style={fill ? { background: fill } : { backgroundColor: "#1f1f25" }}
                        />
                      );
                    })}
                  </div>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-[0.12em] text-muted">{label}</span>
      {children}
    </div>
  );
}
