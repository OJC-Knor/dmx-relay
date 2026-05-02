"""Single-channel pinspot — a simple dimmer."""

from dmx import Fixture


class Pinspot(Fixture):
    """One DMX channel, 0..255 dimmer."""

    CHANNELS = ("level",)

    def dim(self, level: int) -> None:
        self._set("level", level)

    def on(self) -> None:
        self._set("level", 255)

    def off(self) -> None:
        self._set("level", 0)
