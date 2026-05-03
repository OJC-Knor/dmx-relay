"""Run every fixture-type test back to back on a single universe.

Order: tripars -> atomic -> focus spot two -> ms zoom 250 -> fog.
"""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dmx import Universe

from tests.test_atomic import run as run_atomic
from tests.test_focus_spot import run as run_focus_spot
from tests.test_fog import run as run_fog
from tests.test_ms_zoom import run as run_ms_zoom
from tests.test_tripar import run as run_tripar

from rig import PORT
GAP = 1.5  # seconds of blackout between tests


def main() -> int:
    with Universe(PORT) as uni:
        time.sleep(0.2)

        for name, fn in [
            ("Tripars",      run_tripar),
            ("Atomic",       run_atomic),
            ("Focus Spot",   run_focus_spot),
            ("MS Zoom 250",  run_ms_zoom),
            ("Fog",          lambda u: run_fog(u, seconds=4.0)),
        ]:
            print(f"\n========== {name} ==========")
            fn(uni)
            time.sleep(GAP)

        print("\nAll done. Blackout.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
