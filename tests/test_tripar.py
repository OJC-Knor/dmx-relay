"""Test ALL 12 Tripars together."""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dmx import Universe
from fixtures import MegaTripar

PORT = "/dev/cu.usbserial-BG03CYC2"


def run(uni: Universe) -> None:
    tripars = [
        MegaTripar(start_address=1 + i * 6, name=f"Tripar {i + 1}")
        for i in range(12)
    ]
    uni.add(*tripars)
    for t in tripars:
        t.enable()

    print("Color cycle")
    for label, rgb in [
        ("RED",     (255, 0, 0)),
        ("GREEN",   (0, 255, 0)),
        ("BLUE",    (0, 0, 255)),
        ("YELLOW",  (255, 255, 0)),
        ("MAGENTA", (255, 0, 255)),
        ("CYAN",    (0, 255, 255)),
        ("WHITE",   (255, 255, 255)),
    ]:
        print(f"  -> {label}")
        for t in tripars:
            t.color(*rgb)
        time.sleep(1.5)

    print("Strobe (2s)")
    for t in tripars:
        t.color(255, 255, 255)
        t.strobe(200)
    time.sleep(2.0)

    print("Blackout")
    for t in tripars:
        t.off()
    time.sleep(0.5)


def main() -> int:
    with Universe(PORT) as uni:
        time.sleep(0.2)
        run(uni)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
