"""ADJ Focus Spot Two moving head — 18 channel mode."""

from dmx import Fixture

# Channel 5 colour wheel preset positions (band midpoints).
COLORS: dict[str, int] = {
    "white":         7,    # 0-14
    "red":          22,    # 15-29
    "blue":         37,    # 30-44
    "green":        52,    # 45-59
    "yellow":       67,    # 60-74
    "pink":         82,    # 75-89
    "light_blue":   97,    # 90-104
    "light_green": 112,    # 105-119
    "light_yellow":124,    # 120-127
}

# Channel 6 gobo wheel positions (regular + shake variants).
GOBOS: dict[str, int] = {
    "open":         4,    # 0-9
    "gobo1":       14,    # 10-18
    "gobo2":       23,    # 19-27
    "gobo3":       32,    # 28-36
    "gobo4":       41,    # 37-46
    "gobo5":       51,    # 47-55
    "gobo6":       60,    # 56-63
    "open_shake":  68,    # 64-73
    "gobo1_shake": 78,    # 74-82
    "gobo2_shake": 87,    # 83-91
    "gobo3_shake": 96,    # 92-100
    "gobo4_shake":105,    # 101-110
    "gobo5_shake":115,    # 111-119
    "gobo6_shake":124,    # 120-127
}

# Channels 9 and 11 (regular + UV) shutter/strobe states.
SHUTTERS: dict[str, int] = {
    "off":     0,    # 0-7
    "open":   12,    # 8-15
    "strobe": 75,    # 16-131
    "slow_open_fast_close": 160,  # 140-181
    "fast_open_slow_close": 210,  # 190-231
    "random": 244,    # 240-247
}

# Channel 16 dimmer curve modes.
DIMMER_MODES: dict[str, int] = {
    "standard":      10,    # 0-20
    "stage":         30,    # 21-40
    "tv":            50,    # 41-60
    "architectural": 70,    # 61-80
    "theatre":       90,    # 81-100
    "default":      128,    # 101-255
}


class FocusSpotTwo(Fixture):
    """ADJ Focus Spot Two moving head, 18-channel mode.

    Channels: pan, pan_fine, tilt, tilt_fine, color, gobo, gobo_rot,
    prism, shutter, dimmer, uv_shutter, uv_dimmer, focus, show,
    show_speed, dimmer_mode, pan_tilt_speed, function.
    """

    CHANNELS = (
        "pan", "pan_fine", "tilt", "tilt_fine",
        "color", "gobo", "gobo_rot", "prism",
        "shutter", "dimmer",
        "uv_shutter", "uv_dimmer",
        "focus",
        "show", "show_speed",
        "dimmer_mode",
        "pan_tilt_speed",
        "function",
    )

    def home(self) -> None:
        """Safe defaults: centred, shutter open, dimmer full, no effects."""
        self._set_many(
            pan=128, pan_fine=0, tilt=128, tilt_fine=0,
            color=COLORS["white"],
            gobo=GOBOS["open"],
            gobo_rot=0,
            prism=0,
            shutter=SHUTTERS["open"],
            dimmer=255,
            uv_shutter=SHUTTERS["off"],
            uv_dimmer=0,
            focus=128,
            show=0, show_speed=0,
            dimmer_mode=DIMMER_MODES["standard"],
            pan_tilt_speed=0,
            function=0,
        )

    def position(self, pan: int, tilt: int) -> None:
        self._set_many(pan=pan, tilt=tilt)

    def dim(self, level: int) -> None:
        self._set("dimmer", level)

    def color(self, name: str) -> None:
        if name not in COLORS:
            raise ValueError(f"unknown color {name!r}; choose from {list(COLORS)}")
        self._set("color", COLORS[name])

    def gobo(self, name: str) -> None:
        if name not in GOBOS:
            raise ValueError(f"unknown gobo {name!r}; choose from {list(GOBOS)}")
        self._set("gobo", GOBOS[name])

    def shutter(self, state: str) -> None:
        if state not in SHUTTERS:
            raise ValueError(f"unknown shutter {state!r}; choose from {list(SHUTTERS)}")
        self._set("shutter", SHUTTERS[state])

    def prism(self, on: bool) -> None:
        self._set("prism", 128 if on else 0)

    def uv(self, level: int) -> None:
        """Set UV LED dimmer; opens the UV shutter automatically."""
        self._set_many(uv_shutter=SHUTTERS["open"], uv_dimmer=level)

    def focus(self, value: int) -> None:
        self._set("focus", value)

    def blackout(self) -> None:
        self._set_many(shutter=SHUTTERS["off"], uv_shutter=SHUTTERS["off"])
