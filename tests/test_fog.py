"""Fog burst test — 5s at full power (shorter for test_all)."""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dmx import Universe
from fixtures import Fog

PORT = "/dev/cu.usbserial-BG03CYC2"


def run(uni: Universe, seconds: float = 5.0) -> None:
    fog = Fog(start_address=500)
    uni.add(fog)

    print(f"Fog -> 255 for {seconds}s")
    fog.output(255)
    time.sleep(seconds)

    print("Fog off")
    fog.output(0)
    time.sleep(1.0)


def main() -> int:
    with Universe(PORT) as uni:
        time.sleep(0.2)
        run(uni, seconds=15.0)  # longer when run standalone
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
