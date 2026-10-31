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
        "relative h-5 w-9 cursor-pointer rounded-[4px] border border-line2 bg-surface3 transition-colors",
        "data-[state=checked]:bg-accent data-[state=checked]:border-accent",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
        className,
      )}
    >
      <S.Thumb className="block h-3.5 w-3.5 translate-x-[2px] rounded-[2px] bg-[#cfcfd6] transition-transform data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-black" />
    </S.Root>
  );
}
