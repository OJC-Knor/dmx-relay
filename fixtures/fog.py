"""Single-channel fog machine."""

from dmx import Fixture


class Fog(Fixture):
    """Single-channel fog machine."""

    CHANNELS = ("level",)

    def output(self, level: int) -> None:
        self._set("level", level)
