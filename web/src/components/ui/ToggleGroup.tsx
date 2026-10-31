import * as TG from "@radix-ui/react-toggle-group";
import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ToggleGroup({
  value, onValueChange, children, className,
}: {
  value: string;
  onValueChange: (v: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <TG.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onValueChange(v)}
      className={cn(
        "inline-flex gap-0.5 rounded-key border border-line bg-bg2 p-0.5",
        className,
      )}
    >
      {children}
    </TG.Root>
  );
}

export function ToggleItem({
  value, children, className,
}: { value: string; children: ReactNode; className?: string }) {
  return (
    <TG.Item
      value={value}
      className={cn(
        "rounded-[3px] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-mutedFg transition-colors",
        "data-[state=on]:bg-accent data-[state=on]:text-black",
        "hover:text-text data-[state=on]:hover:text-black",
        className,
      )}
    >
      {children}
    </TG.Item>
  );
}
