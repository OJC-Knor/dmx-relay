import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  CircleSlash, Cloud, Disc3, Flame, Gauge, Leaf,
  Lightbulb, LightbulbOff, Music2, Power, Sparkle, Sun, Wand2, Waves, Zap, ZapOff,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Slider } from "@/components/ui/Slider";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  atomicFlash, atomicLightning, atomicOff, atomicStrobeFast, atomicStrobeSlow,
  blackout, fetchScenes, fogLevel, fogOff, fogPuff, playScene, spotlightOff, spotlightOn, stopScene,
} from "@/lib/api";
import type { SceneItem, Tempo } from "@/lib/types";
import { useLiveState } from "@/lib/useLiveState";
import { cn, throttle } from "@/lib/utils";

const TEMPO_INFO: Record<Tempo, { label: string; sub: string; icon: any; accent: string }> = {
  slow:    { label: "Slow",    sub: "atmospheric, ambient",  icon: Leaf,    accent: "text-[#5fd6ff]" },
  medium:  { label: "Medium",  sub: "groove, color washes",  icon: Gauge,   accent: "text-[#7c92ff]" },
  fast:    { label: "Fast",    sub: "energetic, dance",      icon: Flame,   accent: "text-[#ffa64d]" },
  insane:  { label: "Insane",  sub: "peak — strobes, chaos", icon: Sparkle, accent: "text-[#ff5070]" },
  pattern: { label: "Patterns",sub: "your saved sequences",  icon: Music2,  accent: "text-accent" },
};
const TEMPO_ORDER: Tempo[] = ["slow", "medium", "fast", "insane", "pattern"];

export default function Controls() {
  const qc = useQueryClient();
  const scenes = useQuery({ queryKey: ["scenes"], queryFn: fetchScenes, refetchInterval: 1500 });

  const sceneMut = useMutation({
    mutationFn: (key: string) => playScene(key),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scenes"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const stopMut = useMutation({
    mutationFn: stopScene,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scenes"] }),
  });

  const running = scenes.data?.running ?? null;
  const items = scenes.data?.scenes ?? [];

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Main column — Scenes */}
        <SceneGrid
          items={items}
          running={running}
          onPlay={(k) => sceneMut.mutate(k)}
          onStop={() => stopMut.mutate()}
        />

        {/* Sidebar — Spotlight / Atomic / Fog */}
        <aside className="space-y-3">
          <SpotlightCard />
          <AtomicCard />
          <FogCard />
        </aside>
      </div>

      {/* Sticky blackout dock */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-bg via-bg/85 to-transparent p-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
        <div className="pointer-events-auto mx-auto flex max-w-[1100px] items-center gap-3">
          {running && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-surface/85 px-3 py-2 shadow-soft backdrop-blur"
            >
              <span className="size-2 shrink-0 rounded-full bg-accent shadow-[0_0_10px_rgba(124,146,255,0.7)] animate-pulse" />
              <span className="truncate text-xs text-mutedFg">
                Now playing — <span className="text-text">{running.replace(/^pattern:/, "♪ ")}</span>
              </span>
            </motion.div>
          )}
          <Button
            variant="danger"
            size="lg"
            onClick={() => {
              blackout();
              toast("Blackout");
            }}
            className="ml-auto min-w-[170px] flex-shrink-0"
          >
            <Power className="size-4" /> BLACKOUT
          </Button>
        </div>
      </div>
    </>
  );
}

// ----- Sidebar cards -----

function SpotlightCard() {
  const qc = useQueryClient();
  const { state } = useLiveState();
  const isOn = state.spotlight > 0;
  const onMut = useMutation({ mutationFn: spotlightOn, onSuccess: () => qc.invalidateQueries({ queryKey: ["live"] }) });
  const offMut = useMutation({ mutationFn: spotlightOff, onSuccess: () => qc.invalidateQueries({ queryKey: ["live"] }) });

  return (
    <Card className="!bg-gradient-to-br !from-[#2a2010] !to-[#1a140a] !border-[#5a4218]">
      <CardHeader
        title={<span className="flex items-center gap-2"><Lightbulb className="size-3" />Spotlight</span>}
      />
      <CardBody className="!pt-1">
        <button
          onClick={() => (isOn ? offMut.mutate() : onMut.mutate())}
          className={cn(
            "flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 transition",
            isOn
              ? "border-warn bg-warn/15 text-warn shadow-[0_0_24px_rgba(255,168,77,0.25)]"
              : "border-line bg-surface2 text-mutedFg hover:text-text",
          )}
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            {isOn ? <Lightbulb className="size-4 fill-current" /> : <LightbulbOff className="size-4" />}
            {isOn ? "ON" : "OFF"}
          </span>
          <span className="text-[10px] uppercase tracking-[0.12em] opacity-70">tap to toggle</span>
        </button>
      </CardBody>
    </Card>
  );
}

function AtomicCard() {
  return (
    <Card className="!bg-gradient-to-br !from-[#2a1410] !to-[#150a08] !border-[#4a2418]">
      <CardHeader
        title={<span className="flex items-center gap-2"><Zap className="size-3" />Atomic</span>}
      />
      <CardBody className="!pt-1">
        <Tooltip content="Single short flash">
          <Button variant="atomicFire" onClick={atomicFlash} className="w-full">
            <Zap className="size-4" /> FLASH
          </Button>
        </Tooltip>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button variant="atomic" size="sm" onClick={atomicStrobeSlow}>
            <Waves className="size-3.5" /> Slow
          </Button>
          <Button variant="atomic" size="sm" onClick={atomicStrobeFast}>
            <Disc3 className="size-3.5" /> Fast
          </Button>
          <Button variant="atomic" size="sm" onClick={atomicLightning}>
            <Wand2 className="size-3.5" /> Light
          </Button>
          <Button variant="atomic" size="sm" onClick={atomicOff}>
            <ZapOff className="size-3.5" /> Off
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function FogCard() {
  const [fog, setFog] = useState(0);
  const sendFog = throttle((v: number) => fogLevel(v).catch((e) => toast.error(e.message)), 60);

  return (
    <Card className="!bg-gradient-to-br !from-[#10202c] !to-[#0a141d] !border-[#1f3548]">
      <CardHeader
        title={<span className="flex items-center gap-2"><Cloud className="size-3" />Fog</span>}
      />
      <CardBody className="!pt-1">
        <Field label={<>Level <span className="ml-1 text-mutedFg/70 normal-case tracking-normal">{fog}</span></>}>
          <Slider value={fog} onChange={(v) => { setFog(v); sendFog(v); }} />
        </Field>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            variant="fog"
            size="sm"
            onClick={() => { fogPuff().catch((e) => toast.error(e.message)); toast.success("Puff!"); }}
          >
            <Cloud className="size-3.5" /> PUFF (3s)
          </Button>
          <Button size="sm" onClick={() => { setFog(0); fogOff(); }}>
            <CircleSlash className="size-3.5" /> Off
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

// ----- Scene grid grouped by tempo -----

function SceneGrid({
  items, running, onPlay, onStop,
}: {
  items: SceneItem[];
  running: string | null;
  onPlay: (key: string) => void;
  onStop: () => void;
}) {
  const groups = TEMPO_ORDER.map((t) => ({
    tempo: t,
    items: items.filter((s) => s.tempo === t),
  })).filter((g) => g.items.length > 0);

  return (
    <Card>
      <CardHeader
        title={<span className="flex items-center gap-2"><Sun className="size-3" />Scenes</span>}
        subtitle="Tap to start; tap the running one to stop. Patterns appear at the bottom."
        action={
          running && (
            <Button size="sm" variant="ghost" onClick={onStop} className="!h-8 gap-1.5">
              <Power className="size-3.5" /> Stop
            </Button>
          )
        }
      />
      <CardBody className="space-y-5">
        {groups.map((g) => {
          const info = TEMPO_INFO[g.tempo];
          const Icon = info.icon;
          return (
            <div key={g.tempo}>
              <div className="mb-2 flex items-center gap-2">
                <Icon className={cn("size-3.5", info.accent)} strokeWidth={2.25} />
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text">
                  {info.label}
                </span>
                <span className="text-[11px] text-muted">{info.sub}</span>
                <span className="ml-auto text-[10px] tabular-nums text-muted">{g.items.length}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {g.items.map((s) => {
                  const active = running === s.key;
                  const isPattern = s.kind === "pattern";
                  return (
                    <motion.button
                      key={s.key}
                      layout
                      whileTap={{ scale: 0.97 }}
                      onClick={() => (active ? onStop() : onPlay(s.key))}
                      className={cn(
                        "group relative flex h-14 items-center justify-start gap-2 rounded-xl border px-3 text-sm transition",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                        active
                          ? "border-accent bg-accent text-black font-semibold shadow-glow"
                          : isPattern
                            ? "border-accent/40 bg-surface hover:bg-surface2 text-text"
                            : "border-line bg-surface hover:bg-surface2 text-text",
                      )}
                    >
                      {isPattern ? (
                        <Music2 className={cn("size-4 shrink-0", active ? "text-black" : "text-accent")} />
                      ) : (
                        <Icon className={cn("size-4 shrink-0", active ? "text-black" : info.accent)} strokeWidth={2.25} />
                      )}
                      <span className="truncate">{s.label}</span>
                      {active && (
                        <span className="absolute right-2 top-2 size-1.5 rounded-full bg-black/70 animate-pulse" />
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}
