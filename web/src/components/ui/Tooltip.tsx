import * as T from "@radix-ui/react-tooltip";
import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <T.Provider delayDuration={300}>{children}</T.Provider>;
}

export function Tooltip({
  content, children, side = "top", className,
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          className={cn(
            "z-50 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs text-text shadow-soft",
            "data-[state=delayed-open]:animate-scale-in",
            className,
          )}
        >
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
