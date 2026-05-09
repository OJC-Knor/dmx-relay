import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function Card({ className, ...rest }, ref) {
    return (
      <div
        ref={ref}
        {...rest}
        className={cn(
          "rounded-2xl border border-line bg-surface shadow-soft",
          "bg-gradient-to-b from-surface to-surface2/40",
          className,
        )}
      />
    );
  },
);

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 px-5 pt-4 pb-2", className)}>
      <div className="min-w-0">
        {title && (
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            {title}
          </h2>
        )}
        {subtitle && (
          <p className="mt-0.5 text-xs text-mutedFg/80">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cn("px-5 pb-5 pt-2", className)} />;
}
