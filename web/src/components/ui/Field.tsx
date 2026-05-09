import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Field({
  label, hint, children, className,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
          {label}
        </span>
      )}
      {children}
      {hint && <span className="text-[11px] text-mutedFg/70">{hint}</span>}
    </div>
  );
}

export function Input({
  className, ...rest
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={cn(
        "h-10 rounded-lg border border-line bg-bg2 px-3 text-sm text-text",
        "placeholder:text-muted/60 outline-none transition",
        "focus:border-accent focus:ring-2 focus:ring-accent/20",
        className,
      )}
    />
  );
}
