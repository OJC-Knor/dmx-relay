import * as DM from "@radix-ui/react-dropdown-menu";
import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const DropdownMenu = DM.Root;
export const DropdownTrigger = DM.Trigger;

export function DropdownContent({
  children, className, align = "end", sideOffset = 6,
}: {
  children: ReactNode; className?: string; align?: "start" | "center" | "end"; sideOffset?: number;
}) {
  return (
    <DM.Portal>
      <DM.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-[12rem] rounded-xl border border-line bg-surface p-1 shadow-soft outline-none",
          "data-[state=open]:animate-scale-in",
          className,
        )}
      >
        {children}
      </DM.Content>
    </DM.Portal>
  );
}

export function DropdownItem({
  children, onSelect, className, danger,
}: {
  children: ReactNode;
  onSelect?: () => void;
  className?: string;
  danger?: boolean;
}) {
  return (
    <DM.Item
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer select-none items-center gap-2 rounded-md px-3 py-2 text-sm outline-none",
        "data-[highlighted]:bg-surface2 data-[highlighted]:text-text",
        danger ? "text-danger data-[highlighted]:text-danger" : "text-mutedFg data-[highlighted]:text-text",
        className,
      )}
    >
      {children}
    </DM.Item>
  );
}

export function DropdownSeparator() {
  return <DM.Separator className="my-1 h-px bg-line" />;
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return <DM.Label className="px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-muted">{children}</DM.Label>;
}
