"""Martin Atomic 3000 strobe (4Ch DMX mode)."""

from dmx import Fixture

# Channel 4 effect bands, per manual page 23.
EFFECTS: dict[str, int] = {
    "none":          0,    # 0..5
    "ramp_up":       24,   # 6..42
    "ramp_down":     64,   # 43..85
    "ramp_up_down":  107,  # 86..128
    "random":        150,  # 129..171
    "lightning":     193,  # 172..214
    "spikes":        235,  # 215..255
}


class Atomic(Fixture):
    """Martin Atomic 3000 strobe, 4Ch DMX mode.

    ch1 = intensity (0-5 blackout, 6-255 dim min..max)
    ch2 = flash duration (0..650 ms @ 50 Hz, 0..530 ms @ 60 Hz)
    ch3 = flash rate (0-5 no flash, 6-255 ~0.5..25 Hz @ 50 Hz)
    ch4 = special effects (banded; see EFFECTS map)
    """

    CHANNELS = ("intensity", "duration", "rate", "effect")

    def intensity(self, level: int) -> None:
        self._set("intensity", level)

    def duration(self, value: int) -> None:
        self._set("duration", value)

    def rate(self, value: int) -> None:
        self._set("rate", value)

    def effect(self, name: str) -> None:
        if name not in EFFECTS:
            raise ValueError(f"unknown effect {name!r}; choose from {list(EFFECTS)}")
        self._set("effect", EFFECTS[name])

    def strobe(self, intensity: int = 255, rate: int = 128, duration: int = 128) -> None:
        """Continuous strobe — set intensity, rate, duration in one call."""
        self._set_many(intensity=intensity, rate=rate, duration=duration, effect=0)

    def blackout(self) -> None:
        self._set_many(intensity=0, duration=0, rate=0, effect=0)
