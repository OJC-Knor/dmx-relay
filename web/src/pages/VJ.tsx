// VJ tab — phone-first live performance surface.
//
// Tempo lives on the server (one beat for every phone): tap it in, or let
// the microphone follow the kick. Beat effects, colour and master dimmer
// sit on top of whatever scene runs; hold pads fire only while pressed.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Cloud, Mic, MicOff, Minus, MoonStar, Plus, Sun, Zap,
} from "lucide-react";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Slider } from "@/components/ui/Slider";
import { Switch } from "@/components/ui/Switch";
import { ToggleGroup, ToggleItem } from "@/components/ui/ToggleGroup";
import { fetchScenes, vjHold, vjScene, vjSettings, vjTap, vjTempo } from "@/lib/api";
import { BeatDetector, type DetectorReading, type DetectorStatus } from "@/lib/beatDetector";
import type { VJEffect, VJHold, VJState } from "@/lib/types";
import { useLiveState } from "@/lib/useLiveState";
import { cn, throttle } from "@/lib/utils";

const fail = (e: Error) => toast.error(e.message);

/** Current beat position, extrapolated from the last server push. */
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

export default function VJ() {
  const { state } = useLiveState();
  const vj = state.vj;
  if (!vj) {
    return <p className="text-sm text-mutedFg">Connecting…</p>;
  }
  return (
    <div className="mx-auto max-w-md space-y-3">
      <TempoCard vj={vj} />
      <HoldPads active={vj.holds} />
      <EffectsCard vj={vj} />
      <ColourCard vj={vj} />
      <ScenePads vj={vj} running={state.running_scene} />
    </div>
  );
}

// ----- tempo: tap, mic, nudge -----

function TempoCard({ vj }: { vj: VJState }) {
  const { clock } = vj;
  const beatPos = useBeatPosition();
  const taps = useRef<number[]>([]);
  const [mic, setMic] = useState<DetectorStatus>("off");
  const [reading, setReading] = useState<DetectorReading | null>(null);
  const detector = useRef<BeatDetector | null>(null);
  const clockRef = useRef(clock);
  clockRef.current = clock;

  const stopMic = useCallback(() => {
    detector.current?.stop();
    detector.current = null;
    setMic("off");
    setReading(null);
  }, []);

  const tap = useCallback(() => {
    if (detector.current) stopMic();       // a tap takes over from the mic
    const now = performance.now();
    const t = taps.current;
    if (t.length && now - t[t.length - 1] > 2000) t.length = 0;   // new run
    t.push(now);
    if (t.length > 9) t.shift();
    let bpm: number | null = null;
    if (t.length >= 2) {
      bpm = (60_000 * (t.length - 1)) / (t[t.length - 1] - t[0]);
      bpm = Math.round(bpm * 10) / 10;
      if (bpm < 40 || bpm > 240) bpm = null;
    }
    navigator.vibrate?.(8);
    vjTap(bpm, t.length - 1).catch(fail);
  }, [stopMic]);

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

  const startMic = async () => {
    let lastBpmSent = 0, lastPhaseSent = 0;
    let confident = false;
    const d = new BeatDetector({
      onReading: (r) => {
        setReading(r);
        confident = r.bpm !== null && r.confidence > 0.3;
        const now = performance.now();
        if (confident && r.bpm && now - lastBpmSent > 2000
            && Math.abs(r.bpm - clockRef.current.bpm) > 1.5) {
          lastBpmSent = now;
          vjTempo({ bpm: r.bpm, sync: true, source: "mic" }).catch(fail);
        }
      },
      onOnset: (t) => {
        // Re-align the phase on a kick that lands close to a predicted beat.
        if (!confident || t - lastPhaseSent < 2000) return;
        const pos = beatPos();
        if (Math.abs(pos - Math.round(pos)) < 0.2) {
          lastPhaseSent = t;
          vjTempo({ beat_now: true, source: "mic" }).catch(fail);
        }
      },
    });
    setMic("starting");
    const status = await d.start();
    setMic(status);
    if (status === "listening") detector.current = d;
  };
  useEffect(() => () => detector.current?.stop(), []);

  const micHint: Partial<Record<DetectorStatus, string>> = {
    insecure: "Mic needs https:// (or localhost) — browsers block it on plain http.",
    denied: "Microphone permission was denied.",
    error: "Couldn't open the microphone.",
  };

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-mutedFg">
              BPM · {clock.source === "mic" ? "mic" : "tap"}
            </div>
            <div className="font-mono text-5xl font-semibold tabular-nums leading-none">
              {clock.bpm.toFixed(clock.bpm % 1 ? 1 : 0)}
            </div>
          </div>
          <BeatDots beatPos={beatPos} />
        </div>

        <button
          onPointerDown={(e) => { e.preventDefault(); tap(); }}
          onContextMenu={(e) => e.preventDefault()}
          className="h-24 w-full touch-none select-none rounded-2xl border border-accent/60 bg-accent/15
                     text-2xl font-bold tracking-[0.2em] text-accent transition active:scale-[0.98]
                     active:bg-accent/30 [-webkit-tap-highlight-color:transparent]"
        >
          TAP
        </button>

        <div className="grid grid-cols-6 gap-1.5">
          <Small onClick={() => vjTempo({ bpm: clock.bpm - 1 }).catch(fail)} label="−1 BPM"><Minus className="size-4" /></Small>
          <Small onClick={() => vjTempo({ bpm: clock.bpm + 1 }).catch(fail)} label="+1 BPM"><Plus className="size-4" /></Small>
          <Small onClick={() => vjTempo({ bpm: clock.bpm / 2 }).catch(fail)} label="Half">½</Small>
          <Small onClick={() => vjTempo({ bpm: clock.bpm * 2 }).catch(fail)} label="Double">×2</Small>
          <Small onClick={() => vjTempo({ nudge_ms: -20 }).catch(fail)} label="Earlier">◀</Small>
          <Small onClick={() => vjTempo({ nudge_ms: 20 }).catch(fail)} label="Later">▶</Small>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <Small onClick={() => vjTempo({ downbeat: true }).catch(fail)} label="Now is beat 1" wide>
            Beat 1 now
          </Small>
          <Small
            onClick={() => (detector.current ? stopMic() : startMic())}
            label="Follow the microphone"
            active={mic === "listening"}
            wide
          >
            {mic === "listening" ? <Mic className="size-4" /> : <MicOff className="size-4" />}
            {mic === "listening"
              ? reading?.bpm ? `Mic ${reading.bpm} · ${Math.round(reading.confidence * 100)}%` : "Listening…"
              : mic === "starting" ? "Starting…" : "Mic"}
          </Small>
        </div>
        {mic === "listening" && (
          <div className="h-1 overflow-hidden rounded-full bg-surface3">
            <div className="h-full bg-accent transition-[width] duration-200"
                 style={{ width: `${(reading?.level ?? 0) * 100}%` }} />
          </div>
        )}
        {micHint[mic] && <p className="text-xs text-warn">{micHint[mic]}</p>}

        <label className="flex items-center justify-between text-xs text-mutedFg">
          Saved patterns follow this BPM
          <Switch checked={clock.sync} onCheckedChange={(v) => vjTempo({ sync: v }).catch(fail)} />
        </label>
      </CardBody>
    </Card>
  );
}

function BeatDots({ beatPos }: { beatPos: () => number }) {
  const dots = useRef<(HTMLSpanElement | null)[]>([]);
  useEffect(() => {
    let raf = 0;
    const frame = () => {
      const pos = beatPos();
      const current = ((Math.floor(pos) % 4) + 4) % 4;
      const glow = Math.exp(-(pos - Math.floor(pos)) * 5);
      dots.current.forEach((el, i) => {
        if (!el) return;
        el.style.opacity = i === current ? String(0.35 + 0.65 * glow) : "0.15";
        el.style.transform = i === current ? `scale(${1 + 0.35 * glow})` : "scale(1)";
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [beatPos]);
  return (
    <div className="flex gap-2 pb-1">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          ref={(el) => { dots.current[i] = el; }}
          className={cn("size-4 rounded-full", i === 0 ? "bg-warn" : "bg-accent")}
        />
      ))}
    </div>
  );
}

function Small({
  children, onClick, label, active, wide,
}: { children: ReactNode; onClick: () => void; label: string; active?: boolean; wide?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-10 items-center justify-center gap-1.5 rounded-xl border text-sm font-medium transition",
        "select-none active:translate-y-px [-webkit-tap-highlight-color:transparent]",
        active ? "border-accent bg-accent/20 text-accent" : "border-line bg-surface2 text-text",
        wide && "px-3",
      )}
    >
      {children}
    </button>
  );
}

// ----- hold-to-fire pads -----

const PADS: { name: VJHold; label: string; icon: typeof Sun; cls: string }[] = [
  { name: "blinder",  label: "Blinder",  icon: Sun,      cls: "from-[#4a3a10] to-[#2a2008] border-[#8a6a20] text-[#ffe08a]" },
  { name: "strobe",   label: "Strobe",   icon: Zap,      cls: "from-[#3a1f18] to-[#2a1612] border-[#7a3c2c] text-[#ffb08a]" },
  { name: "blackout", label: "Blackout", icon: MoonStar, cls: "from-[#2a0f16] to-[#170810] border-[#6a2234] text-[#ff8aa0]" },
  { name: "fog",      label: "Fog",      icon: Cloud,    cls: "from-[#1c3348] to-[#101e2c] border-[#3a6080] text-[#cfe4f5]" },
];

function HoldPads({ active }: { active: VJHold[] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {PADS.map((p) => <HoldPad key={p.name} pad={p} on={active.includes(p.name)} />)}
    </div>
  );
}

function HoldPad({ pad, on }: { pad: (typeof PADS)[number]; on: boolean }) {
  const timer = useRef<number | null>(null);
  const [pressed, setPressed] = useState(false);

  const release = useCallback(() => {
    if (timer.current === null) return;
    clearInterval(timer.current);
    timer.current = null;
    setPressed(false);
    vjHold(pad.name, false).catch(fail);
  }, [pad.name]);

  const press = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not every pointer can be captured */ }
    if (timer.current !== null) return;
    setPressed(true);
    navigator.vibrate?.(15);
    vjHold(pad.name, true).catch(fail);
    // Dead-man: the server drops the hold ~0.7 s after the last refresh.
    timer.current = window.setInterval(() => vjHold(pad.name, true).catch(() => {}), 200);
  };

  useEffect(() => {
    const onHide = () => { if (document.hidden) release(); };
    document.addEventListener("visibilitychange", onHide);
    return () => { document.removeEventListener("visibilitychange", onHide); release(); };
  }, [release]);

  const Icon = pad.icon;
  return (
    <button
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}
      className={cn(
        "flex h-20 touch-none select-none flex-col items-center justify-center gap-1 rounded-2xl border",
        "bg-gradient-to-b text-sm font-bold uppercase tracking-[0.14em] transition",
        "[-webkit-tap-highlight-color:transparent]",
        pad.cls,
        (pressed || on) && "scale-[0.97] brightness-150 ring-2 ring-current",
      )}
    >
      <Icon className="size-5" />
      {pad.label}
      <span className="text-[9px] font-medium normal-case tracking-normal opacity-60">hold</span>
    </button>
  );
}

// ----- beat effects -----

const EFFECT_LABELS: { key: VJEffect; label: string; sub: string }[] = [
  { key: "flash",      label: "Flash",      sub: "white hit" },
  { key: "pulse",      label: "Pulse",      sub: "dim pump" },
  { key: "chase",      label: "Chase",      sub: "step round" },
  { key: "colour_bar", label: "Colour/bar", sub: "new colour" },
];

function EffectsCard({ vj }: { vj: VJState }) {
  return (
    <Card>
      <CardHeader
        title="Beat effects"
        action={
          <ToggleGroup value={String(vj.rate)} onValueChange={(v) => vjSettings({ rate: Number(v) }).catch(fail)}>
            <ToggleItem value="0.5" className="px-3">½</ToggleItem>
            <ToggleItem value="1" className="px-3">1×</ToggleItem>
            <ToggleItem value="2" className="px-3">2×</ToggleItem>
          </ToggleGroup>
        }
      />
      <CardBody className="!pt-1">
        <div className="grid grid-cols-4 gap-1.5">
          {EFFECT_LABELS.map((e) => {
            const on = vj.effects[e.key];
            return (
              <button
                key={e.key}
                onClick={() => vjSettings({ effects: { [e.key]: !on } }).catch(fail)}
                className={cn(
                  "flex h-16 flex-col items-center justify-center rounded-xl border text-xs font-semibold",
                  "select-none transition [-webkit-tap-highlight-color:transparent]",
                  on ? "border-accent bg-accent text-black" : "border-line bg-surface2 text-text",
                )}
              >
                {e.label}
                <span className={cn("text-[9px] font-normal", on ? "text-black/60" : "text-mutedFg")}>{e.sub}</span>
              </button>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}

// ----- colour + master -----

const SWATCHES: [number, number, number, number][] = [
  [255, 0, 0, 0], [255, 90, 0, 0], [255, 220, 0, 0], [0, 255, 0, 0], [0, 220, 255, 0],
  [0, 0, 255, 0], [150, 0, 255, 0], [255, 0, 140, 0], [0, 0, 0, 255],
];

function ColourCard({ vj }: { vj: VJState }) {
  const [dragging, setDragging] = useState<number | null>(null);
  const sendMaster = useMemo(() => throttle((v: number) => vjSettings({ master: v }).catch(fail), 60), []);
  const master = dragging ?? vj.master;
  const same = (c: number[]) => !!vj.colour && c.every((v, i) => v === vj.colour![i]);

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => vjSettings({ colour: null }).catch(fail)}
            className={cn(
              "h-9 shrink-0 rounded-lg border px-2 text-[11px] font-semibold",
              !vj.colour ? "border-text text-text" : "border-line text-mutedFg",
            )}
          >
            Scene
          </button>
          <div className="grid flex-1 grid-cols-9 gap-1">
            {SWATCHES.map((c) => (
              <button
                key={c.join()}
                aria-label={`colour ${c.join(",")}`}
                onClick={() => vjSettings({ colour: c }).catch(fail)}
                className={cn("h-9 rounded-lg border-2 transition", same(c) ? "border-text scale-105" : "border-transparent")}
                style={{ background: c[3] ? "#fff" : `rgb(${c[0]},${c[1]},${c[2]})` }}
              />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="w-14 text-[10px] uppercase tracking-[0.12em] text-mutedFg">Master</span>
          <Slider
            value={master}
            onChange={(v) => { setDragging(v); sendMaster(v); }}
            onCommit={(v) => { sendMaster(v); setTimeout(() => setDragging(null), 250); }}
          />
          <span className="w-9 text-right font-mono text-xs tabular-nums">{Math.round((master / 255) * 100)}%</span>
        </div>
      </CardBody>
    </Card>
  );
}

// ----- scene pads -----

function ScenePads({ vj, running }: { vj: VJState; running: string | null }) {
  const scenes = useQuery({ queryKey: ["scenes"], queryFn: fetchScenes });
  const items = (scenes.data?.scenes ?? []).filter((s) => !s.key.startsWith("pattern:__"));

  return (
    <Card>
      <CardHeader
        title="Scenes"
        action={
          <label className="flex items-center gap-2 text-xs text-mutedFg">
            On next bar
            <Switch checked={vj.quantize} onCheckedChange={(v) => vjSettings({ quantize: v }).catch(fail)} />
          </label>
        }
      />
      <CardBody className="!pt-1">
        <div className="grid grid-cols-3 gap-1.5">
          {items.map((s) => {
            const isRunning = running === s.key;
            const isQueued = vj.queued_scene === s.key;
            return (
              <button
                key={s.key}
                onClick={() => vjScene(s.key).catch(fail)}
                className={cn(
                  "h-14 truncate rounded-xl border px-2 text-xs font-medium transition select-none",
                  "[-webkit-tap-highlight-color:transparent] active:translate-y-px",
                  isRunning ? "border-accent bg-accent text-black"
                    : isQueued ? "animate-pulse border-accent text-accent"
                    : "border-line bg-surface2 text-text",
                )}
              >
                {s.kind === "pattern" ? `♪ ${s.label}` : s.label}
              </button>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}
