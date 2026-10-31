import { useQuery } from "@tanstack/react-query";
import { NavLink, Outlet } from "react-router-dom";
import { AudioLines, Disc3, Layers, LayoutGrid, Sparkles } from "lucide-react";

import { C, Led } from "@/components/console";
import { fetchScenes } from "@/lib/api";
import { useLiveInvalidation, useLiveState } from "@/lib/useLiveState";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/",        label: "Controls", icon: AudioLines },
  { to: "/vj",      label: "VJ",       icon: Disc3      },
  { to: "/builder", label: "Builder",  icon: LayoutGrid },
  { to: "/viz",     label: "Viz",      icon: Sparkles   },
  { to: "/editor",  label: "Layout",   icon: Layers     },
];

// Header is h-12 + 1px border = 49px; the VJ page sizes itself against that.
export default function AppShell() {
  const { state, connected } = useLiveState();
  useLiveInvalidation();

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-30 border-b border-line bg-black">
        <div className="mx-auto flex h-12 max-w-[1200px] items-center gap-2 px-3">
          <div className="flex items-center gap-2 pr-1">
            <span className="size-2.5 rounded-[2px] bg-accent shadow-[0_0_10px_rgba(124,146,255,0.8)]" aria-hidden />
            <span className="hidden font-mono text-[12px] font-bold uppercase tracking-[0.18em] md:inline">
              soos<span className="text-muted">·lights</span>
            </span>
          </div>

          <nav className="flex gap-0.5 rounded-key border border-line bg-bg2 p-0.5">
            {tabs.map((t) => {
              const Icon = t.icon;
              return (
                <NavLink
                  key={t.to}
                  to={t.to}
                  end={t.to === "/"}
                  title={t.label}
                  className={({ isActive }) =>
                    cn(
                      "flex h-8 items-center gap-1.5 rounded-[3px] px-2.5 text-[10px] font-semibold uppercase tracking-[0.1em]",
                      "transition-colors",
                      isActive ? "bg-surface3 text-white" : "text-muted hover:text-text",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon className={cn("size-3.5", isActive && "text-accent")} strokeWidth={2.25} />
                      <span className="hidden sm:inline">{t.label}</span>
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>

          <StatusStrip
            connected={connected}
            running={state.running_scene}
            bpm={state.vj?.clock.bpm ?? null}
          />
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-3 pb-24 pt-3">
        <Outlet />
      </main>
    </div>
  );
}

/** Right side of the bar: tempo, what's on air, link status — always visible. */
function StatusStrip({ connected, running, bpm }: { connected: boolean; running: string | null; bpm: number | null }) {
  const scenes = useQuery({ queryKey: ["scenes"], queryFn: fetchScenes });
  const label = running
    ? scenes.data?.scenes.find((s) => s.key === running)?.label ?? running.replace(/^pattern:/, "♪ ")
    : null;

  return (
    <div className="ml-auto flex min-w-0 items-center gap-3 font-mono text-[11px]">
      {bpm !== null && (
        <span className="hidden tabular-nums sm:inline" style={{ color: C.beat }} title="Tempo">
          {bpm.toFixed(1)}<span className="ml-1 text-[9px] text-muted">BPM</span>
        </span>
      )}
      {label && (
        <span className="hidden min-w-0 items-center gap-1.5 lg:flex" title="On air">
          <Led on colour={C.live} />
          <span className="max-w-[160px] truncate text-text">{label}</span>
        </span>
      )}
      <span
        className={cn("flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.14em]",
                      connected ? "text-muted" : "text-danger")}
        title={connected ? "Connected to the rig" : "No connection to the rig"}
      >
        <Led on colour={connected ? C.live : C.danger} blink={!connected} />
        <span className="hidden sm:inline">{connected ? "Online" : "Offline"}</span>
      </span>
    </div>
  );
}
