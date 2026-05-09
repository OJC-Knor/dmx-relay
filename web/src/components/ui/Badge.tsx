import { type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badge = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
  {
    variants: {
      tone: {
        default:  "border border-line bg-surface2 text-mutedFg",
        accent:   "border border-accent/40 bg-accent/15 text-accent",
        ok:       "border border-ok/40 bg-ok/15 text-ok",
        warn:     "border border-warn/40 bg-warn/15 text-warn",
        danger:   "border border-danger/40 bg-danger/15 text-danger",
      },
    },
    defaultVariants: { tone: "default" },
  },
);

type Props = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>;

export function Badge({ className, tone, ...rest }: Props) {
  return <span {...rest} className={cn(badge({ tone }), className)} />;
}
