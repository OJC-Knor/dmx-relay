"""ADJ Mega Tripar (RGBW variant), 6Ch personality."""

from dmx import Fixture


class MegaTripar(Fixture):
    """ADJ Mega Tripar (RGBW variant), 6Ch personality.

    ch1=R, ch2=G, ch3=B, ch4=W, ch5=master dimmer, ch6=strobe.

    Quirk: this firmware needs strobe=255 to emit light at all (255 acts
    like "shutter open", lower values either strobe or stay dark). Use
    enable() to set dimmer + strobe in one go.
    """

    CHANNELS = ("red", "green", "blue", "white", "dimmer", "strobe")

    def enable(self, dim_level: int = 255) -> None:
        self._set_many(dimmer=dim_level, strobe=255)

    def color(self, r: int, g: int, b: int, w: int = 0) -> None:
        self._set_many(red=r, green=g, blue=b, white=w)

    def dim(self, level: int) -> None:
        self._set("dimmer", level)

    def strobe(self, rate: int) -> None:
        self._set("strobe", rate)

    def off(self) -> None:
        self._set_many(red=0, green=0, blue=0, white=0, dimmer=0, strobe=0)
