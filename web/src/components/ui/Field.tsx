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
    <div className={cn("flex flex-col gap-1", className)}>
      {label && (
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted">
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
        "h-9 rounded-key border border-line2 bg-black px-2.5 text-sm text-text",
        "placeholder:text-muted/60 outline-none transition",
        "focus:border-accent",
        className,
      )}
    />
  );
}
