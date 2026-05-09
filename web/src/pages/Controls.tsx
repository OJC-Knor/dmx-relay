import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HexColorPicker } from "react-colorful";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  CircleSlash, Cloud, Disc3, Music2, Palette, Power, Sun, Wand2, Waves, Zap, ZapOff,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";
import { Slider } from "@/components/ui/Slider";
import { Tooltip } from "@/components/ui/Tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import {
  atomicFlash, atomicLightning, atomicOff, atomicStrobeFast, atomicStrobeSlow,
  blackout, fetchScenes, fogLevel, fogOff, fogPuff, playScene, setAllColor, setAllDim, stopScene,
} from "@/lib/api";
import { cn, hexToRgb, throttle } from "@/lib/utils";

export default function Controls() {
  const qc = useQueryClient();
  const scenes = useQuery({ queryKey: ["scenes"], queryFn: fetchScenes, refetchInterval: 1500 });

  const [color, setColor] = useState("#ffffff");
  const [white, setWhite] = useState(0);
  const [dim, setDim] = useState(255);
  const [fog, setFog] = useState(0);

  const sendColor = throttle((c: string, w: number) => {
    const { r, g, b } = hexToRgb(c);
    setAllColor({ r, g, b, w }).catch((e) => toast.error(e.message));
  }, 60);
  const sendDim = throttle((d: number) => {
    setAllDim(d).catch((e) => toast.error(e.message));
  }, 60);
  const sendFog = throttle((v: number) => {
    fogLevel(v).catch((e) => toast.error(e.message));
  }, 60);

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
    <div className="space-y-4">
      {/* Hero — colour control */}
      <Card>
        <CardHeader
          title={<span className="flex items-center gap-2"><Palette className="size-3" />Tripars</span>}
          subtitle="Master colour, white channel and dimmer for all 12 Tripars"
        />
        <CardBody>
          <div className="flex flex-col gap-5 md:flex-row md:items-stretch">
            {/* preview + picker popover */}
            <div className="flex flex-1 items-center gap-4">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className="size-24 shrink-0 rounded-2xl border border-line shadow-soft transition hover:scale-105 active:scale-100"
                    style={{ background: color, boxShadow: `0 0 32px -4px ${color}88` }}
                    aria-label="Pick colour"
                  />
                </PopoverTrigger>
                <PopoverContent className="!p-3" align="start">
                  <HexColorPicker
                    color={color}
                    onChange={(c) => { setColor(c); sendColor(c, white); }}
                    style={{ width: 220, height: 180 }}
                  />
                  <div className="mt-3">
                    <Input
                      value={color}
                      onChange={(e) => {
                        const v = e.target.value;
                        setColor(v);
                        if (/^#[0-9a-fA-F]{6}$/.test(v)) sendColor(v, white);
                      }}
                      className="w-full font-mono text-center"
                    />
                  </div>
                </PopoverContent>
              </Popover>

              <div className="flex flex-1 flex-col gap-3">
                <Field label="White">
                  <div className="flex items-center gap-3">
                    <Slider value={white} onChange={(v) => { setWhite(v); sendColor(color, v); }} />
                    <span className="w-10 text-right text-xs tabular-nums text-mutedFg">{white}</span>
                  </div>
                </Field>
                <Field label="Dimmer">
                  <div className="flex items-center gap-3">
                    <Slider value={dim} onChange={(v) => { setDim(v); sendDim(v); }} />
                    <span className="w-10 text-right text-xs tabular-nums text-mutedFg">{dim}</span>
                  </div>
                </Field>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Atomic */}
        <Card className="!bg-gradient-to-br !from-[#2a1410] !to-[#150a08] !border-[#4a2418]">
          <CardHeader
            title={<span className="flex items-center gap-2"><Zap className="size-3" />Atomic</span>}
            subtitle="Strobe — fired manually, not scene-driven"
          />
          <CardBody>
            <div className="grid grid-cols-2 gap-2">
              <Tooltip content="Single short flash">
                <Button variant="atomicFire" onClick={atomicFlash} className="col-span-2">
                  <Zap className="size-4" /> FLASH
                </Button>
              </Tooltip>
              <Button variant="atomic" onClick={atomicStrobeSlow}>
                <Waves className="size-4" /> Slow
              </Button>
              <Button variant="atomic" onClick={atomicStrobeFast}>
                <Disc3 className="size-4" /> Fast
              </Button>
              <Button variant="atomic" onClick={atomicLightning}>
                <Wand2 className="size-4" /> Lightning
              </Button>
              <Button variant="atomic" onClick={atomicOff}>
                <ZapOff className="size-4" /> Off
              </Button>
            </div>
          </CardBody>
        </Card>

        {/* Fog */}
        <Card className="!bg-gradient-to-br !from-[#10202c] !to-[#0a141d] !border-[#1f3548]">
          <CardHeader
            title={<span className="flex items-center gap-2"><Cloud className="size-3" />Fog</span>}
            subtitle="Continuous level + a 3-second puff burst"
          />
          <CardBody>
            <Field label="Level">
              <div className="flex items-center gap-3">
                <Slider value={fog} onChange={(v) => { setFog(v); sendFog(v); }} />
                <span className="w-10 text-right text-xs tabular-nums text-mutedFg">{fog}</span>
              </div>
            </Field>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                variant="fog"
                onClick={() => { fogPuff().catch((e) => toast.error(e.message)); toast.success("Puff!"); }}
              >
                <Cloud className="size-4" /> PUFF (3s)
              </Button>
              <Button onClick={() => { setFog(0); fogOff(); }}>
                <CircleSlash className="size-4" /> Off
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Scenes */}
      <Card>
        <CardHeader
          title={<span className="flex items-center gap-2"><Sun className="size-3" />Scenes</span>}
          subtitle="Tap to start, tap the running one to stop"
          action={
            running && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => stopMut.mutate()}
                className="!h-8 gap-1.5"
              >
                <Power className="size-3.5" /> Stop scene
              </Button>
            )
          }
        />
        <CardBody>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {items.map((s) => {
              const active = running === s.key;
              const isPattern = s.kind === "pattern";
              return (
                <motion.button
                  key={s.key}
                  layout
                  whileTap={{ scale: 0.97 }}
                  onClick={() => (active ? stopMut.mutate() : sceneMut.mutate(s.key))}
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
                    <Sun className={cn("size-4 shrink-0", active ? "text-black" : "text-mutedFg group-hover:text-text")} />
                  )}
                  <span className="truncate">{s.label}</span>
                  {active && (
                    <span className="absolute right-2 top-2 size-1.5 rounded-full bg-black/70 animate-pulse" />
                  )}
                </motion.button>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {/* Sticky blackout dock */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-bg via-bg/85 to-transparent p-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
        <div className="pointer-events-auto mx-auto flex max-w-[1100px] items-center gap-3">
          <AnimatePresence>
            {running && (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-surface/85 px-3 py-2 shadow-soft backdrop-blur"
              >
                <span className="size-2 shrink-0 rounded-full bg-accent shadow-[0_0_10px_rgba(124,146,255,0.7)] animate-pulse" />
                <span className="truncate text-xs text-mutedFg">
                  Now playing — <span className="text-text">{running.replace(/^pattern:/, "♪ ")}</span>
                </span>
              </motion.div>
            )}
          </AnimatePresence>
          <Button
            variant="danger"
            size="lg"
            onClick={() => {
              blackout();
              setColor("#000000"); setDim(0); setFog(0);
              toast("Blackout");
            }}
            className="ml-auto min-w-[170px] flex-shrink-0"
          >
            <Power className="size-4" /> BLACKOUT
          </Button>
        </div>
      </div>
    </div>
  );
}
