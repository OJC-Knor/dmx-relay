"""Test the Atomic 3000 strobe at DMX 100."""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dmx import Universe
from fixtures import Atomic

PORT = "/dev/cu.usbserial-BG03CYC2"


def run(uni: Universe) -> None:
    atomic = Atomic(start_address=100, name="Atomic")
    uni.add(atomic)

    print("Slow strobe (3s)")
    atomic.strobe(intensity=200, rate=80, duration=128)
    time.sleep(3.0)

    print("Fast strobe (3s)")
    atomic.strobe(intensity=200, rate=200, duration=80)
    time.sleep(3.0)

    print("Lightning effect (3s)")
    atomic.intensity(255)
    atomic.duration(128)
    atomic.rate(0)
    atomic.effect("lightning")
    time.sleep(3.0)

    print("Blackout")
    atomic.blackout()
    time.sleep(0.5)


def main() -> int:
    with Universe(PORT) as uni:
        time.sleep(0.2)
        run(uni)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
