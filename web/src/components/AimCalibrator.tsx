// Aim calibration — steer each moving head onto the mirror ball and save
// its pan/tilt. Positions are 16-bit (coarse + fine channels): at 8-bit a
// single step is ~2° of pan, enough to miss a ball across the room.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { C, Key, Label, Led } from "@/components/console";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Switch } from "@/components/ui/Switch";
import { aimClear, aimJog, aimSave, fetchAim, fetchRig, playScene } from "@/lib/api";
import type { AimPos } from "@/lib/types";
import { throttle } from "@/lib/utils";

const TARGET = "ball";
const CENTRE: AimPos = { pan: 32768, tilt: 32768 };
const STEPS = { fine: 32, step: 256, coarse: 2048 };   // 256 = one coarse DMX step (~2° pan)
const fail = (e: Error) => toast.error(e.message);
const clamp = (v: number) => Math.max(0, Math.min(65535, Math.round(v)));

export function AimCalibrator() {
  const rig = useQuery({ queryKey: ["rig"], queryFn: fetchRig });
  const aim = useQuery({ queryKey: ["aim"], queryFn: fetchAim });
  const heads = (rig.data?.fixtures ?? []).filter((f) => f.type === "focus" || f.type === "groot");
  const saved = aim.data?.points?.[TARGET] ?? {};

  const [head, setHead] = useState<string | null>(null);
  const [pos, setPos] = useState<AimPos>(CENTRE);
  const [solo, setSolo] = useState(true);
  const posRef = useRef(pos);
  posRef.current = pos;

  const send = useMemo(
    () => throttle((h: string, p: AimPos, s: boolean) => aimJog(h, p.pan, p.tilt, s).catch(fail), 60),
    [],
  );

  const select = (id: string) => {
    const p = saved[id] ?? CENTRE;
    setHead(id);
    setPos(p);
    aimJog(id, p.pan, p.tilt, solo).catch(fail);
  };

  const move = useCallback((p: AimPos) => {
    const next = { pan: clamp(p.pan), tilt: clamp(p.tilt) };
    setPos(next);
    if (head) send(head, next, solo);
  }, [head, solo, send]);

  const nudge = useCallback((dPan: number, dTilt: number) => {
    const p = posRef.current;
    move({ pan: p.pan + dPan, tilt: p.tilt + dTilt });
  }, [move]);

  // Arrow keys nudge (Shift = coarse, Alt = fine) while a head is selected.
  useEffect(() => {
    if (!head) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return;
      const n = e.shiftKey ? STEPS.coarse : e.altKey ? STEPS.fine : STEPS.step;
      const d = { ArrowLeft: [-n, 0], ArrowRight: [n, 0], ArrowUp: [0, -n], ArrowDown: [0, n] }[e.key];
      if (!d) return;
      e.preventDefault();
      nudge(d[0], d[1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [head, nudge]);

  const save = async () => {
    if (!head) return;
    await aimSave(TARGET, head, pos.pan, pos.tilt).catch(fail);
    toast.success(`${label(head)} saved on the ball`);
  };
  const clear = async () => {
    if (!head) return;
    await aimClear(TARGET, head).catch(fail);
  };

  const label = (id: string) => heads.find((h) => h.id === id)?.label ?? id;
  const doneCount = heads.filter((h) => saved[h.id]).length;

  return (
    <Card>
      <CardHeader
        title="Aim · mirror ball"
        subtitle="Pick a head, drag its beam onto the ball, fine-tune, save"
        action={
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted">
            <Led on={doneCount === heads.length && heads.length > 0} colour={C.live} />
            {doneCount}/{heads.length} on the ball
          </span>
        }
      />
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {heads.map((h) => (
            <Key
              key={h.id}
              className="h-9 min-w-[52px] px-2"
              lit={head === h.id}
              colour={C.tick}
              onClick={() => select(h.id)}
              title={`Aim ${h.label}`}
            >
              <Led on={!!saved[h.id]} colour={head === h.id ? "#000" : C.live} />
              {h.label}
            </Key>
          ))}
          <label className="ml-auto flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-mutedFg"
                 title="Close the other heads so you can see which beam you're steering">
            Solo
            <Switch checked={solo} onCheckedChange={setSolo} />
          </label>
        </div>

        <XYPad pos={pos} saved={head ? saved[head] : undefined} disabled={!head} onMove={move} />

        <div className="grid gap-2 sm:grid-cols-2">
          <NudgeRow axis="Pan" value={pos.pan} disabled={!head} onNudge={(d) => nudge(d, 0)} minus="◀" plus="▶" />
          <NudgeRow axis="Tilt" value={pos.tilt} disabled={!head} onNudge={(d) => nudge(0, d)} minus="▲" plus="▼" />
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <Key className="h-10" lit={!!head} colour={C.live} onClick={save} title="Save this head's position on the ball">
            Save
          </Key>
          <Key className="h-10" onClick={clear} title="Forget this head's ball position">Clear</Key>
          <Key className="h-10" onClick={() => playScene("mirror_ball").catch(fail)} title="Run the Mirror ball scene">
            Test scene
          </Key>
        </div>
        <p className="text-[10px] text-muted">
          Keyboard: arrows nudge one step · Shift = coarse · Alt = fine. Steering a head stops the running scene.
        </p>
      </CardBody>
    </Card>
  );
}

function XYPad({
  pos, saved, disabled, onMove,
}: { pos: AimPos; saved?: AimPos; disabled: boolean; onMove: (p: AimPos) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const toPos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return {
      pan: ((e.clientX - r.left) / r.width) * 65535,
      tilt: ((e.clientY - r.top) / r.height) * 65535,
    };
  };
  const x = (pos.pan / 65535) * 100;
  const y = (pos.tilt / 65535) * 100;
  return (
    <div
      ref={ref}
      className={`relative h-48 w-full touch-none select-none overflow-hidden rounded-key border border-line2 bg-black ${disabled ? "opacity-40" : "cursor-crosshair"}`}
      style={{
        backgroundImage:
          "linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px)," +
          "linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)",
        backgroundSize: "12.5% 25%",
      }}
      onPointerDown={(e) => {
        if (disabled) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging.current = true;
        onMove(toPos(e));
      }}
      onPointerMove={(e) => { if (dragging.current) onMove(toPos(e)); }}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
    >
      <span className="absolute left-2 top-1.5"><Label>Pan ↔ · Tilt ↕</Label></span>
      {saved && (
        <span
          className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
          style={{ left: `${(saved.pan / 65535) * 100}%`, top: `${(saved.tilt / 65535) * 100}%`, borderColor: C.live }}
          title="Saved ball position"
        />
      )}
      <span className="absolute inset-y-0 w-px bg-accent/60" style={{ left: `${x}%` }} />
      <span className="absolute inset-x-0 h-px bg-accent/60" style={{ top: `${y}%` }} />
      <span className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_10px_rgba(124,146,255,0.9)]"
            style={{ left: `${x}%`, top: `${y}%` }} />
    </div>
  );
}

function NudgeRow({
  axis, value, disabled, onNudge, minus, plus,
}: { axis: string; value: number; disabled: boolean; onNudge: (d: number) => void; minus: string; plus: string }) {
  const k = (label: string, d: number, title: string) => (
    <Key className="h-9 px-0 font-mono text-[11px]" onClick={() => !disabled && onNudge(d)} title={title}>
      {label}
    </Key>
  );
  return (
    <div className="flex items-center gap-1.5">
      <Label className="w-8">{axis}</Label>
      <div className="grid flex-1 grid-cols-7 items-center gap-1">
        {k(`${minus}${minus}${minus}`, -STEPS.coarse, `${axis} coarse back`)}
        {k(`${minus}${minus}`, -STEPS.step, `${axis} one step back`)}
        {k(minus, -STEPS.fine, `${axis} fine back`)}
        <span className="text-center font-mono text-[11px] tabular-nums text-text">{value}</span>
        {k(plus, STEPS.fine, `${axis} fine forward`)}
        {k(`${plus}${plus}`, STEPS.step, `${axis} one step forward`)}
        {k(`${plus}${plus}${plus}`, STEPS.coarse, `${axis} coarse forward`)}
      </div>
    </div>
  );
}
