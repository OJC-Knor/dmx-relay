import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Console panel: flat, hairline border, no shadow or gradient.
export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function Card({ className, ...rest }, ref) {
    return (
      <div
        ref={ref}
        {...rest}
        className={cn("rounded-panel border border-line bg-surface", className)}
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
    <div className={cn("flex items-center justify-between gap-3 border-b border-line px-3 py-2", className)}>
      <div className="min-w-0">
        {title && (
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            {title}
          </h2>
        )}
        {subtitle && (
          <p className="mt-0.5 truncate text-[11px] text-muted/80">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cn("p-3", className)} />;
}
