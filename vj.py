"""VJ layer — live effects on top of whatever scene or pattern is running.

Scenes write fixture values as usual; just before each DMX frame goes out
the universe hands a copy of it to `VJ.apply`, which bends it: recolour,
beat flashes, chase, master dimmer, and the hold-to-fire buttons. The
scene never sees any of this, so turning an effect off restores it
exactly.

Hold buttons are dead-man switches: the phone re-sends the hold every
~200 ms while a finger is down and the hold expires on its own if those
stop (phone locked, Wi-Fi dropped). A strobe or blackout can never stick.
"""

from __future__ import annotations

import math
import threading
import time

from beat import BeatClock
from fixtures.focus_spot_two import COLORS as FOCUS_COLORS, SHUTTERS as FOCUS_SHUTTERS
from fixtures.ms_zoom_250 import COLORS as GROOT_COLORS, SHUTTERS as GROOT_SHUTTERS
from layout import tripar_groups
from rig import Rig

HOLD_TTL = 0.7          # seconds a hold stays on without a refresh
STROBE_HZ = 10.0
HOLDS = ("blinder", "strobe", "blackout", "fog")
EFFECTS = ("flash", "pulse", "chase", "colour_bar")
RATES = (0.25, 0.5, 1.0, 2.0, 4.0)

# Colour-per-bar cycle (r, g, b, w).
PALETTE: list[tuple[int, int, int, int]] = [
    (255, 0, 0, 0), (255, 90, 0, 0), (255, 220, 0, 0), (0, 255, 0, 0),
    (0, 220, 255, 0), (0, 0, 255, 0), (150, 0, 255, 0), (255, 0, 140, 0),
]


class VJ:
    def __init__(self, rig: Rig, clock: BeatClock) -> None:
        self.clock = clock
        self._lock = threading.Lock()
        self.effects = {name: False for name in EFFECTS}
        self.rate = 1.0
        self.colour: tuple[int, int, int, int] | None = None
        self.master = 255
        self.quantize = True        # scene pads switch on the next bar
        self._holds: dict[str, float] = {}   # name -> monotonic expiry

        # Absolute frame offsets (0-based) per fixture, so apply() works on raw bytes.
        def base(f) -> int:
            return f.start_address - 1

        self._tripars = [base(t) for t in rig.tripars]
        self._pinspots = [base(p) for p in rig.pinspots]
        self._spotlight = base(rig.spotlight)
        self._atomic = base(rig.atomic)
        self._fog = base(rig.fog)
        self._heads = []   # (dimmer, shutter, open, closed, strobe, colour, white)
        for h in rig.focus:
            c = h.CHANNELS
            self._heads.append((base(h) + c.index("dimmer"), base(h) + c.index("shutter"),
                                FOCUS_SHUTTERS["open"], FOCUS_SHUTTERS["closed"],
                                FOCUS_SHUTTERS["strobe"], base(h) + c.index("color"),
                                FOCUS_COLORS["white"]))
        for h in rig.groot:
            c = h.CHANNELS
            self._heads.append((base(h) + c.index("dimmer"), base(h) + c.index("shutter"),
                                GROOT_SHUTTERS["open"], GROOT_SHUTTERS["closed"],
                                GROOT_SHUTTERS["strobe"], base(h) + c.index("color"),
                                GROOT_COLORS["white"]))
        self._chase_order: list[int] = []
        self._chase_order_at = 0.0

    # ----- control -----

    def hold(self, name: str, on: bool) -> None:
        if name not in HOLDS:
            raise ValueError(f"unknown hold {name!r}; choose from {list(HOLDS)}")
        with self._lock:
            if on:
                self._holds[name] = time.monotonic() + HOLD_TTL
            else:
                self._holds.pop(name, None)

    def release_all(self) -> None:
        with self._lock:
            self._holds.clear()

    def configure(self, *, effects: dict[str, bool] | None = None, rate: float | None = None,
                  colour: tuple[int, int, int, int] | None | bool = False,
                  master: int | None = None, quantize: bool | None = None) -> None:
        """Update settings; `colour=False` means "leave unchanged", None clears it."""
        with self._lock:
            if effects:
                for k, v in effects.items():
                    if k not in EFFECTS:
                        raise ValueError(f"unknown effect {k!r}; choose from {list(EFFECTS)}")
                    self.effects[k] = bool(v)
            if rate is not None:
                if rate not in RATES:
                    raise ValueError(f"rate must be one of {RATES}")
                self.rate = rate
            if colour is not False:
                self.colour = None if colour is None else tuple(colour)  # type: ignore[arg-type]
            if master is not None:
                self.master = max(0, min(255, int(master)))
            if quantize is not None:
                self.quantize = quantize

    def active_holds(self, now: float | None = None) -> list[str]:
        now = time.monotonic() if now is None else now
        with self._lock:
            return [k for k, exp in self._holds.items() if exp > now]

    def snapshot(self) -> dict:
        with self._lock:
            return {
                "effects": dict(self.effects), "rate": self.rate,
                "colour": list(self.colour) if self.colour else None,
                "master": self.master, "quantize": self.quantize,
                "holds": [k for k, exp in self._holds.items() if exp > time.monotonic()],
            }

    # ----- output stage -----

    def _order(self, now: float) -> list[int]:
        # Ring clockwise then stage left-to-right; re-read the layout now and then.
        if now - self._chase_order_at > 5.0 or not self._chase_order:
            ring, stage = tripar_groups()
            self._chase_order = ring + stage
            self._chase_order_at = now
        return self._chase_order

    def apply(self, frame: bytearray) -> None:
        now = time.monotonic()
        with self._lock:
            effects = dict(self.effects)
            rate, colour, master = self.rate, self.colour, self.master
            holds = {k for k, exp in self._holds.items() if exp > now}

        beats = self.clock.beats(now) * rate
        phase = beats - math.floor(beats)          # 0 at each (scaled) beat
        tris = self._tripars

        # Scene brightness per tripar, 0..1 (strobe must be 255 for the light to be on)
        def level(o: int) -> float:
            if frame[o + 5] == 0:
                return 0.0
            return max(frame[o:o + 4]) / 255 * frame[o + 4] / 255

        if effects["colour_bar"]:
            colour = PALETTE[int(math.floor(beats / 4)) % len(PALETTE)]

        if colour or effects["chase"] or effects["flash"]:
            any_lit = any(level(o) > 0.02 for o in tris)
            for o in tris:
                if colour:
                    lv = level(o) if any_lit else 1.0
                    frame[o:o + 4] = bytes(colour)
                    frame[o + 4] = int(255 * lv)
                    frame[o + 5] = 255

            if effects["chase"]:
                order = self._order(now)
                step = int(math.floor(beats)) % 4
                for pos, i in enumerate(order):
                    o = tris[i]
                    if pos % 4 == step:
                        if level(o) < 0.05:     # nothing to show: light it up
                            frame[o:o + 4] = bytes(colour or (0, 0, 0, 255))
                            frame[o + 4] = 255
                            frame[o + 5] = 255
                    else:
                        frame[o + 4] = 0

            if effects["flash"]:
                f = math.exp(-phase * 12)
                if f > 0.02:
                    v = int(255 * f)
                    for o in tris:
                        for k in range(4):
                            frame[o + k] = max(frame[o + k], v)
                        frame[o + 4] = max(frame[o + 4], v)
                        frame[o + 5] = 255

        if effects["pulse"]:
            env = 0.15 + 0.85 * math.exp(-phase * 5)
            for o in tris:
                frame[o + 4] = int(frame[o + 4] * env)

        if master < 255:
            m = master / 255
            for o in tris:
                frame[o + 4] = int(frame[o + 4] * m)
            for d, *_ in self._heads:
                frame[d] = int(frame[d] * m)
            for o in self._pinspots:
                frame[o] = int(frame[o] * m)

        # ---- hold buttons: blinder < strobe < blackout ----
        if "blinder" in holds:
            for o in tris:
                frame[o:o + 6] = b"\xff\xff\xff\xff\xff\xff"
            for d, sh, opn, _cl, _st, col, white in self._heads:
                frame[d], frame[sh], frame[col] = 255, opn, white
            for o in self._pinspots:
                frame[o] = 255

        if "strobe" in holds:
            on = (now * STROBE_HZ) % 1.0 < 0.4
            for o in tris:
                frame[o:o + 6] = b"\xff\xff\xff\xff\xff\xff" if on else b"\x00\x00\x00\x00\x00\x00"
            for d, sh, _opn, _cl, st, col, white in self._heads:
                frame[d], frame[sh], frame[col] = 255, st, white
            a = self._atomic
            frame[a:a + 4] = bytes((255, 60, 220, 0))   # intensity, duration, rate, effect

        if "blackout" in holds:
            for o in tris:
                frame[o + 4] = 0
            for d, sh, _opn, cl, *_ in self._heads:
                frame[d], frame[sh] = 0, cl
            for o in self._pinspots:
                frame[o] = 0
            frame[self._spotlight] = 0
            frame[self._atomic] = 0

        if "fog" in holds:
            frame[self._fog] = 255
