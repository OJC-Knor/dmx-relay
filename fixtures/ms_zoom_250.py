"""MS Zoom 250 XT moving head — Mode 1 (16 channels)."""

from dmx import Fixture

# Channel 7 colour wheel preset positions (per DMX chart).
COLORS: dict[str, int] = {
    "open":         0,
    "white":        0,
    "blue":        16,
    "red":         32,
    "green":       48,
    "yellow":      64,
    "magenta":     80,
    "cyan":        96,
    "light_green": 112,
}

# Channel 15 shutter/strobe states. Values pick a representative midpoint
# of each band per the chart.
SHUTTERS: dict[str, int] = {
    "closed":  0,    # 0-31
    "open":   48,    # 32-63
    "strobe": 80,    # 64-95   slow-fast continuous strobe
    "pulse": 144,    # 128-159
    "random": 208,   # 192-223
}

# Channel 13 zoom angle / frost / UV.
ZOOMS: dict[int | str, int] = {
    15:      16,    # 0-31
    18:      40,    # 32-47
    21:      56,    # 48-63
    24:      72,    # 64-79
    26:      88,    # 80-95
    "frost":104,    # 96-111
    "uv":   120,    # 112-127
}


class MSZoom250(Fixture):
    """MS Zoom 250 XT moving head, Mode 1 (16 channels).

    Channel layout: pan, tilt, pan-fine, tilt-fine, speed, lamp/fan,
    color, gobo, prism, prism-rotation, rotating-gobo, gobo-rotation,
    zoom, focus, shutter, dimmer.
    """

    CHANNELS = (
        "pan", "tilt", "pan_fine", "tilt_fine",
        "speed", "lamp", "color", "gobo",
        "prism", "prism_rot", "rot_gobo", "gobo_rot",
        "zoom", "focus", "shutter", "dimmer",
    )

    def home(self) -> None:
        """Safe defaults: centred, shutter open, dimmer full, no effects."""
        self._set_many(
            pan=128, tilt=128, pan_fine=0, tilt_fine=0,
            speed=0,            # 0 = max speed (tracking mode)
            lamp=0,             # fan-speed band, lamp left on
            color=0, gobo=0,
            prism=0, prism_rot=0,
            rot_gobo=0, gobo_rot=0,
            zoom=16,            # 15° beam
            focus=128,
            shutter=SHUTTERS["open"],
            dimmer=255,
        )

    def position(self, pan: int, tilt: int) -> None:
        self._set_many(pan=pan, tilt=tilt)

    def dim(self, level: int) -> None:
        self._set("dimmer", level)

    def color(self, name: str) -> None:
        if name not in COLORS:
            raise ValueError(f"unknown color {name!r}; choose from {list(COLORS)}")
        self._set("color", COLORS[name])

    def shutter(self, state: str) -> None:
        if state not in SHUTTERS:
            raise ValueError(f"unknown shutter {state!r}; choose from {list(SHUTTERS)}")
        self._set("shutter", SHUTTERS[state])

    def zoom(self, angle: int | str) -> None:
        if angle not in ZOOMS:
            raise ValueError(f"unknown zoom {angle!r}; choose from {list(ZOOMS)}")
        self._set("zoom", ZOOMS[angle])

    def focus(self, value: int) -> None:
        self._set("focus", value)

    def blackout(self) -> None:
        self._set("shutter", SHUTTERS["closed"])
