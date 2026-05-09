import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/",        label: "Controls" },
  { to: "/builder", label: "Builder" },
  { to: "/viz",     label: "Viz" },
  { to: "/editor",  label: "Layout" },
];

export default function Layout() {
  return (
    <div className="mx-auto max-w-[760px] px-4 pt-5 pb-32">
      <header className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">soos-lights</h1>
        <nav className="flex gap-1 rounded-xl border border-line bg-surface p-1 text-xs">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === "/"}
              className={({ isActive }) =>
                cn(
                  "rounded-lg px-3 py-1.5 transition",
                  isActive
                    ? "bg-accent text-black font-semibold"
                    : "text-muted hover:text-text",
                )
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <Outlet />
    </div>
  );
}
