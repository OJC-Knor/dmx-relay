import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Activity, Maximize2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Tooltip } from "@/components/ui/Tooltip";
import { fetchLayout, fetchRig } from "@/lib/api";
import type { AtomicState, FixtureMeta, HeadState, PinspotState, TriparState } from "@/lib/types";
import { useLiveState } from "@/lib/useLiveState";
import { cn } from "@/lib/utils";

const FOCUS_BANDS: [number, number, [number, number, number]][] = [
  [0, 14,   [255, 255, 255]], [15, 29,  [255, 60, 60]],
  [30, 44,  [70, 120, 255]],  [45, 59,  [60, 230, 100]],
  [60, 74,  [255, 230, 60]],  [75, 89,  [255, 130, 200]],
  [90, 104, [160, 200, 255]], [105, 119,[180, 255, 170]],
  [120, 127,[255, 255, 200]],
];
const GROOT_BANDS: [number, number, [number, number, number]][] = [
  [0, 15,    [255, 255, 255]], [16, 31,   [70, 120, 255]],
  [32, 47,   [255, 60, 60]],   [48, 63,   [60, 230, 100]],
  [64, 79,   [255, 230, 60]],  [80, 95,   [255, 80, 220]],
  [96, 111,  [120, 230, 255]], [112, 127, [180, 255, 170]],
];

function bandColor(value: number, bands: typeof FOCUS_BANDS): [number, number, number] {
  for (const [lo, hi, rgb] of bands) if (value >= lo && value <= hi) return rgb;
  return [255, 255, 255];
}

function rgbStr([r, g, b]: [number, number, number], k = 1) {
  return `rgb(${(r * k) | 0}, ${(g * k) | 0}, ${(b * k) | 0})`;
}

export default function Viz() {
  const rig = useQuery({ queryKey: ["rig"], queryFn: fetchRig });
  const layout = useQuery({ queryKey: ["layout"], queryFn: fetchLayout });
  const { state, connected } = useLiveState();
  const stageRef = useRef<HTMLDivElement>(null);

  const fixtures = rig.data?.fixtures ?? [];
  const positions = layout.data ?? {};

  const tripars: Record<string, TriparState> = {};
  state.tripars.forEach((t) => (tripars[t.id] = t));
  const pinspots: Record<string, PinspotState> = {};
  state.pinspots?.forEach((p) => (pinspots[p.id] = p));
  const focus: Record<string, HeadState> = {};
  state.focus.forEach((h) => (focus[h.id] = h));
  const groot: Record<string, HeadState> = {};
  state.groot.forEach((h) => (groot[h.id] = h));

  const goFullscreen = () => {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen?.();
    }
  };

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Activity className="size-3" />
            Live visualisation
          </span>
        }
        subtitle="Realtime preview of the rig — updates over WebSocket as scenes run"
        action={
          <div className="flex items-center gap-2">
            <span className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium",
              connected
                ? "bg-ok/15 text-ok border border-ok/30"
                : "bg-danger/15 text-danger border border-danger/30",
            )}>
              {connected ? "● live" : "● offline"}
            </span>
            <Tooltip content="Fullscreen the stage view">
              <Button size="icon" variant="ghost" onClick={goFullscreen}>
                <Maximize2 className="size-4" />
              </Button>
            </Tooltip>
          </div>
        }
      />
      <CardBody>
        <div
          ref={stageRef}
          className="relative w-full overflow-hidden rounded-xl border border-line"
          style={{
            aspectRatio: "16 / 10",
            background:
              "radial-gradient(ellipse 50% 30% at 50% 14%, rgba(124,146,255,0.06) 0%, transparent 70%)," +
              "radial-gradient(ellipse 60% 30% at 50% 90%, rgba(255,80,112,0.04) 0%, transparent 70%)," +
              "#050507",
          }}
        >
          <span className="absolute left-1/2 top-2 -translate-x-1/2 text-[9px] tracking-[0.3em] text-white/15">CROWD</span>
          <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[9px] tracking-[0.3em] text-white/15">STAGE</span>

          {state.running_scene && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute right-3 top-3 flex items-center gap-2 rounded-full border border-accent/30 bg-accent/15 px-3 py-1 text-[11px] text-accent backdrop-blur"
            >
              <Activity className="size-3 animate-pulse" />
              <span className="max-w-[180px] truncate">{state.running_scene.replace(/^pattern:/, "♪ ")}</span>
            </motion.div>
          )}

          {fixtures.map((f) => {
            const p = positions[f.id] ?? { x: 0.5, y: 0.5 };
            if (f.type === "tripar")    return <TriparDot key={f.id} f={f} p={p} t={tripars[f.id]} />;
            if (f.type === "pinspot")   return <PinspotDot key={f.id} f={f} p={p} pin={pinspots[f.id]} />;
            if (f.type === "spotlight") return <SpotlightDot key={f.id} f={f} p={p} on={state.spotlight > 0} />;
            if (f.type === "focus" || f.type === "groot") {
              const h = (f.type === "focus" ? focus : groot)[f.id];
              return <Head key={f.id} f={f} p={p} h={h} kind={f.type} />;
            }
            if (f.type === "atomic") return <AtomicDot key={f.id} p={p} a={state.atomic} />;
            if (f.type === "fog")    return <FogCloud key={f.id} p={p} level={state.fog} />;
            return null;
          })}
        </div>
      </CardBody>
    </Card>
  );
}

function TriparDot({ f, p, t }: { f: FixtureMeta; p: { x: number; y: number }; t?: TriparState }) {
  if (!t) return null;
  const dim = t.dimmer / 255;
  const lit = t.strobe > 0 ? 1 : 0;
  const w = t.white;
  const r = Math.min(255, t.red + w * 0.7);
  const g = Math.min(255, t.green + w * 0.7);
  const b = Math.min(255, t.blue + w * 0.7);
  const k = dim * lit;
  const intensity = ((r + g + b) / 3) * k;
  const bg = `rgb(${(r * k) | 0}, ${(g * k) | 0}, ${(b * k) | 0})`;
  const glow = intensity > 30
    ? `0 0 ${10 + intensity / 8}px ${bg}, 0 0 ${20 + intensity / 4}px rgb(${(r * k * 0.6) | 0}, ${(g * k * 0.6) | 0}, ${(b * k * 0.6) | 0})`
    : "none";
  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
      title={f.label}
      style={{
        left: `${p.x * 100}%`, top: `${p.y * 100}%`,
        width: 28, height: 28,
        background: bg, boxShadow: glow,
        transition: "background-color 60ms linear, box-shadow 80ms linear",
      }}
    />
  );
}

function Head({ f, p, h, kind }: {
  f: FixtureMeta; p: { x: number; y: number }; h?: HeadState; kind: "focus" | "groot";
}) {
  if (!h) return null;
  const bands = kind === "focus" ? FOCUS_BANDS : GROOT_BANDS;
  const rgb = bandColor(h.color as number, bands);
  const shutterOpen = (h.shutter as number) >= 8;
  const k = (h.dimmer as number) / 255 * (shutterOpen ? 1 : 0);
  const panDeg = (((h.pan as number) - 128) / 128) * 60;
  const tilt01 = (h.tilt as number) / 255;
  const length = 30 + tilt01 * 80;
  const beamColor = rgbStr(rgb, Math.max(0.2, k));
  return (
    <>
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-white/25"
        title={f.label}
        style={{
          left: `${p.x * 100}%`, top: `${p.y * 100}%`,
          width: 22, height: 22,
          background: rgbStr(rgb, k),
          boxShadow: k > 0.05 ? `0 0 ${8 + k * 18}px ${rgbStr(rgb, k)}` : "none",
          transition: "background-color 60ms linear, box-shadow 80ms linear",
        }}
      />
      <div
        className="absolute origin-top -translate-x-1/2 rounded-full"
        style={{
          left: `${p.x * 100}%`, top: `${p.y * 100}%`,
          width: 2, height: length,
          color: beamColor,
          background: `linear-gradient(180deg, ${beamColor} 0%, transparent 100%)`,
          opacity: k * 0.85,
          transform: `translate(-50%, 0) rotate(${panDeg}deg)`,
          transition: "transform 120ms linear, opacity 80ms linear, background 80ms linear",
        }}
      />
    </>
  );
}

function AtomicDot({ p, a }: { p: { x: number; y: number }; a: AtomicState }) {
  const k = (a?.intensity ?? 0) / 255;
  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/20"
      title="Atomic"
      style={{
        left: `${p.x * 100}%`, top: `${p.y * 100}%`,
        width: 32, height: 32,
        background: `rgb(${(255 * k) | 0}, ${(255 * k) | 0}, ${(230 * k) | 0})`,
        boxShadow: k > 0.05
          ? `0 0 ${20 + k * 30}px rgba(255,255,220,${k}), 0 0 ${40 + k * 60}px rgba(255,240,180,${k * 0.6})`
          : "none",
        transition: "background-color 40ms linear, box-shadow 40ms linear",
      }}
    />
  );
}

function PinspotDot({ f, p, pin }: { f: FixtureMeta; p: { x: number; y: number }; pin?: PinspotState }) {
  const k = (pin?.level ?? 0) / 255;
  const c = `rgb(${(255 * k) | 0}, ${(220 * k) | 0}, ${(140 * k) | 0})`;
  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
      title={f.label}
      style={{
        left: `${p.x * 100}%`, top: `${p.y * 100}%`,
        width: 18, height: 18,
        background: c,
        boxShadow: k > 0.05 ? `0 0 ${8 + k * 14}px ${c}` : "none",
        transition: "background-color 60ms linear, box-shadow 80ms linear",
      }}
    />
  );
}

function SpotlightDot({ f, p, on }: { f: FixtureMeta; p: { x: number; y: number }; on: boolean }) {
  const k = on ? 1 : 0;
  const c = `rgb(${(255 * k) | 0}, ${(200 * k) | 0}, ${(80 * k) | 0})`;
  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-white/30"
      title={f.label}
      style={{
        left: `${p.x * 100}%`, top: `${p.y * 100}%`,
        width: 22, height: 22,
        background: c,
        boxShadow: on ? `0 0 16px ${c}, 0 0 32px rgba(255,200,80,0.5)` : "none",
        transition: "background-color 60ms linear, box-shadow 80ms linear",
      }}
    />
  );
}

function FogCloud({ p, level }: { p: { x: number; y: number }; level: number }) {
  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
      title="Fog"
      style={{
        left: `${p.x * 100}%`, top: `${p.y * 100}%`,
        width: 90, height: 90,
        background: "radial-gradient(circle, rgba(180,200,220,0.5), rgba(180,200,220,0))",
        filter: "blur(8px)",
        opacity: (level / 255) * 0.9,
      }}
    />
  );
}
