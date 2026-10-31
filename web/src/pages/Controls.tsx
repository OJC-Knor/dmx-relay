// Controls — the desk view: scene launcher on the left, fixture panels on
// the right, BLACKOUT in a fixed bottom bar.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { C, ClipPad, DECK_COLOURS, Key, Label, Led } from "@/components/console";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Slider } from "@/components/ui/Slider";
import {
  atomicFlash, atomicLightning, atomicOff, atomicStrobeFast, atomicStrobeSlow,
  blackout, fetchScenes, fogLevel, fogOff, fogPuff, playScene, spotlightOff, spotlightOn, stopScene,
} from "@/lib/api";
import type { SceneItem, Tempo } from "@/lib/types";
import { useLiveState } from "@/lib/useLiveState";
import { throttle } from "@/lib/utils";

const fail = (e: Error) => toast.error(e.message);

const TEMPO_INFO: Record<Tempo, { label: string; sub: string }> = {
  slow:    { label: "Slow",     sub: "atmospheric, ambient" },
  medium:  { label: "Medium",   sub: "groove, colour washes" },
  fast:    { label: "Fast",     sub: "energetic, dance" },
  insane:  { label: "Insane",   sub: "peak — strobes, chaos" },
  pattern: { label: "Patterns", sub: "your saved sequences" },
};
const TEMPO_ORDER: Tempo[] = ["slow", "medium", "fast", "insane", "pattern"];

export default function Controls() {
  const qc = useQueryClient();
  const scenes = useQuery({ queryKey: ["scenes"], queryFn: fetchScenes });
  const { state } = useLiveState();
  const running = state.running_scene;
  const items = scenes.data?.scenes ?? [];

  const sceneMut = useMutation({
    mutationFn: (key: string) => playScene(key),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scenes"] }),
    onError: fail,
  });
  const stopMut = useMutation({
    mutationFn: stopScene,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scenes"] }),
  });
  const runningLabel = items.find((s) => s.key === running)?.label ?? running?.replace(/^pattern:/, "♪ ");

  return (
    <>
      <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
        <SceneGrid
          items={items}
          running={running}
          onPlay={(k) => sceneMut.mutate(k)}
          onStop={() => stopMut.mutate()}
        />
        <aside className="space-y-3">
          <SpotlightPanel />
          <AtomicPanel />
          <FogPanel />
        </aside>
      </div>

      {/* Fixed bottom bar: what's on air + BLACKOUT */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-black/95 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-3 px-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Led on={!!running} colour={C.live} />
            <Label>On air</Label>
            <span className="truncate font-mono text-[12px] text-text">{runningLabel ?? "—"}</span>
          </div>
          <button
            onClick={() => { blackout().catch(fail); toast("Blackout"); }}
            className="h-11 min-w-[160px] shrink-0 rounded-key border border-danger bg-danger text-[12px] font-bold
                       uppercase tracking-[0.2em] text-black active:brightness-125"
          >
            Blackout
          </button>
        </div>
      </div>
    </>
  );
}

// ----- scene launcher -----

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
        title="Scenes"
        subtitle="Tap to start · tap the running one to stop"
        action={<Key className="h-8 px-3" onClick={onStop} title="Stop the running scene">Stop</Key>}
      />
      <CardBody className="space-y-4">
        {groups.map((g) => {
          const info = TEMPO_INFO[g.tempo];
          const colour = DECK_COLOURS[g.tempo];
          return (
            <section key={g.tempo}>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="h-3 w-[3px] rounded-full" style={{ background: colour }} />
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-text">{info.label}</span>
                <span className="text-[10px] text-muted">{info.sub}</span>
                <span className="ml-auto font-mono text-[10px] tabular-nums text-muted">{g.items.length}</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-4">
                {g.items.map((s) => (
                  <ClipPad
                    key={s.key}
                    item={s}
                    running={running === s.key}
                    onClick={() => (running === s.key ? onStop() : onPlay(s.key))}
                    className="h-14"
                  />
                ))}
              </div>
            </section>
          );
        })}
      </CardBody>
    </Card>
  );
}

// ----- fixture panels -----

function SpotlightPanel() {
  const qc = useQueryClient();
  const { state } = useLiveState();
  const isOn = state.spotlight > 0;
  const onMut = useMutation({ mutationFn: spotlightOn, onSuccess: () => qc.invalidateQueries({ queryKey: ["live"] }) });
  const offMut = useMutation({ mutationFn: spotlightOff, onSuccess: () => qc.invalidateQueries({ queryKey: ["live"] }) });

  return (
    <Card>
      <CardHeader title="Spotlight" action={<Led on={isOn} colour={C.beat} />} />
      <CardBody>
        <Key
          className="h-12 w-full justify-between px-3"
          lit={isOn}
          colour={C.beat}
          onClick={() => (isOn ? offMut.mutate() : onMut.mutate())}
          title="Toggle the spotlight"
        >
          <span className="text-[13px]">{isOn ? "On" : "Off"}</span>
          <span className="text-[9px] opacity-60">tap to toggle</span>
        </Key>
      </CardBody>
    </Card>
  );
}

function AtomicPanel() {
  const { state } = useLiveState();
  const a = state.atomic;
  const active = a.intensity > 5;
  const mode = !active ? "off" : a.effect >= 172 && a.effect <= 214 ? "lightning"
    : a.rate > 150 ? "fast" : a.rate > 5 ? "slow" : "flash";
  const k = (label: string, m: string, fn: () => Promise<unknown>, title: string) => (
    <Key className="h-9" lit={mode === m} colour={C.danger} onClick={() => fn().catch(fail)} title={title}>
      {label}
    </Key>
  );

  return (
    <Card>
      <CardHeader title="Atomic strobe" action={<Led on={active} colour={C.danger} blink={mode !== "off"} />} />
      <CardBody className="space-y-1.5">
        <Key className="h-12 w-full text-[13px]" lit colour={C.beat} onClick={() => atomicFlash().catch(fail)}
             title="Single short flash">
          Flash
        </Key>
        <div className="grid grid-cols-4 gap-1.5">
          {k("Slow", "slow", atomicStrobeSlow, "Slow strobe")}
          {k("Fast", "fast", atomicStrobeFast, "Fast strobe")}
          {k("Light", "lightning", atomicLightning, "Lightning effect")}
          <Key className="h-9" onClick={() => atomicOff().catch(fail)} title="Atomic off">Off</Key>
        </div>
      </CardBody>
    </Card>
  );
}

function FogPanel() {
  // Follow the server's slider level so every client shows the same value;
  // only while this user is dragging does the local value win.
  const { state } = useLiveState();
  const [dragging, setDragging] = useState<number | null>(null);
  const fog = dragging ?? state.fog_level;
  // Memoised: a fresh throttle per render throttles nothing, and the burst
  // of parallel requests can land out of order, leaving the fog short of 255.
  const sendFog = useMemo(() => throttle((v: number) => fogLevel(v).catch(fail), 60), []);
  const output = state.fog;

  return (
    <Card>
      <CardHeader
        title="Fog"
        action={
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted" title="Live output">
            <Led on={output > 0} colour="#5fd6ff" /> OUT {Math.round((output / 255) * 100)}%
          </span>
        }
      />
      <CardBody className="space-y-2">
        <div className="flex items-center gap-2">
          <Label className="w-8">Level</Label>
          <Slider
            value={fog}
            colour="#5fd6ff"
            onChange={(v) => { setDragging(v); sendFog(v); }}
            onCommit={(v) => { sendFog(v); setTimeout(() => setDragging(null), 250); }}
          />
          <span className="w-9 text-right font-mono text-xs tabular-nums">{Math.round((fog / 255) * 100)}</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <Key className="h-10" lit colour="#5fd6ff"
               onClick={() => { fogPuff().catch(fail); toast.success("Puff!"); }} title="Full fog for 3 seconds">
            Puff 3s
          </Key>
          <Key className="h-10" onClick={() => { setDragging(null); fogOff().catch(fail); }} title="Fog off">
            Off
          </Key>
        </div>
      </CardBody>
    </Card>
  );
}
