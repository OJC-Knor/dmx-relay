import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  title?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function Section({ title, hint, children, className }: Props) {
  return (
    <section className={cn("mb-3 rounded-2xl border border-line bg-surface px-5 py-4", className)}>
      {title && (
        <h2 className="mb-3 flex items-baseline justify-between text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          <span>{title}</span>
          {hint && <span className="text-[11px] font-normal normal-case tracking-normal text-muted/80">{hint}</span>}
        </h2>
      )}
      {children}
    </section>
  );
}
