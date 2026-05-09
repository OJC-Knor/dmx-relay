import * as RS from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

type Props = {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  trackClassName?: string;
};

export function Slider({
  value, onChange, min = 0, max = 255, step = 1, className, trackClassName,
}: Props) {
  return (
    <RS.Root
      className={cn("relative flex h-9 flex-1 touch-none select-none items-center", className)}
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={(v) => onChange(v[0])}
    >
      <RS.Track className={cn(
        "relative h-1.5 grow overflow-hidden rounded-full bg-surface3",
        trackClassName,
      )}>
        <RS.Range className="absolute h-full bg-text" />
      </RS.Track>
      <RS.Thumb
        className="block h-5 w-5 rounded-full bg-text shadow-md outline-none ring-accent
                   transition-transform focus-visible:ring-2 active:scale-110"
        aria-label="value"
      />
    </RS.Root>
  );
}
