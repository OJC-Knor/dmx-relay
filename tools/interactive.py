"""Interactive DMX channel poker.

Type `<channel> <value>` to set a single channel.
Type `<start>-<end> <value>` to set a range.
Type `all <value>` to set every channel.
Type `show` to print the current 512-channel state (only non-zero).
Type `q` / Ctrl-D to quit (blackout on exit).

Examples:
  > 67 255         # ch 67 to full
  > 80-83 255      # ch 80..83 all to full (Pinspots & Spotlight)
  > all 0          # blackout
"""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dmx import Universe

PORT = "/dev/cu.usbserial-BG03CYC2"


def parse(line: str) -> tuple[str, int, int, int] | None:
    """Return (action, start, end, value) or None on bad input."""
    parts = line.strip().split()
    if not parts:
        return None
    if parts[0] in ("q", "quit", "exit"):
        return ("quit", 0, 0, 0)
    if parts[0] == "show":
        return ("show", 0, 0, 0)
    if len(parts) != 2:
        print("usage: <ch> <value>  |  <start>-<end> <value>  |  all <value>")
        return None
    target, raw_value = parts
    try:
        value = int(raw_value)
    except ValueError:
        print(f"value must be 0..255, got {raw_value!r}")
        return None
    if not 0 <= value <= 255:
        print(f"value out of range: {value}")
        return None
    if target == "all":
        return ("range", 1, 512, value)
    if "-" in target:
        try:
            a, b = target.split("-", 1)
            start, end = int(a), int(b)
        except ValueError:
            print(f"bad range: {target!r}")
            return None
        if not (1 <= start <= end <= 512):
            print(f"range out of bounds: {start}-{end}")
            return None
        return ("range", start, end, value)
    try:
        ch = int(target)
    except ValueError:
        print(f"bad channel: {target!r}")
        return None
    if not 1 <= ch <= 512:
        print(f"channel out of range: {ch}")
        return None
    return ("range", ch, ch, value)


def main() -> int:
    uni = Universe(PORT)
    uni.start()
    time.sleep(0.2)
    print(f"Universe live on {PORT}. Type 'q' to quit.")
    print(__doc__.split("Examples:")[0].strip())
    state = bytearray(512)

    try:
        while True:
            try:
                line = input("> ")
            except EOFError:
                print()
                break
            if uni._error is not None:
                print(f"sender thread crashed: {uni._error!r}")
                break
            cmd = parse(line)
            if cmd is None:
                continue
            action, start, end, value = cmd
            if action == "quit":
                break
            if action == "show":
                hits = [(i + 1, v) for i, v in enumerate(state) if v]
                if not hits:
                    print("  (all channels 0)")
                else:
                    for ch, v in hits:
                        print(f"  ch {ch:3d} = {v}")
                continue
            # action == "range"
            for i in range(start - 1, end):
                state[i] = value
            uni.set_range(start, bytes([value] * (end - start + 1)))
            print(f"  ch {start}..{end} = {value}")
    finally:
        uni.stop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
