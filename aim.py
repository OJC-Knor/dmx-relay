"""Aim points — calibrated pan/tilt per moving head for things in the room.

Each head hangs somewhere different, so "point at the mirror ball" means a
different pan/tilt for every head. The Layout page calibrates these live
and they're stored in state/aim.json (per install, so not in git):

    {"ball": {"focus-1": {"pan": 31012, "tilt": 18230}, ...}}

Values are 16-bit (0..65535) and go out on the coarse + fine channels.
"""

from __future__ import annotations

import json
from pathlib import Path

from rig import Rig

AIM_PATH = Path(__file__).parent / "state" / "aim.json"


def load() -> dict[str, dict[str, dict[str, int]]]:
    if not AIM_PATH.exists():
        return {}
    try:
        return json.loads(AIM_PATH.read_text())
    except json.JSONDecodeError:
        return {}


def save(points: dict[str, dict[str, dict[str, int]]]) -> None:
    AIM_PATH.parent.mkdir(parents=True, exist_ok=True)
    AIM_PATH.write_text(json.dumps(points, indent=2, sort_keys=True))


def heads(rig: Rig) -> dict[str, object]:
    """Moving heads by their layout id (focus-1…, groot-1…)."""
    out: dict[str, object] = {}
    for i, h in enumerate(rig.focus):
        out[f"focus-{i + 1}"] = h
    for i, h in enumerate(rig.groot):
        out[f"groot-{i + 1}"] = h
    return out


def beam_for_aiming(head) -> None:
    """Tight, bright, white beam that snaps straight to its position."""
    head.shutter("open")
    head.color("white")
    head.dim(255)
    if hasattr(head, "gobo"):
        head.gobo("open")                   # Focus Spot
    elif "gobo" in head.CHANNELS:
        head._set("gobo", 0)                # MS Zoom: 0 = open
    if hasattr(head, "prism"):
        head.prism(False)
    if hasattr(head, "zoom"):
        head.zoom(15)                       # narrowest beam on the MS Zoom
    for speed in ("pan_tilt_speed", "speed"):
        if speed in head.CHANNELS:
            head._set(speed, 0)             # 0 = fastest on both head types
