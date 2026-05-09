import * as RS from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

type Props = {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
};

export function Slider({ value, onChange, min = 0, max = 255, step = 1, className }: Props) {
  return (
    <RS.Root
      className={cn("relative flex h-8 flex-1 touch-none select-none items-center", className)}
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={(v) => onChange(v[0])}
    >
      <RS.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-surface2">
        <RS.Range className="absolute h-full bg-text" />
      </RS.Track>
      <RS.Thumb
        className="block h-5 w-5 rounded-full bg-text shadow-md outline-none ring-accent transition focus-visible:ring-2"
        aria-label="value"
      />
    </RS.Root>
  );
}
