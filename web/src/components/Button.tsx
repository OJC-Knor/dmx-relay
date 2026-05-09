import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "primary" | "danger" | "atomic" | "atomic-fire" | "fog";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

const STYLES: Record<Variant, string> = {
  default:
    "bg-surface2 border-line text-text hover:bg-[#2a2a32]",
  primary:
    "bg-accent border-accent text-black font-semibold hover:opacity-90",
  danger:
    "bg-gradient-to-b from-danger to-[#c93750] border-danger text-white font-bold shadow-[0_8px_24px_rgba(255,77,106,0.25)] hover:from-[#ff5c75] hover:to-[#d23e58]",
  atomic:
    "bg-gradient-to-b from-[#3a1f18] to-[#2a1612] border-[#5a2c20] text-text hover:from-[#4a2820] hover:to-[#3a1c18]",
  "atomic-fire":
    "bg-gradient-to-b from-warn to-[#d97a2c] border-warn text-[#1a0d04] font-bold",
  fog:
    "bg-gradient-to-b from-[#2c4860] to-[#1a2c40] border-[#3a6080] text-[#cfe4f5] font-bold",
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { className, variant = "default", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      {...rest}
      className={cn(
        "inline-flex min-h-[44px] items-center justify-center rounded-xl border px-3 py-2 text-sm",
        "transition active:translate-y-px",
        "[-webkit-tap-highlight-color:transparent]",
        STYLES[variant],
        className,
      )}
    />
  );
});
