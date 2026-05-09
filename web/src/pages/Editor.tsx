import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/Button";
import { Section } from "@/components/Section";
import { useToast } from "@/components/Toast";
import { fetchLayout, fetchRig, saveLayout } from "@/lib/api";
import type { FixtureMeta, LayoutPositions } from "@/lib/types";
import { cn } from "@/lib/utils";

const TYPE_BG: Record<FixtureMeta["type"], string> = {
  tripar:    "bg-tripar",
  pinspot:   "bg-yellow-300 text-black",
  spotlight: "bg-amber-500 text-black",
  focus:     "bg-focus text-[#1a0d04]",
  groot:     "bg-groot",
  atomic:    "bg-atomic",
  fog:       "bg-fog text-[#003040]",
};

export default function Editor() {
  const toast = useToast();
  const qc = useQueryClient();
  const rig = useQuery({ queryKey: ["rig"], queryFn: fetchRig });
  const layout = useQuery({ queryKey: ["layout"], queryFn: fetchLayout });

  const [positions, setPositions] = useState<LayoutPositions>({});
  useEffect(() => {
    if (layout.data) setPositions(layout.data);
  }, [layout.data]);

  const save = useMutation({
    mutationFn: () => saveLayout(positions),
    onSuccess: () => {
      toast("Saved");
      qc.invalidateQueries({ queryKey: ["layout"] });
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const reset = useMutation({
    mutationFn: () => saveLayout({}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["layout"] }),
  });

  return (
    <Section
      title="Rig layout"
      hint={
        <span className="flex gap-1.5">
          <Button onClick={() => { if (confirm("Reset layout?")) reset.mutate(); }} className="!min-h-0 !py-1.5 !px-3 !text-xs">Reset</Button>
          <Button variant="primary" onClick={() => save.mutate()} className="!min-h-0 !py-1.5 !px-3 !text-xs">Save</Button>
        </span>
      }
    >
      <Stage>
        {(rig.data?.fixtures ?? []).map((f) => (
          <Draggable
            key={f.id}
            id={f.id}
            position={positions[f.id] ?? { x: 0.5, y: 0.5 }}
            onMove={(p) => setPositions((all) => ({ ...all, [f.id]: p }))}
          >
            <div className={cn(
              "rounded-lg border border-white/15 px-2 py-1 text-xs font-semibold text-white shadow-md",
              TYPE_BG[f.type],
            )}>
              {f.label}
            </div>
          </Draggable>
        ))}
      </Stage>

      <Legend />
    </Section>
  );
}

// ----- Stage canvas -----

function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border border-line"
      style={{
        aspectRatio: "16 / 10",
        background:
          "linear-gradient(180deg, rgba(108,142,255,0.04) 0%, rgba(108,142,255,0) 30%, rgba(255,255,255,0) 55%, rgba(255,80,80,0.04) 85%, rgba(255,80,80,0.07) 100%), #0a0a0c",
        touchAction: "none",
      }}
    >
      {/* CROWD oval */}
      <div
        className="pointer-events-none absolute rounded-full border border-dashed border-accent/40"
        style={{
          left: "25%", top: "5%", width: "50%", height: "18%",
        }}
      >
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] tracking-[0.25em] text-accent/60">
          CROWD
        </span>
      </div>
      {/* STAGE strip */}
      <div
        className="pointer-events-none absolute rounded-lg border border-dashed border-[#ff7878]/40"
        style={{ left: "4%", right: "4%", bottom: "2%", height: "22%" }}
      >
        <span className="absolute left-1/2 bottom-1.5 -translate-x-1/2 text-[10px] tracking-[0.25em] text-[#ff7878]/60">
          STAGE
        </span>
      </div>
      {children}
    </div>
  );
}

// ----- Draggable fixture -----

function Draggable({
  id,
  position,
  onMove,
  children,
}: {
  id: string;
  position: { x: number; y: number };
  onMove: (p: { x: number; y: number }) => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const offset = useRef<{ dx: number; dy: number } | null>(null);

  return (
    <div
      ref={ref}
      data-id={id}
      className={cn(
        "absolute -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none select-none",
        "active:cursor-grabbing active:scale-105 transition-transform",
      )}
      style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%` }}
      onPointerDown={(e) => {
        e.preventDefault();
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        const r = el.getBoundingClientRect();
        offset.current = {
          dx: e.clientX - (r.left + r.width / 2),
          dy: e.clientY - (r.top + r.height / 2),
        };
      }}
      onPointerMove={(e) => {
        if (!offset.current) return;
        const stage = e.currentTarget.parentElement!.getBoundingClientRect();
        const x = (e.clientX - offset.current.dx - stage.left) / stage.width;
        const y = (e.clientY - offset.current.dy - stage.top) / stage.height;
        onMove({
          x: Math.max(0.02, Math.min(0.98, x)),
          y: Math.max(0.02, Math.min(0.98, y)),
        });
      }}
      onPointerUp={() => (offset.current = null)}
      onPointerCancel={() => (offset.current = null)}
    >
      {children}
    </div>
  );
}

function Legend() {
  const items: { label: string; cls: string }[] = [
    { label: "Tripar",            cls: "bg-tripar" },
    { label: "Pinspot",           cls: "bg-yellow-300" },
    { label: "Spotlight",         cls: "bg-amber-500" },
    { label: "Focus Spot",        cls: "bg-focus" },
    { label: "Groot (MS Zoom)",   cls: "bg-groot" },
    { label: "Atomic",            cls: "bg-atomic" },
    { label: "Fog",               cls: "bg-fog" },
  ];
  return (
    <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className={cn("inline-block h-3.5 w-3.5 rounded-sm border border-white/15", i.cls)} />
          {i.label}
        </span>
      ))}
    </div>
  );
}
