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
        "inline-flex rounded-full border border-line bg-surface2 p-1 text-xs",
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
        "rounded-full px-4 py-1.5 text-mutedFg transition-colors",
        "data-[state=on]:bg-accent data-[state=on]:font-semibold data-[state=on]:text-black",
        "hover:text-text",
        className,
      )}
    >
      {children}
    </TG.Item>
  );
}
