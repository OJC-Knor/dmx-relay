"""Test ALL three MS Zoom 250 XT heads ("Groot") together."""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dmx import Universe
from fixtures import MSZoom250

PORT = "/dev/cu.usbserial-BG03CYC2"
ADDRESSES = [182, 198, 214]


def run(uni: Universe) -> None:
    heads = [
        MSZoom250(start_address=addr, name=f"Groot {i + 1}")
        for i, addr in enumerate(ADDRESSES)
    ]
    uni.add(*heads)

    print("Home")
    for h in heads:
        h.home()
        h._set("speed", 200)
    time.sleep(2.5)

    print("Pan/Tilt sweep")
    for pan, tilt in [(64, 64), (192, 64), (192, 192), (64, 192), (128, 128)]:
        for h in heads:
            h.position(pan, tilt)
        time.sleep(1.5)

    print("Color wheel")
    for c in ["blue", "red", "green", "yellow", "magenta", "cyan", "white"]:
        for h in heads:
            h.color(c)
        time.sleep(1.0)

    print("Zoom angles")
    for z in [15, 21, 26, 18]:
        for h in heads:
            h.zoom(z)
        time.sleep(1.0)

    print("Strobe (2s)")
    for h in heads:
        h.shutter("strobe")
    time.sleep(2.0)

    print("Blackout")
    for h in heads:
        h.blackout()
    time.sleep(0.5)


def main() -> int:
    with Universe(PORT) as uni:
        time.sleep(0.2)
        run(uni)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
