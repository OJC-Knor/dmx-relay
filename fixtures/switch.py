"""Single-channel switch — snaps to 0 or 255, nothing in between."""

from dmx import Fixture


class Switch(Fixture):
    """One DMX channel, binary. Any non-zero input becomes 255."""

    CHANNELS = ("level",)

    def on(self) -> None:
        self._set("level", 255)

    def off(self) -> None:
        self._set("level", 0)

    def set(self, on: bool) -> None:
        self._set("level", 255 if on else 0)

    def toggle(self) -> None:
        self._set("level", 0 if self._values[0] else 255)
