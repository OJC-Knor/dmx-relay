import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HexColorPicker } from "react-colorful";

import { Button } from "@/components/Button";
import { Section } from "@/components/Section";
import { Slider } from "@/components/Slider";
import { useToast } from "@/components/Toast";
import {
  atomicFlash, atomicLightning, atomicOff, atomicStrobeFast, atomicStrobeSlow,
  blackout, fetchScenes, fogLevel, fogOff, fogPuff, playScene, setAllColor, setAllDim, stopScene,
} from "@/lib/api";
import { useLiveState } from "@/lib/useLiveState";
import { cn, hexToRgb, throttle } from "@/lib/utils";

export default function Controls() {
  const toast = useToast();
  const qc = useQueryClient();
  const { state } = useLiveState();

  const scenes = useQuery({ queryKey: ["scenes"], queryFn: fetchScenes, refetchInterval: 2000 });

  const [color, setColor] = useState("#ffffff");
  const [white, setWhite] = useState(0);
  const [dim, setDim] = useState(255);
  const [fog, setFog] = useState(0);

  // throttle the API hits while dragging
  const sendColor = throttle((c: string, w: number) => {
    const { r, g, b } = hexToRgb(c);
    setAllColor({ r, g, b, w }).catch((e) => toast(String(e.message ?? e), "error"));
  }, 60);
  const sendDim = throttle((d: number) => {
    setAllDim(d).catch((e) => toast(String(e.message ?? e), "error"));
  }, 60);
  const sendFog = throttle((v: number) => {
    fogLevel(v).catch((e) => toast(String(e.message ?? e), "error"));
  }, 60);

  const sceneMut = useMutation({
    mutationFn: (key: string) => playScene(key),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scenes"] }),
    onError: (e: Error) => toast(String(e.message ?? e), "error"),
  });
  const stopMut = useMutation({
    mutationFn: stopScene,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scenes"] }),
  });

  const running = scenes.data?.running ?? null;
  const items = scenes.data?.scenes ?? [];

  return (
    <>
      <div className="-mt-3 mb-4 flex items-center gap-2 text-xs">
        <span className={cn(
          "h-2 w-2 rounded-full",
          running ? "bg-accent shadow-[0_0_8px] shadow-accent animate-pulse" : "bg-ok shadow-[0_0_8px] shadow-ok",
        )} />
        <span className="text-muted">{running ? `Running: ${running}` : "Ready"}</span>
      </div>

      {/* All Tripars */}
      <Section title="All Tripars">
        <div className="mb-3 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
          <div className="rounded-xl border border-line p-1">
            <HexColorPicker
              color={color}
              onChange={(c) => { setColor(c); sendColor(c, white); }}
              style={{ width: 200, height: 160 }}
            />
          </div>
          <div className="flex-1 space-y-3">
            <Row label="Hex" value={color}>
              <input
                type="text"
                value={color}
                onChange={(e) => { setColor(e.target.value); sendColor(e.target.value, white); }}
                className="w-28 rounded-lg border border-line bg-bg px-2 py-1.5 text-sm font-mono"
              />
            </Row>
            <Row label="White" value={white}>
              <Slider value={white} onChange={(v) => { setWhite(v); sendColor(color, v); }} />
            </Row>
            <Row label="Dimmer" value={dim}>
              <Slider value={dim} onChange={(v) => { setDim(v); sendDim(v); }} />
            </Row>
          </div>
        </div>
      </Section>

      {/* Atomic */}
      <Section
        title="Atomic"
        className="bg-gradient-to-br from-[#2a1410] to-[#1a0d0c] border-[#4a2418]"
      >
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
          <Button variant="atomic-fire" onClick={atomicFlash}>FLASH</Button>
          <Button variant="atomic" onClick={atomicStrobeSlow}>Slow strobe</Button>
          <Button variant="atomic" onClick={atomicStrobeFast}>Fast strobe</Button>
          <Button variant="atomic" onClick={atomicLightning}>Lightning</Button>
          <Button variant="atomic" onClick={atomicOff}>Off</Button>
        </div>
        <div className="mt-2 text-[11px] text-muted">
          Live intensity: {state.atomic?.intensity ?? 0}
        </div>
      </Section>

      {/* Fog */}
      <Section
        title="Fog"
        className="bg-gradient-to-br from-[#14202a] to-[#0d1118] border-[#1f3548]"
      >
        <Row label="Level" value={fog}>
          <Slider value={fog} onChange={(v) => { setFog(v); sendFog(v); }} />
        </Row>
        <div className="mt-2 grid grid-cols-2 gap-2.5">
          <Button
            variant="fog"
            onClick={() => { fogPuff().catch((e) => toast(e.message, "error")); }}
          >
            PUFF (3s)
          </Button>
          <Button onClick={() => { setFog(0); fogOff(); }}>Off</Button>
        </div>
      </Section>

      {/* Scenes */}
      <Section
        title="Scenes"
        hint="tap to start, tap running to stop"
      >
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {items.map((s) => {
            const active = running === s.key;
            return (
              <Button
                key={s.key}
                variant={active ? "primary" : "default"}
                onClick={() => (active ? stopMut.mutate() : sceneMut.mutate(s.key))}
                title={s.kind === "pattern" ? "Saved pattern" : "Built-in scene"}
                className={cn(
                  s.kind === "pattern" && !active && "border-accent/40",
                )}
              >
                {s.kind === "pattern" ? <span className="opacity-70 mr-1">♪</span> : null}
                {s.label}
              </Button>
            );
          })}
        </div>
      </Section>

      {/* Sticky blackout bar */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 bg-gradient-to-t from-bg to-transparent p-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
        <div className="mx-auto max-w-[760px]">
          <Button
            variant="danger"
            onClick={() => { blackout(); setColor("#000000"); setDim(0); setFog(0); }}
            className="pointer-events-auto w-full"
          >
            BLACKOUT
          </Button>
        </div>
      </div>
    </>
  );
}

function Row({ label, value, children }: { label: string; value: string | number; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <label className="w-16 text-sm text-muted">{label}</label>
      {children}
      <span className="w-12 text-right text-xs tabular-nums text-muted">{value}</span>
    </div>
  );
}
