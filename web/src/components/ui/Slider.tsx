import * as RS from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

type Props = {
  value: number;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;   // pointer released / key up
  min?: number;
  max?: number;
  step?: number;
  colour?: string;                  // fill colour of the travelled part
  className?: string;
  trackClassName?: string;
};

// Console fader: thin track with quarter ticks and a rectangular cap.
export function Slider({
  value, onChange, onCommit, min = 0, max = 255, step = 1, colour = "#7c92ff", className, trackClassName,
}: Props) {
  return (
    <RS.Root
      className={cn("relative flex h-8 flex-1 touch-none select-none items-center", className)}
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={(v) => onChange(v[0])}
      onValueCommit={onCommit && ((v) => onCommit(v[0]))}
    >
      <RS.Track className={cn("relative h-[6px] grow rounded-[1px] bg-surface3", trackClassName)}>
        <RS.Range className="absolute h-full rounded-[1px]" style={{ background: colour }} />
        {[0.25, 0.5, 0.75].map((t) => (
          <span key={t} className="absolute top-[-4px] h-[14px] w-px bg-[#33333a]" style={{ left: `${t * 100}%` }} />
        ))}
      </RS.Track>
      <RS.Thumb
        aria-label="value"
        className="block h-7 w-4 rounded-[3px] border border-[#55555f] bg-gradient-to-b from-[#3a3a42] to-[#1c1c21]
                   shadow-md outline-none focus-visible:ring-1 focus-visible:ring-accent
                   after:absolute after:inset-x-0 after:top-1/2 after:h-px after:bg-white/80 after:content-['']"
      />
    </RS.Root>
  );
}
