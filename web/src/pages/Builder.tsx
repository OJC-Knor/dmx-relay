import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HexColorPicker } from "react-colorful";

import { Button } from "@/components/Button";
import { Section } from "@/components/Section";
import { useToast } from "@/components/Toast";
import {
  deletePattern, fetchPatterns, fetchScenes, playScene, savePattern, stopScene,
} from "@/lib/api";
import type { Pattern } from "@/lib/types";
import { cn, rgbToHex } from "@/lib/utils";

const TRIPAR_COUNT = 12;

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

type Cell = [number, number, number] | null;
type Tracks = Record<string, Cell[]>;

function blankTracks(steps: number): Tracks {
  const out: Tracks = {};
  for (let i = 0; i < TRIPAR_COUNT; i++) {
    out[`tripar-${i + 1}`] = Array.from({ length: steps }, () => null);
  }
  return out;
}

function reshape(tracks: Tracks, steps: number): Tracks {
  const out: Tracks = {};
  for (let i = 0; i < TRIPAR_COUNT; i++) {
    const id = `tripar-${i + 1}`;
    const arr = (tracks[id] ?? []).slice(0, steps);
    while (arr.length < steps) arr.push(null);
    out[id] = arr;
  }
  return out;
}

export default function Builder() {
  const toast = useToast();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [steps, setSteps] = useState(16);
  const [bpm, setBpm] = useState(120);
  const [tracks, setTracks] = useState<Tracks>(() => blankTracks(16));
  const [brushIdx, setBrushIdx] = useState(1);                 // pointer into PALETTE
  const [customColor, setCustomColor] = useState<[number, number, number]>([255, 255, 255]);
  const [useCustom, setUseCustom] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const stepMs = useMemo(() => Math.round(60_000 / (bpm * 4)), [bpm]);

  // play state — mirror server
  const scenes = useQuery({ queryKey: ["scenes"], queryFn: fetchScenes, refetchInterval: 1500 });
  const running = scenes.data?.running ?? null;
  const playing = !!running && running.startsWith("pattern:");
  const playingThis = playing && running === `pattern:${name || "__live"}`;

  // local playhead (purely cosmetic; updates faster than the server roundtrip)
  const [playCol, setPlayCol] = useState(-1);
  const playTimer = useRef<number | null>(null);
  useEffect(() => {
    if (playTimer.current) { clearInterval(playTimer.current); playTimer.current = null; }
    if (playingThis) {
      setPlayCol(0);
      playTimer.current = window.setInterval(() => {
        setPlayCol((c) => (c + 1) % steps);
      }, stepMs);
    } else {
      setPlayCol(-1);
    }
    return () => { if (playTimer.current) clearInterval(playTimer.current); };
  }, [playingThis, steps, stepMs]);

  // patterns list
  const patterns = useQuery({ queryKey: ["patterns"], queryFn: fetchPatterns });

  // mutations
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

  // ----- actions -----

  const onResize = (newSteps: number) => {
    const n = Math.max(2, Math.min(64, newSteps));
    setSteps(n);
    setTracks((t) => reshape(t, n));
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
    setTracks(blankTracks(steps));
  };

  const loadPattern = (n: string) => {
    const p = patterns.data?.patterns?.[n];
    if (!p) return;
    setName(n);
    setSteps(p.steps);
    setBpm(p.bpm);
    const next: Tracks = {};
    for (let i = 0; i < TRIPAR_COUNT; i++) {
      const id = `tripar-${i + 1}`;
      const arr = (p.tracks[id] ?? []).slice(0, p.steps);
      next[id] = arr.map((c) => ((c[0] || c[1] || c[2]) ? c : null));
      while (next[id].length < p.steps) next[id].push(null);
    }
    setTracks(next);
  };

  // ----- painting -----

  const dragging = useRef(false);
  const currentBrushColor = (): Cell => {
    if (useCustom) return [...customColor];
    return PALETTE[brushIdx].rgb ? [...PALETTE[brushIdx].rgb!] : null;
  };

  const paint = (id: string, col: number) => {
    const c = currentBrushColor();
    setTracks((t) => {
      const next = { ...t, [id]: [...t[id]] };
      next[id][col] = c;
      return next;
    });
  };

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

      {/* Brush palette */}
      <Section title="Brush">
        <div className="flex flex-wrap items-center gap-2">
          {PALETTE.map((c, i) => (
            <button
              key={c.name}
              title={c.name}
              onClick={() => { setBrushIdx(i); setUseCustom(false); }}
              className={cn(
                "h-9 w-9 rounded-md border-2 transition",
                !useCustom && i === brushIdx ? "border-text scale-110" : "border-line",
                c.name === "off" && "bg-surface2 relative",
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

      {/* Grid */}
      <Section
        title="Pattern"
        hint={<span>tap or drag to paint • <span className="text-accent">{playingThis ? "playing" : "paused"}</span></span>}
      >
        <div className="scrollbar-thin overflow-x-auto">
          <div className="inline-block min-w-full rounded-lg border border-line bg-surface p-3">
            {/* step header */}
            <div className="mb-1 flex">
              <div className="w-10" />
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
            {/* rows */}
            {Array.from({ length: TRIPAR_COUNT }).map((_, i) => {
              const id = `tripar-${i + 1}`;
              return (
                <div key={id} className="flex">
                  <div className="flex w-10 items-center justify-end pr-2 text-[11px] tabular-nums text-muted">
                    T{i + 1}
                  </div>
                  {Array.from({ length: steps }).map((_, s) => {
                    const c = tracks[id]?.[s];
                    const isPlaying = playCol === s;
                    const beat = s % 4 === 0;
                    return (
                      <button
                        key={s}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
                          dragging.current = true;
                          paint(id, s);
                        }}
                        onPointerEnter={() => { if (dragging.current) paint(id, s); }}
                        onPointerUp={() => { dragging.current = false; }}
                        onPointerCancel={() => { dragging.current = false; }}
                        className={cn(
                          "m-px h-7 w-6 rounded border touch-none",
                          beat ? "border-accent/40" : "border-line",
                          isPlaying && "ring-2 ring-accent ring-inset",
                        )}
                        style={c ? { background: `rgb(${c.join(",")})` } : { background: "var(--tw-bg)", backgroundColor: "#1f1f25" }}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-3 text-[11px] text-muted">
          {(stepMs * steps / 1000).toFixed(2)}s loop · {Object.values(tracks).flat().filter((c) => c !== null).length} cells lit
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
