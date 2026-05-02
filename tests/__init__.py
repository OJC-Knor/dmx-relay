"""Hardware smoke tests, runnable individually or via test_all."""

import sys
from pathlib import Path

# Allow `python tests/test_x.py` to import dmx / fixtures from project root.
_root = str(Path(__file__).resolve().parent.parent)
if _root not in sys.path:
    sys.path.insert(0, _root)
