"""Single-channel pinspot — a simple dimmer with eased fades."""

import math

from dmx import Fixture


class Pinspot(Fixture):
    """One DMX channel, 0..255 dimmer.

    Calls to dim()/on()/off() set a *target* level. The actual DMX
    output approaches the target via exponential smoothing on every
    universe frame (see Universe._tick_smoothing). This gives natural
    ease-in/ease-out fades instead of hard jumps when scenes flick
    pinspots between values.

    Tune `TAU` (the time constant) to taste — smaller = snappier.
    """

    CHANNELS = ("level",)
    TAU = 0.18  # seconds; ~63% of the distance covered per TAU

    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self._target: int = 0

    def dim(self, level: int) -> None:
        self._target = max(0, min(255, int(level)))

    def on(self) -> None:
        self._target = 255

    def off(self) -> None:
        self._target = 0

    def set_immediate(self, level: int) -> None:
        """Bypass smoothing and snap straight to a value (e.g. for blackout)."""
        v = max(0, min(255, int(level)))
        self._target = v
        self._set("level", v)

    def _smooth_step(self, dt: float) -> None:
        """Advance the eased value one universe frame closer to the target."""
        current = self._values[0]
        target = self._target
        if current == target:
            return
        factor = 1.0 - math.exp(-dt / self.TAU)
        new = current + (target - current) * factor
        # ensure forward progress so we don't stall on rounding
        if new > current:
            new = max(current + 1, new)
        else:
            new = min(current - 1, new)
        v = max(0, min(255, int(round(new))))
        self._set("level", v)
