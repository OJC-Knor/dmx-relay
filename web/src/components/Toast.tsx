// Tiny toast system (no extra dependency). Wrap the app in <ToastProvider>
// and call useToast() from any component.

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Toast = { id: number; msg: string; kind?: "info" | "error" };
type Ctx = { show: (msg: string, kind?: "info" | "error") => void };

const ToastCtx = createContext<Ctx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((msg: string, kind: "info" | "error" = "info") => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts, { id, msg, kind }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 2200);
  }, []);

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed left-1/2 top-4 z-[100] flex -translate-x-1/2 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "rounded-lg border px-4 py-2 text-sm shadow-lg backdrop-blur",
              t.kind === "error"
                ? "border-danger bg-[#2a1418] text-[#ffb8c4]"
                : "border-line bg-surface2 text-text",
            )}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast outside <ToastProvider>");
  return ctx.show;
}
