import * as P from "@radix-ui/react-popover";
import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;

export function PopoverContent({
  children, className, align = "start", sideOffset = 8,
}: {
  children: ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
  sideOffset?: number;
}) {
  return (
    <P.Portal>
      <P.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 rounded-xl border border-line bg-surface p-3 shadow-soft outline-none",
          "data-[state=open]:animate-scale-in data-[state=closed]:animate-fade-in",
          className,
        )}
      >
        {children}
      </P.Content>
    </P.Portal>
  );
}
