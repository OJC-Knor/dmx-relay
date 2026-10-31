import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Console key: flat, hairline border, small uppercase label. A key is
// either unlit (dark, coloured text for its function) or lit (filled).
const button = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-key border font-semibold uppercase " +
  "tracking-[0.08em] transition-colors duration-75 active:brightness-125 " +
  "disabled:opacity-40 disabled:pointer-events-none " +
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent " +
  "whitespace-nowrap select-none touch-manipulation",
  {
    variants: {
      variant: {
        default:    "bg-surface2 border-line2 text-[#cfcfd6] hover:border-[#3a3a44]",
        primary:    "bg-accent border-accent text-black hover:bg-[#92a4ff]",
        ghost:      "border-transparent bg-transparent text-mutedFg hover:bg-surface2 hover:text-text",
        danger:     "bg-danger border-danger text-black hover:brightness-110",
        // function keys: unlit, coloured by what they drive
        atomic:     "bg-surface2 border-danger/40 text-[#ff8aa0] hover:border-danger/70",
        atomicFire: "bg-beat border-beat text-black",
        fog:        "bg-surface2 border-fog/50 text-fog hover:border-fog/80",
        outline:    "border-line2 bg-transparent text-[#cfcfd6] hover:bg-surface2",
      },
      size: {
        sm:   "h-8 px-2.5 text-[10px]",
        md:   "h-9 px-3 text-[11px]",
        lg:   "h-11 px-4 text-xs",
        icon: "h-9 w-9 p-0",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

type Props = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>;

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { className, variant, size, ...rest },
  ref,
) {
  return <button ref={ref} {...rest} className={cn(button({ variant, size }), className)} />;
});
