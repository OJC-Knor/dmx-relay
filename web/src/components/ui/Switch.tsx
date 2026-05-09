import * as S from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

export function Switch({
  checked, onCheckedChange, className,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  className?: string;
}) {
  return (
    <S.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      className={cn(
        "relative h-6 w-11 cursor-pointer rounded-full border border-line bg-surface3 transition-colors",
        "data-[state=checked]:bg-accent data-[state=checked]:border-accent",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        className,
      )}
    >
      <S.Thumb className="block h-4 w-4 translate-x-1 rounded-full bg-text shadow-md transition-transform data-[state=checked]:translate-x-6" />
    </S.Root>
  );
}
