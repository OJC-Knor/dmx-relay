// Console building blocks shared by every page: LEDs, section labels,
// lit/unlit keys and clip-launcher scene pads. Conventions borrowed from
// lighting desks (grandMA, ChamSys) and clip launchers (Resolume): one
// colour per function, a small LED per key, filled only when active.
import type { ButtonHTMLAttributes, ReactNode } from "react";

import type { SceneItem, Tempo } from "@/lib/types";
import { cn } from "@/lib/utils";

export const C = {
  beat: "#ffb020",      // tempo / downbeat / master below full
  tick: "#7c92ff",      // other beats, selection
  live: "#38e08c",      // running
  danger: "#ff4d6a",
};

export const DECK_COLOURS: Record<Tempo, string> = {
  slow: "#3ec7e8", medium: "#7c92ff", fast: "#ff9b3d", insane: "#ff4d6a", pattern: "#38e08c",
};

export function Led({ on, colour = C.live, blink }: { on: boolean; colour?: string; blink?: boolean }) {
  return (
    <span
      className={cn("inline-block size-1.5 shrink-0 rounded-full", blink && on && "animate-pulse")}
      style={on ? { background: colour, boxShadow: `0 0 6px ${colour}` } : { background: "#2a2a31" }}
    />
  );
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("text-[9px] font-semibold uppercase tracking-[0.14em] text-muted", className)}>
      {children}
    </span>
  );
}

/** Flat console key. `lit` fills it with its function colour. */
export function Key({
  children, onClick, lit, colour = C.tick, className, title, ...pointer
}: {
  children: ReactNode; onClick?: () => void; lit?: boolean; colour?: string; className?: string; title?: string;
} & Pick<ButtonHTMLAttributes<HTMLButtonElement>,
  "onPointerDown" | "onPointerUp" | "onPointerCancel" | "onLostPointerCapture">) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      onContextMenu={(e) => e.preventDefault()}
      {...pointer}
      className={cn(
        "flex select-none items-center justify-center gap-1.5 rounded-key border text-[11px] font-semibold",
        "uppercase tracking-[0.08em] transition-colors duration-75 active:brightness-125 touch-manipulation",
        !lit && "border-line2 bg-surface2 text-[#cfcfd6]",
        className,
      )}
      style={lit ? { background: colour, borderColor: colour, color: "#0a0a0c" } : undefined}
    >
      {children}
    </button>
  );
}

/** Clip-launcher pad for a scene: tinted by its tempo deck, filled while running. */
export function ClipPad({
  item, running, queued, onClick, beatsToBar, barProgress, className,
}: {
  item: SceneItem; running: boolean; queued?: boolean; onClick: () => void;
  beatsToBar?: number; barProgress?: number; className?: string;
}) {
  const colour = DECK_COLOURS[item.tempo];
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex flex-col justify-between overflow-hidden rounded-key border px-2 py-1.5 text-left",
        "select-none active:brightness-125 touch-manipulation",
        queued && "animate-pulse",
        className,
      )}
      style={{
        background: running ? colour : `${colour}14`,
        borderColor: running || queued ? colour : `${colour}40`,
        color: running ? "#0a0a0c" : "#e6e6e9",
      }}
    >
      <span className="h-[3px] w-5 rounded-full" style={{ background: running ? "#0a0a0c" : colour }} />
      <span className="truncate text-[11px] font-semibold">
        {item.kind === "pattern" ? `♪ ${item.label}` : item.label}
      </span>
      {queued && beatsToBar !== undefined && (
        <span className="absolute right-1.5 top-1 font-mono text-[10px] font-bold" style={{ color: colour }}>
          {beatsToBar}
        </span>
      )}
      {running && barProgress !== undefined && (
        <span className="absolute inset-x-0 bottom-0 h-[3px] bg-black/25">
          <span className="block h-full bg-black/60 transition-[width] duration-100"
                style={{ width: `${barProgress * 100}%` }} />
        </span>
      )}
    </button>
  );
}
