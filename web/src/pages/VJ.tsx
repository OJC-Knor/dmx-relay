// VJ tab — phone-first live surface, laid out like a pro remote.
//
// Borrowed conventions: Resolume's tempo strip (Tap, Resync, ± and
// hold-to-bend nudge, phrase indicator), lighting-console playback keys
// (LED per key, momentary FLASH keys, a grand-master fader, FX speed
// multipliers) and clip-launcher decks for scenes. Full height, no page
// scroll; what you hit blind (TAP, flash keys, master) sits in the thumb
// zone at the bottom.
//
// Tempo lives on the server, so every phone shares one beat.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { C, ClipPad, DECK_COLOURS, Key, Label, Led } from "@/components/console";
import { Slider } from "@/components/ui/Slider";
import { fetchScenes, stopScene, vjHold, vjScene, vjSettings, vjTap, vjTempo } from "@/lib/api";
import { BeatDetector, type DetectorReading, type DetectorStatus } from "@/lib/beatDetector";
import type { Tempo, VJEffect, VJHold, VJState } from "@/lib/types";
import { useLiveState } from "@/lib/useLiveState";
import { cn, throttle } from "@/lib/utils";

const fail = (e: Error) => toast.error(e.message);

const DECKS: { key: Tempo; label: string }[] = [
  { key: "slow", label: "Slow" }, { key: "medium", label: "Med" }, { key: "fast", label: "Fast" },
  { key: "insane", label: "Insane" }, { key: "pattern", label: "Pattern" },
];

// ----- beat position helpers -----

/** Beat position extrapolated from the last server push (no re-render). */
function useBeatPosition() {
  const { state, receivedAt } = useLiveState();
  const ref = useRef({ clock: state.vj?.clock, receivedAt });
  ref.current = { clock: state.vj?.clock, receivedAt };
  return useCallback(() => {
    const { clock, receivedAt } = ref.current;
    if (!clock) return 0;
    return clock.beat + ((performance.now() - receivedAt) / 1000) * (clock.bpm / 60);
  }, []);
}

/** Whole-beat counter that re-renders once per beat. */
function useBeatTick(beatPos: () => number) {
  const [beat, setBeat] = useState(() => Math.floor(beatPos()));
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const b = Math.floor(beatPos());
      setBeat((prev) => (prev === b ? prev : b));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [beatPos]);
  return beat;
}

// ----- page -----

export default function VJ() {
  const { state } = useLiveState();
  const vj = state.vj;
  const beatPos = useBeatPosition();
  const [page, setPage] = useState<"scenes" | "fx" | "colour">("scenes");

  if (!vj) return <p className="p-4 text-sm text-mutedFg">Connecting…</p>;

  return (
    // Cancel AppShell's main padding and fill the screen under the header.
    <div className="-mx-3 -mb-24 -mt-3 flex h-[calc(100dvh-49px)] flex-col gap-2 bg-[#08080a] p-2 text-[#e6e6e9] sm:mx-auto sm:max-w-md">
      <Transport vj={vj} beatPos={beatPos} />

      <div className="grid grid-cols-3 gap-1 rounded-md border border-[#1f1f24] bg-[#0e0e11] p-1">
        <PageTab on={page === "scenes"} onClick={() => setPage("scenes")} led={!!state.running_scene}>Scenes</PageTab>
        <PageTab on={page === "fx"} onClick={() => setPage("fx")} led={Object.values(vj.effects).some(Boolean)}>FX</PageTab>
        <PageTab on={page === "colour"} onClick={() => setPage("colour")} led={!!vj.colour}>Colour</PageTab>
      </div>

      <div className="min-h-0 flex-1">
        {page === "scenes" && <ScenesPage vj={vj} running={state.running_scene} beatPos={beatPos} />}
        {page === "fx" && <FxPage vj={vj} beatPos={beatPos} />}
        {page === "colour" && <ColourPage vj={vj} />}
      </div>

      <PerformanceDeck vj={vj} beatPos={beatPos} />
    </div>
  );
}

// ----- page-local primitives -----

function PageTab({ on, onClick, led, children }: { on: boolean; onClick: () => void; led: boolean; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-8 items-center justify-center gap-1.5 rounded-[4px] text-[11px] font-semibold uppercase tracking-[0.12em]",
        "[-webkit-tap-highlight-color:transparent]",
        on ? "bg-[#26262c] text-white" : "text-[#7c7c86]",
      )}
    >
      <Led on={led} />
      {children}
    </button>
  );
}

/** Repeats `fn` while held (for nudge, which bends tempo only while pressed). */
function useRepeatWhileHeld(fn: () => void, everyMs: number) {
  const timer = useRef<number | null>(null);
  const stop = useCallback(() => {
    if (timer.current !== null) clearInterval(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => stop, [stop]);
  return {
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      stop();
      fn();
      timer.current = window.setInterval(fn, everyMs);
    },
    onPointerUp: stop, onPointerCancel: stop, onLostPointerCapture: stop,
  };
}

// ----- transport: BPM, beat/phrase LEDs, tempo keys, mic -----

function Transport({ vj, beatPos }: { vj: VJState; beatPos: () => number }) {
  const { clock } = vj;
  const beat = useBeatTick(beatPos);
  const bar = Math.floor(beat / 4);
  const [editing, setEditing] = useState(false);
  const mic = useMicSync(clock.bpm, beatPos);

  // Hold-to-bend nudge (Resolume style): shift the phase 6 ms every 60 ms ≈ ±10 % tempo.
  const nudgeDown = useRepeatWhileHeld(() => vjTempo({ nudge_ms: 6 }).catch(fail), 60);
  const nudgeUp = useRepeatWhileHeld(() => vjTempo({ nudge_ms: -6 }).catch(fail), 60);

  return (
    <section className="rounded-md border border-[#1f1f24] bg-[#0e0e11] p-2">
      <div className="flex items-stretch gap-2">
        {/* BPM readout — tap to type */}
        <div className="flex min-w-[118px] flex-col justify-between rounded-[5px] border border-[#1f1f24] bg-black px-2 py-1">
          <div className="flex items-center justify-between">
            <Label>BPM</Label>
            <span
              className="rounded-[3px] px-1 text-[8px] font-bold uppercase tracking-[0.1em]"
              style={{ background: clock.source === "mic" ? C.live : "#26262c", color: clock.source === "mic" ? "#000" : "#9a9aa4" }}
            >
              {clock.source}
            </span>
          </div>
          {editing ? (
            <BpmInput bpm={clock.bpm} onDone={() => setEditing(false)} />
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="text-left font-mono text-[34px] font-semibold leading-none tabular-nums"
              style={{ color: C.beat }}
            >
              {clock.bpm.toFixed(1)}
            </button>
          )}
        </div>

        {/* Beat + phrase */}
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-1">
          <div className="flex items-baseline justify-between">
            <Label>Bar · Beat</Label>
            <span className="font-mono text-sm tabular-nums text-[#cfcfd6]">
              {String((bar % 8) + 1).padStart(2, "0")}.{(((beat % 4) + 4) % 4) + 1}
            </span>
          </div>
          <BeatSegments beatPos={beatPos} />
          <div className="flex gap-[3px]" title="Bars in the 8-bar phrase">
            {Array.from({ length: 8 }, (_, i) => (
              <span
                key={i}
                className="h-1 flex-1 rounded-[1px]"
                style={{ background: i <= ((bar % 8) + 8) % 8 ? (i === 0 ? C.beat : "#5a5a66") : "#1f1f24" }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-8 gap-1">
        <Key className="h-9" title="−1 BPM" onClick={() => vjTempo({ bpm: clock.bpm - 1 }).catch(fail)}>−</Key>
        <Key className="h-9" title="+1 BPM" onClick={() => vjTempo({ bpm: clock.bpm + 1 }).catch(fail)}>+</Key>
        <Key className="h-9" title="Half tempo" onClick={() => vjTempo({ bpm: clock.bpm / 2 }).catch(fail)}>÷2</Key>
        <Key className="h-9" title="Double tempo" onClick={() => vjTempo({ bpm: clock.bpm * 2 }).catch(fail)}>×2</Key>
        <Key className="h-9" title="Nudge back (hold)" {...nudgeDown}>◀</Key>
        <Key className="h-9" title="Nudge forward (hold)" {...nudgeUp}>▶</Key>
        <Key className="col-span-2 h-9" title="Resync: now is beat 1 of the phrase"
             onClick={() => vjTempo({ downbeat: true }).catch(fail)} colour={C.beat}>
          Resync
        </Key>
      </div>

      <div className="mt-1 grid grid-cols-8 gap-1">
        <Key className="col-span-3 h-8" lit={mic.status === "listening"} colour={C.live} onClick={mic.toggle}
             title="Follow the microphone">
          <Led on={mic.status === "listening"} colour="#000" />
          {mic.status === "listening"
            ? mic.reading?.bpm ? `Mic ${mic.reading.bpm} · ${Math.round(mic.reading.confidence * 100)}%` : "Mic …"
            : mic.status === "starting" ? "Mic …" : "Mic"}
        </Key>
        <div className="col-span-2 flex items-center px-1">
          {mic.status === "listening" && (
            <div className="h-1.5 w-full overflow-hidden rounded-[1px] bg-[#1f1f24]" title="Bass level">
              <div className="h-full transition-[width] duration-150"
                   style={{ width: `${(mic.reading?.level ?? 0) * 100}%`, background: C.live }} />
            </div>
          )}
        </div>
        <Key className="col-span-3 h-8" lit={clock.sync} colour={C.tick}
             onClick={() => vjTempo({ sync: !clock.sync }).catch(fail)}
             title="Saved patterns follow this BPM">
          <Led on={clock.sync} colour="#000" /> Sync patterns
        </Key>
      </div>
      {mic.hint && <p className="mt-1 text-[10px] text-[#ffb020]">{mic.hint}</p>}
    </section>
  );
}

function BpmInput({ bpm, onDone }: { bpm: number; onDone: () => void }) {
  const [v, setV] = useState(bpm.toFixed(1));
  const commit = () => {
    const n = Number(v);
    if (n >= 40 && n <= 240) vjTempo({ bpm: n }).catch(fail);
    onDone();
  };
  return (
    <input
      autoFocus
      inputMode="decimal"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") onDone(); }}
      className="w-full bg-transparent font-mono text-[34px] font-semibold leading-none tabular-nums outline-none"
      style={{ color: C.beat }}
    />
  );
}

function BeatSegments({ beatPos }: { beatPos: () => number }) {
  const segs = useRef<(HTMLSpanElement | null)[]>([]);
  useEffect(() => {
    let raf = 0;
    const frame = () => {
      const pos = beatPos();
      const cur = ((Math.floor(pos) % 4) + 4) % 4;
      const glow = Math.exp(-(pos - Math.floor(pos)) * 4);
      segs.current.forEach((el, i) => {
        if (!el) return;
        const colour = i === 0 ? C.beat : C.tick;
        el.style.background = i === cur ? colour : "#1f1f24";
        el.style.opacity = i === cur ? String(0.45 + 0.55 * glow) : "1";
        el.style.boxShadow = i === cur ? `0 0 ${10 * glow}px ${colour}` : "none";
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [beatPos]);
  return (
    <div className="grid h-6 grid-cols-4 gap-1">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} ref={(el) => { segs.current[i] = el; }} className="rounded-[3px]" />
      ))}
    </div>
  );
}

/** Microphone → shared tempo. BPM when confident, phase on kicks near a beat. */
function useMicSync(bpm: number, beatPos: () => number) {
  const [status, setStatus] = useState<DetectorStatus>("off");
  const [reading, setReading] = useState<DetectorReading | null>(null);
  const detector = useRef<BeatDetector | null>(null);
  const bpmRef = useRef(bpm);
  bpmRef.current = bpm;

  const stop = useCallback(() => {
    detector.current?.stop();
    detector.current = null;
    setStatus("off");
    setReading(null);
  }, []);

  const start = async () => {
    let lastBpmSent = 0, lastPhaseSent = 0, confident = false;
    const d = new BeatDetector({
      onReading: (r) => {
        setReading(r);
        confident = r.bpm !== null && r.confidence > 0.3;
        const now = performance.now();
        if (confident && r.bpm && now - lastBpmSent > 2000 && Math.abs(r.bpm - bpmRef.current) > 1.5) {
          lastBpmSent = now;
          vjTempo({ bpm: r.bpm, sync: true, source: "mic" }).catch(fail);
        }
      },
      onOnset: (t) => {
        if (!confident || t - lastPhaseSent < 2000) return;
        const pos = beatPos();
        if (Math.abs(pos - Math.round(pos)) < 0.2) {
          lastPhaseSent = t;
          vjTempo({ beat_now: true, source: "mic" }).catch(fail);
        }
      },
    });
    setStatus("starting");
    const s = await d.start();
    setStatus(s);
    if (s === "listening") detector.current = d;
  };

  useEffect(() => () => detector.current?.stop(), []);
  // Tapping takes over from the mic.
  useEffect(() => {
    const onTap = () => { if (detector.current) stop(); };
    window.addEventListener("vj:tap", onTap);
    return () => window.removeEventListener("vj:tap", onTap);
  }, [stop]);

  const hints: Partial<Record<DetectorStatus, string>> = {
    insecure: "Mic needs https:// or localhost — browsers block it on plain http.",
    denied: "Microphone permission was denied.",
    error: "Couldn't open the microphone.",
  };
  return {
    status, reading, hint: hints[status],
    toggle: () => (detector.current ? stop() : start()),
  };
}

// ----- scenes page: decks of clip pads -----

function ScenesPage({ vj, running, beatPos }: { vj: VJState; running: string | null; beatPos: () => number }) {
  const scenes = useQuery({ queryKey: ["scenes"], queryFn: fetchScenes });
  const items = useMemo(
    () => (scenes.data?.scenes ?? []).filter((s) => !s.key.startsWith("pattern:__")),
    [scenes.data],
  );
  const runningDeck = items.find((s) => s.key === running)?.tempo;
  const [deck, setDeck] = useState<Tempo | null>(null);
  const shown = deck ?? runningDeck ?? "slow";
  const beat = useBeatTick(beatPos);
  const beatsToBar = 4 - (((beat % 4) + 4) % 4);

  return (
    <section className="flex h-full flex-col gap-1.5 rounded-md border border-[#1f1f24] bg-[#0e0e11] p-2">
      <div className="flex items-center gap-1">
        {DECKS.map((d) => {
          const has = items.some((s) => s.tempo === d.key);
          if (!has) return null;
          const on = shown === d.key;
          return (
            <button
              key={d.key}
              onClick={() => setDeck(d.key)}
              className={cn(
                "flex h-7 flex-1 items-center justify-center gap-1 rounded-[4px] border text-[10px] font-semibold uppercase tracking-[0.08em]",
                "[-webkit-tap-highlight-color:transparent]",
                on ? "text-black" : "border-[#26262c] bg-[#16161a] text-[#9a9aa4]",
              )}
              style={on ? { background: DECK_COLOURS[d.key], borderColor: DECK_COLOURS[d.key] } : undefined}
            >
              {runningDeck === d.key && !on && <Led on colour={DECK_COLOURS[d.key]} />}
              {d.label}
            </button>
          );
        })}
      </div>

      <div className="grid min-h-0 flex-1 auto-rows-[56px] grid-cols-3 content-start gap-1 overflow-y-auto">
        {items.filter((s) => s.tempo === shown).map((s) => (
          <ClipPad key={s.key} item={s} running={running === s.key} queued={vj.queued_scene === s.key}
                   onClick={() => vjScene(s.key).catch(fail)}
                   beatsToBar={beatsToBar} barProgress={((((beat % 4) + 4) % 4) + 1) / 4} />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-1">
        <Key className="h-8" lit={vj.quantize} colour={C.beat}
             onClick={() => vjSettings({ quantize: !vj.quantize }).catch(fail)} title="Switch scenes on the next bar">
          <Led on={vj.quantize} colour="#000" /> Q · Bar
        </Key>
        <div className="flex items-center justify-center truncate px-1 text-[10px] text-[#7c7c86]">
          {running ? (items.find((s) => s.key === running)?.label ?? running.replace(/^pattern:/, "♪ ")) : "—"}
        </div>
        <Key className="h-8" onClick={() => stopScene().catch(fail)} title="Stop the running scene">
          Stop
        </Key>
      </div>
    </section>
  );
}

// ----- FX page -----

const FX: { key: VJEffect; label: string; sub: string }[] = [
  { key: "flash", label: "Flash", sub: "white hit on the beat" },
  { key: "pulse", label: "Pulse", sub: "dimmer pump" },
  { key: "chase", label: "Chase", sub: "step round the ring" },
  { key: "colour_bar", label: "Colour / bar", sub: "new colour each bar" },
];
const RATE_LABELS: [number, string][] = [[0.25, "¼"], [0.5, "½"], [1, "1"], [2, "2"], [4, "4"]];

function FxPage({ vj, beatPos }: { vj: VJState; beatPos: () => number }) {
  const beat = useBeatTick(beatPos);
  const flashOn = Math.floor(beat * vj.rate) % 2 === 0;
  return (
    <section className="flex h-full flex-col gap-2 rounded-md border border-[#1f1f24] bg-[#0e0e11] p-2">
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-1.5">
        {FX.map((f) => {
          const on = vj.effects[f.key];
          return (
            <button
              key={f.key}
              onClick={() => vjSettings({ effects: { [f.key]: !on } }).catch(fail)}
              className={cn(
                "flex flex-col justify-between rounded-[5px] border p-2 text-left",
                "select-none [-webkit-tap-highlight-color:transparent] active:brightness-125",
                on ? "border-[#7c92ff] bg-[#7c92ff1f]" : "border-[#26262c] bg-[#16161a]",
              )}
            >
              <span className="flex items-center justify-between">
                <span className="text-[13px] font-semibold uppercase tracking-[0.08em]">{f.label}</span>
                <Led on={on && flashOn} colour={C.tick} />
              </span>
              <span className="text-[10px] text-[#7c7c86]">{f.sub}</span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <Label className="w-12">Rate</Label>
        <div className="grid flex-1 grid-cols-5 gap-1">
          {RATE_LABELS.map(([r, label]) => (
            <Key key={r} className="h-8 font-mono text-[13px]" lit={vj.rate === r} colour={C.tick}
                 onClick={() => vjSettings({ rate: r }).catch(fail)} title={`${label}× beat`}>
              {label}
            </Key>
          ))}
        </div>
      </div>
    </section>
  );
}

// ----- colour page -----

const SWATCHES: { c: [number, number, number, number]; name: string }[] = [
  { c: [255, 0, 0, 0], name: "Red" }, { c: [255, 90, 0, 0], name: "Orange" }, { c: [255, 220, 0, 0], name: "Yellow" },
  { c: [0, 255, 0, 0], name: "Green" }, { c: [0, 220, 255, 0], name: "Cyan" }, { c: [0, 0, 255, 0], name: "Blue" },
  { c: [150, 0, 255, 0], name: "Purple" }, { c: [255, 0, 140, 0], name: "Pink" }, { c: [0, 0, 0, 255], name: "White" },
];

function ColourPage({ vj }: { vj: VJState }) {
  const same = (c: number[]) => !!vj.colour && c.every((v, i) => v === vj.colour![i]);
  return (
    <section className="flex h-full flex-col gap-1.5 rounded-md border border-[#1f1f24] bg-[#0e0e11] p-2">
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-1.5">
        {SWATCHES.map(({ c, name }) => {
          // hex, so an alpha suffix can be appended for the unselected tint
          const css = c[3] ? "#ffffff" : "#" + c.slice(0, 3).map((v) => v.toString(16).padStart(2, "0")).join("");
          const on = same(c);
          return (
            <button
              key={name}
              onClick={() => vjSettings({ colour: c }).catch(fail)}
              className="relative flex items-end rounded-[5px] border-2 p-1.5 [-webkit-tap-highlight-color:transparent] active:brightness-125"
              style={{ background: on ? css : `${css}33`, borderColor: on ? "#fff" : `${css}66` }}
            >
              <span className={cn("text-[10px] font-semibold uppercase tracking-[0.1em]", on ? "text-black" : "text-[#cfcfd6]")}>
                {name}
              </span>
            </button>
          );
        })}
      </div>
      <Key className="h-9" lit={!vj.colour} colour="#e6e6e9" onClick={() => vjSettings({ colour: null }).catch(fail)}
           title="Use the scene's own colours">
        Scene colours
      </Key>
    </section>
  );
}

// ----- bottom deck: grand master, flash keys, TAP -----

const FLASH_KEYS: { name: VJHold; label: string; colour: string }[] = [
  { name: "blinder", label: "Blind", colour: "#f4f4f6" },
  { name: "strobe", label: "Strobe", colour: "#ffb020" },
  { name: "blackout", label: "B.O.", colour: C.danger },
  { name: "fog", label: "Fog", colour: "#5fd6ff" },
];

function PerformanceDeck({ vj, beatPos }: { vj: VJState; beatPos: () => number }) {
  return (
    <section className="space-y-1.5 rounded-md border border-[#1f1f24] bg-[#0e0e11] p-2">
      <GrandMaster value={vj.master} />
      <div className="grid grid-cols-4 gap-1">
        {FLASH_KEYS.map((k) => <FlashKey key={k.name} {...k} active={vj.holds.includes(k.name)} />)}
      </div>
      <TapKey beatPos={beatPos} />
    </section>
  );
}

function GrandMaster({ value }: { value: number }) {
  const [dragging, setDragging] = useState<number | null>(null);
  const send = useMemo(() => throttle((v: number) => vjSettings({ master: v }).catch(fail), 60), []);
  const v = dragging ?? value;
  return (
    <div className="flex items-center gap-2">
      <Label className="w-6">GM</Label>
      <Slider
        value={v}
        colour={v < 255 ? C.beat : "#5a5a66"}
        onChange={(n) => { setDragging(n); send(n); }}
        onCommit={(n) => { send(n); setTimeout(() => setDragging(null), 250); }}
      />
      <span className="w-9 text-right font-mono text-xs tabular-nums" style={{ color: v < 255 ? C.beat : "#cfcfd6" }}>
        {Math.round((v / 255) * 100)}
      </span>
    </div>
  );
}

/** Momentary key: fires while held. Re-sends every 200 ms; the server drops
 *  the hold ~0.7 s after the last refresh, so it can never stick on. */
function FlashKey({ name, label, colour, active }: { name: VJHold; label: string; colour: string; active: boolean }) {
  const timer = useRef<number | null>(null);
  const [pressed, setPressed] = useState(false);

  const release = useCallback(() => {
    if (timer.current === null) return;
    clearInterval(timer.current);
    timer.current = null;
    setPressed(false);
    vjHold(name, false).catch(fail);
  }, [name]);

  const press = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (timer.current !== null) return;
    setPressed(true);
    navigator.vibrate?.(12);
    vjHold(name, true).catch(fail);
    timer.current = window.setInterval(() => vjHold(name, true).catch(() => {}), 200);
  };

  useEffect(() => {
    const onHide = () => { if (document.hidden) release(); };
    document.addEventListener("visibilitychange", onHide);
    return () => { document.removeEventListener("visibilitychange", onHide); release(); };
  }, [release]);

  const lit = pressed || active;
  return (
    <button
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}
      className="flex h-14 touch-none select-none flex-col items-center justify-center gap-0.5 rounded-[5px] border
                 [-webkit-tap-highlight-color:transparent]"
      style={lit
        ? { background: colour, borderColor: colour, color: "#0a0a0c", boxShadow: `0 0 18px ${colour}66` }
        : { background: "#16161a", borderColor: `${colour}55`, color: colour }}
    >
      <span className="text-[12px] font-bold uppercase tracking-[0.1em]">{label}</span>
      <span className="text-[8px] font-semibold uppercase tracking-[0.14em] opacity-60">flash</span>
    </button>
  );
}

function TapKey({ beatPos }: { beatPos: () => number }) {
  const taps = useRef<number[]>([]);
  const glowRef = useRef<HTMLSpanElement | null>(null);

  const tap = useCallback(() => {
    window.dispatchEvent(new Event("vj:tap"));
    const now = performance.now();
    const t = taps.current;
    if (t.length && now - t[t.length - 1] > 2000) t.length = 0;   // new run
    t.push(now);
    if (t.length > 9) t.shift();
    let bpm: number | null = null;
    if (t.length >= 2) {
      bpm = Math.round(((60_000 * (t.length - 1)) / (t[t.length - 1] - t[0])) * 10) / 10;
      if (bpm < 40 || bpm > 240) bpm = null;
    }
    navigator.vibrate?.(8);
    vjTap(bpm, t.length - 1).catch(fail);
  }, []);

  // Space bar taps on a laptop
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return;
      e.preventDefault();
      tap();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tap]);

  // The key's edge breathes with the beat so you can tap against it.
  useEffect(() => {
    let raf = 0;
    const frame = () => {
      const pos = beatPos();
      const glow = Math.exp(-(pos - Math.floor(pos)) * 5);
      const down = ((Math.floor(pos) % 4) + 4) % 4 === 0;
      if (glowRef.current) {
        glowRef.current.style.opacity = String(glow);
        glowRef.current.style.borderColor = down ? C.beat : C.tick;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [beatPos]);

  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); tap(); }}
      onContextMenu={(e) => e.preventDefault()}
      className="relative h-16 w-full touch-none select-none rounded-[5px] border border-[#3a3a44] bg-[#1a1a1f]
                 text-lg font-bold uppercase tracking-[0.3em] text-[#e6e6e9] active:bg-[#26262c]
                 [-webkit-tap-highlight-color:transparent]"
    >
      <span ref={glowRef} className="pointer-events-none absolute inset-0 rounded-[5px] border-2" />
      Tap
    </button>
  );
}
