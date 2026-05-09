import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const button = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl border font-medium " +
  "transition active:translate-y-px disabled:opacity-50 disabled:pointer-events-none " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent " +
  "[-webkit-tap-highlight-color:transparent] whitespace-nowrap select-none",
  {
    variants: {
      variant: {
        default:
          "bg-surface2 border-line text-text hover:bg-surface3 hover:border-line2",
        primary:
          "bg-accent border-accent text-black font-semibold hover:bg-[#92a4ff] hover:border-[#92a4ff]",
        ghost:
          "border-transparent bg-transparent text-mutedFg hover:bg-surface2 hover:text-text",
        danger:
          "bg-gradient-to-b from-danger to-[#cc3a55] border-danger text-white font-semibold " +
          "shadow-[0_8px_24px_-8px_rgba(255,80,112,0.6)] hover:from-[#ff6783] hover:to-[#d84764]",
        atomic:
          "bg-gradient-to-b from-[#3a1f18] to-[#2a1612] border-[#5a2c20] text-text " +
          "hover:from-[#4a2820] hover:to-[#3a1c18]",
        atomicFire:
          "bg-gradient-to-b from-warn to-[#d97a2c] border-warn text-[#1a0d04] font-bold " +
          "shadow-[0_4px_18px_-6px_rgba(255,168,77,0.6)]",
        fog:
          "bg-gradient-to-b from-[#2c4860] to-[#1a2c40] border-[#3a6080] text-[#cfe4f5] font-bold",
        outline:
          "border-line bg-transparent text-text hover:bg-surface2",
      },
      size: {
        sm:   "h-8 px-3 text-xs",
        md:   "h-10 px-4 text-sm",
        lg:   "h-12 px-5 text-base",
        icon: "h-10 w-10 p-0",
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
