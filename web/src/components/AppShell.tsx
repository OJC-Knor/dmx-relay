import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Activity, AudioLines, Layers, LayoutGrid, Sparkles, Wifi, WifiOff,
} from "lucide-react";

import { fetchScenes } from "@/lib/api";
import { useLiveState } from "@/lib/useLiveState";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/",        label: "Controls", icon: AudioLines },
  { to: "/builder", label: "Builder",  icon: LayoutGrid },
  { to: "/viz",     label: "Viz",      icon: Sparkles   },
  { to: "/editor",  label: "Layout",   icon: Layers     },
];

export default function AppShell() {
  const loc = useLocation();
  const scenes = useQuery({ queryKey: ["scenes"], queryFn: fetchScenes, refetchInterval: 1500 });
  const { connected } = useLiveState();
  const running = scenes.data?.running ?? null;

  return (
    <div className="min-h-screen bg-bg">
      {/* atmospheric glow at top */}
      <div className="pointer-events-none fixed inset-x-0 top-0 h-72 bg-[radial-gradient(80%_50%_at_50%_0%,rgba(124,146,255,0.06),transparent_70%)]" />

      {/* top nav */}
      <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1100px] items-center gap-3 px-4 py-3">
          <BrandMark />
          <h1 className="hidden text-h2 sm:block">soos-lights</h1>

          <nav className="ml-auto flex gap-1 rounded-full border border-line bg-surface2 p-1">
            {tabs.map((t) => {
              const Icon = t.icon;
              return (
                <NavLink
                  key={t.to}
                  to={t.to}
                  end={t.to === "/"}
                  className={({ isActive }) =>
                    cn(
                      "group relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition",
                      isActive ? "text-black" : "text-mutedFg hover:text-text",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.span
                          layoutId="navIndicator"
                          className="absolute inset-0 rounded-full bg-text"
                          transition={{ type: "spring", stiffness: 400, damping: 32 }}
                        />
                      )}
                      <Icon className="relative z-10 size-3.5" strokeWidth={2.25} />
                      <span className="relative z-10 hidden font-medium sm:inline">{t.label}</span>
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>

          <StatusPill running={running} connected={connected} />
        </div>
      </header>

      {/* page */}
      <main className="mx-auto max-w-[1100px] px-4 pb-32 pt-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={loc.pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

function BrandMark() {
  return (
    <div
      className="grid size-9 place-items-center rounded-xl border border-line bg-gradient-to-br from-surface2 to-bg2 shadow-soft"
      aria-hidden
    >
      <div className="size-3 rounded-full bg-accent shadow-[0_0_18px_rgba(124,146,255,0.7)]" />
    </div>
  );
}

function StatusPill({ running, connected }: { running: string | null; connected: boolean }) {
  if (!connected) {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-danger/30 bg-danger/10 px-2.5 py-1 text-[11px] text-danger">
        <WifiOff className="size-3.5" />
        <span className="hidden sm:inline">offline</span>
      </div>
    );
  }
  if (running) {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[11px] text-accent">
        <Activity className="size-3.5 animate-pulse" />
        <span className="hidden max-w-[120px] truncate sm:inline">{running.replace(/^pattern:/, "♪ ")}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-line bg-surface2 px-2.5 py-1 text-[11px] text-mutedFg">
      <Wifi className="size-3.5 text-ok" />
      <span className="hidden sm:inline">ready</span>
    </div>
  );
}

