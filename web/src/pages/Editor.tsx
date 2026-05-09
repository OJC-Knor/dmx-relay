import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Magnet, RotateCcw, Save } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Switch } from "@/components/ui/Switch";
import { Tooltip } from "@/components/ui/Tooltip";
import { fetchLayout, fetchRig, saveLayout } from "@/lib/api";
import type { FixtureMeta, LayoutPositions } from "@/lib/types";
import { cn } from "@/lib/utils";

const TYPE_LABEL: Record<FixtureMeta["type"], string> = {
  tripar: "Tripar", pinspot: "Pinspot", spotlight: "Spotlight",
  focus: "Focus Spot", groot: "Groot", atomic: "Atomic", fog: "Fog",
};

const TYPE_COLOR: Record<FixtureMeta["type"], string> = {
  tripar: "#5b9dff", pinspot: "#fde047", spotlight: "#fbbf24",
  focus: "#ffa64d", groot: "#b87cff", atomic: "#ff5070", fog: "#5fd6ff",
};

const TYPE_COUNT_FOR_LEGEND: FixtureMeta["type"][] = [
  "tripar", "pinspot", "spotlight", "atomic", "focus", "groot", "fog",
];

export default function Editor() {
  const qc = useQueryClient();
  const rig = useQuery({ queryKey: ["rig"], queryFn: fetchRig });
  const layout = useQuery({ queryKey: ["layout"], queryFn: fetchLayout });

  const [positions, setPositions] = useState<LayoutPositions>({});
  const [snap, setSnap] = useState(false);

  useEffect(() => { if (layout.data) setPositions(layout.data); }, [layout.data]);

  const save = useMutation({
    mutationFn: () => saveLayout(positions),
    onSuccess: () => {
      toast.success("Layout saved");
      qc.invalidateQueries({ queryKey: ["layout"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reset = useMutation({
    mutationFn: () => saveLayout({}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["layout"] }),
  });

  const applySnap = (v: number) => snap ? Math.round(v * 20) / 20 : v;

  return (
    <Card>
      <CardHeader
        title="Rig layout"
        subtitle="Drag fixtures to where they actually are. Geometry-aware scenes use this."
        action={
          <div className="flex items-center gap-2">
            <Tooltip content="Snap fixtures to a 5% grid while dragging">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-mutedFg">
                <Magnet className="size-3.5" /> Snap
                <Switch checked={snap} onCheckedChange={setSnap} />
              </label>
            </Tooltip>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { if (confirm("Reset layout to defaults?")) reset.mutate(); }}
            >
              <RotateCcw className="size-3.5" /> Reset
            </Button>
            <Button size="sm" variant="primary" onClick={() => save.mutate()}>
              <Save className="size-3.5" /> Save
            </Button>
          </div>
        }
      />
      <CardBody>
        <Stage snap={snap}>
          {(rig.data?.fixtures ?? []).map((f) => (
            <Draggable
              key={f.id}
              meta={f}
              position={positions[f.id] ?? { x: 0.5, y: 0.5 }}
              onMove={(p) =>
                setPositions((all) => ({
                  ...all,
                  [f.id]: { x: applySnap(p.x), y: applySnap(p.y) },
                }))
              }
            />
          ))}
        </Stage>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {TYPE_COUNT_FOR_LEGEND.map((t) => {
            const n = (rig.data?.fixtures ?? []).filter((f) => f.type === t).length;
            if (!n) return null;
            return (
              <Badge key={t} className="gap-2">
                <span className="size-2 rounded-full" style={{ background: TYPE_COLOR[t] }} />
                {TYPE_LABEL[t]} <span className="text-mutedFg/70">×{n}</span>
              </Badge>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}

function Stage({ children, snap }: { children: React.ReactNode; snap: boolean }) {
  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border border-line bg-bg2"
      style={{ aspectRatio: "16 / 10", touchAction: "none" }}
    >
      {/* gradient zones: blue near top (crowd), red near bottom (stage) */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_30%_at_50%_15%,rgba(124,146,255,0.05),transparent_70%),radial-gradient(ellipse_60%_30%_at_50%_95%,rgba(255,80,112,0.04),transparent_70%)]" />

      {/* CROWD zone */}
      <div
        className="pointer-events-none absolute rounded-full border border-dashed border-accent/30"
        style={{ left: "25%", top: "5%", width: "50%", height: "18%" }}
      >
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[9px] tracking-[0.3em] text-accent/60">CROWD</span>
      </div>
      {/* STAGE zone */}
      <div
        className="pointer-events-none absolute rounded-lg border border-dashed border-[#ff7878]/30"
        style={{ left: "4%", right: "4%", bottom: "2%", height: "22%" }}
      >
        <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-[9px] tracking-[0.3em] text-[#ff7878]/60">STAGE</span>
      </div>

      {/* optional snap grid */}
      {snap && (
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "linear-gradient(to right, #2a2a32 1px, transparent 1px), linear-gradient(to bottom, #2a2a32 1px, transparent 1px)",
            backgroundSize: "5% 5%",
          }}
        />
      )}

      {children}
    </div>
  );
}

function Draggable({
  meta, position, onMove,
}: {
  meta: FixtureMeta;
  position: { x: number; y: number };
  onMove: (p: { x: number; y: number }) => void;
}) {
  const dragOffset = useRef<{ dx: number; dy: number } | null>(null);
  const [hover, setHover] = useState(false);

  return (
    <motion.div
      layout
      data-id={meta.id}
      onPointerDown={(e) => {
        e.preventDefault();
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        const r = el.getBoundingClientRect();
        dragOffset.current = {
          dx: e.clientX - (r.left + r.width / 2),
          dy: e.clientY - (r.top + r.height / 2),
        };
      }}
      onPointerMove={(e) => {
        if (!dragOffset.current) return;
        const stage = e.currentTarget.parentElement!.getBoundingClientRect();
        const x = (e.clientX - dragOffset.current.dx - stage.left) / stage.width;
        const y = (e.clientY - dragOffset.current.dy - stage.top) / stage.height;
        onMove({
          x: Math.max(0.02, Math.min(0.98, x)),
          y: Math.max(0.02, Math.min(0.98, y)),
        });
      }}
      onPointerUp={() => (dragOffset.current = null)}
      onPointerCancel={() => (dragOffset.current = null)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={cn(
        "absolute -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none select-none",
        "active:cursor-grabbing transition-transform active:scale-110",
      )}
      style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%` }}
    >
      <FixtureMark type={meta.type} label={meta.label} />
      {hover && (
        <div className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-surface px-2 py-1 text-[10px] text-mutedFg shadow-soft">
          {meta.id} · DMX {meta.addr}
        </div>
      )}
    </motion.div>
  );
}

function FixtureMark({ type, label }: { type: FixtureMeta["type"]; label: string }) {
  const color = TYPE_COLOR[type];
  const dot = (
    <div
      className="grid h-7 w-7 place-items-center rounded-full text-[9px] font-bold text-black shadow-md"
      style={{ background: color, boxShadow: `0 0 0 2px ${color}33, 0 4px 12px ${color}66` }}
    >
      {label}
    </div>
  );
  if (type === "atomic") {
    // square
    return (
      <div className="grid h-8 w-8 place-items-center rounded-md text-[9px] font-bold text-white shadow-md"
           style={{ background: color, boxShadow: `0 0 0 2px ${color}33, 0 4px 12px ${color}66` }}>
        {label}
      </div>
    );
  }
  if (type === "focus" || type === "groot") {
    return (
      <div className="relative">
        <div
          className="grid h-8 w-8 place-items-center rounded-md text-[9px] font-bold text-black shadow-md"
          style={{ background: color, boxShadow: `0 0 0 2px ${color}33, 0 4px 12px ${color}66` }}
        >
          {label}
        </div>
        {/* small downward pointer to indicate it's a moving head */}
        <div
          className="absolute left-1/2 top-full size-2 -translate-x-1/2 rotate-45 border-b border-r border-white/20"
          style={{ background: color }}
        />
      </div>
    );
  }
  if (type === "spotlight") {
    return (
      <div className="rotate-45">
        <div
          className="grid h-7 w-7 place-items-center rounded-md text-[9px] font-bold text-black shadow-md -rotate-45"
          style={{ background: color, boxShadow: `0 0 0 2px ${color}33, 0 4px 12px ${color}66` }}
        >
          {label}
        </div>
      </div>
    );
  }
  if (type === "fog") {
    return (
      <div
        className="grid h-9 w-12 place-items-center rounded-[40%] text-[9px] font-bold text-black shadow-md"
        style={{ background: color, filter: "blur(0.3px)", boxShadow: `0 0 0 2px ${color}33, 0 4px 12px ${color}66` }}
      >
        {label}
      </div>
    );
  }
  if (type === "pinspot") {
    return (
      <div
        className="grid h-5 w-5 place-items-center rounded-full text-[8px] font-bold text-black"
        style={{ background: color, boxShadow: `0 0 0 2px ${color}44, 0 0 12px ${color}66` }}
      >
        {label}
      </div>
    );
  }
  return dot;
}
