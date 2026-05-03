"""Read state/layout.json and turn it into useful spatial groupings.

Scenes can ask for things like "Tripars around the crowd, sorted clockwise
from top" without hard-coding indices, so a scene survives a layout edit.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

LAYOUT_PATH = Path(__file__).parent / "state" / "layout.json"


def _load() -> dict[str, dict[str, float]]:
    if not LAYOUT_PATH.exists():
        return {}
    try:
        return json.loads(LAYOUT_PATH.read_text())
    except json.JSONDecodeError:
        return {}


def positions() -> dict[str, tuple[float, float]]:
    return {k: (v["x"], v["y"]) for k, v in _load().items() if "x" in v and "y" in v}


def tripar_groups() -> tuple[list[int], list[int]]:
    """Return (ring_indices, stage_indices) into the 12-tripar list.

    `stage` = the 4 tripars with the highest y (bottommost on screen),
    sorted left-to-right.

    `ring` = the other 8, sorted CLOCKWISE starting from the topmost.
    """
    pos = positions()
    indexed: list[tuple[int, float, float]] = []
    for i in range(12):
        p = pos.get(f"tripar-{i + 1}")
        if p:
            indexed.append((i, *p))

    if len(indexed) < 12:
        # layout missing or partial — fall back to numerical order
        return list(range(8)), list(range(8, 12))

    indexed.sort(key=lambda t: -t[2])      # by y descending
    stage_raw = indexed[:4]                # 4 bottommost = stage
    ring_raw = indexed[4:]                 # the other 8 = ring

    stage = sorted(stage_raw, key=lambda t: t[1])  # left to right

    cx = sum(t[1] for t in ring_raw) / len(ring_raw)
    cy = sum(t[2] for t in ring_raw) / len(ring_raw)

    def cw_angle(t: tuple[int, float, float]) -> float:
        # 0 at top, increasing clockwise (top -> right -> bottom -> left)
        a = math.atan2(t[1] - cx, -(t[2] - cy))
        return a if a >= 0 else a + 2 * math.pi

    ring = sorted(ring_raw, key=cw_angle)
    return [t[0] for t in ring], [t[0] for t in stage]


def head_order_lr(prefix: str, count: int) -> list[int]:
    """Return indices into a head list, sorted by saved x position (L→R).
    Falls back to natural order if layout is missing fixtures."""
    pos = positions()
    indexed = []
    for i in range(count):
        p = pos.get(f"{prefix}-{i + 1}")
        if p:
            indexed.append((i, p[0]))
    if len(indexed) < count:
        return list(range(count))
    indexed.sort(key=lambda t: t[1])
    return [i for i, _ in indexed]
