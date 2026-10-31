"""Looping scenes for the rig — Tripars + moving heads only.

Each scene takes (tripars, focus, groot, stop) where `stop` is a
threading.Event. Scenes loop forever and exit promptly when stop is set.
Atomic and Fog are intentionally NOT touched here — they're driven
manually from the UI.

The `SCENES` list at the bottom is the registry the web UI consumes.
"""

from __future__ import annotations

import colorsys
import math
import random
import threading
import time
from typing import Callable, Literal

import aim
from beat import BeatClock
from layout import head_order_lr, positions, tripar_groups
from rig import Rig

Scene = Callable[[Rig, threading.Event], None]
Tempo = Literal["slow", "medium", "fast", "insane"]

# ----- musical time -----
# Scenes run on the shared beat clock (beat.py), so they follow the tapped
# BPM. Musical time is "seconds at 120 BPM" (0.5 per beat): at 120 BPM a
# scene looks exactly as designed, at 128 it runs 7 % faster, and stepped
# changes land on beat divisions via Every().

REF_BPM = 120.0
_clock: BeatClock | None = None


def set_clock(clock: BeatClock) -> None:
    global _clock
    _clock = clock


def beats() -> float:
    """Current beat position; beat 0, 4, 8 … are downbeats."""
    return _clock.beats() if _clock else time.monotonic() * REF_BPM / 60.0


def mtime() -> float:
    """Musical seconds: equals wall seconds at 120 BPM."""
    return beats() * 60.0 / REF_BPM


def msleep(secs: float) -> None:
    """Sleep `secs` musical seconds (shorter at faster tempos)."""
    bpm = _clock.bpm if _clock else REF_BPM
    time.sleep(secs * REF_BPM / bpm)


class Every:
    """True once per grid slot of `n_beats` (0.25 = every 16th note, 4 = every bar)."""

    def __init__(self, n_beats: float) -> None:
        self.n = n_beats
        self._slot: int | None = None

    def __call__(self) -> bool:
        slot = math.floor(beats() / self.n)
        if slot == self._slot:
            return False
        self._slot = slot
        return True


# ----- helpers -----

def hsv(h: float, s: float = 1.0, v: float = 1.0) -> tuple[int, int, int]:
    r, g, b = colorsys.hsv_to_rgb(h % 1.0, s, v)
    return int(r * 255), int(g * 255), int(b * 255)


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def lerp_color(c1: tuple[int, int, int], c2: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return (
        int(lerp(c1[0], c2[0], t)),
        int(lerp(c1[1], c2[1], t)),
        int(lerp(c1[2], c2[2], t)),
    )


def _ensure_visible(tripars, focus, groot) -> None:
    """Make sure fixtures are unblacked-out before a scene starts."""
    for t in tripars:
        t.enable()
    for h in focus + groot:
        h.shutter("open")
        h.dim(255)


# ----- scenes -----

def scene_atmosphere(rig: Rig, stop: threading.Event) -> None:
    tripars, focus, groot = rig.tripars, rig.focus, rig.groot
    pinspots, spotlight = rig.pinspots, rig.spotlight
    _ensure_visible(tripars, focus, groot)
    for h in focus:
        h._set("pan_tilt_speed", 220)
    for h in groot:
        h._set("speed", 220)

    # one-time fade-in to deep blue
    steps = 40
    fade_secs = 4.0
    for i in range(steps + 1):
        if stop.is_set():
            return
        c = lerp_color((0, 0, 0), (0, 30, 140), i / steps)
        for t in tripars:
            t.color(*c)
        for h in focus + groot:
            h.position(128, 180)
            h.color("red")
            h.dim(60)
        msleep(fade_secs / steps)

    # gentle pulse on the blue
    while not stop.is_set():
        v = 30 + int(20 * math.sin(mtime() * 0.4))
        for t in tripars:
            t.color(0, v, 100 + v)
        time.sleep(1 / 30)


def scene_sunrise(rig: Rig, stop: threading.Event) -> None:
    tripars, focus, groot = rig.tripars, rig.focus, rig.groot
    pinspots, spotlight = rig.pinspots, rig.spotlight
    _ensure_visible(tripars, focus, groot)
    for h in focus + groot:
        h.dim(180)

    palette = [(255, 30, 0), (255, 90, 0), (255, 160, 20),
               (255, 200, 80), (255, 100, 50), (200, 30, 80)]

    while not stop.is_set():
        t_now = mtime()
        idx = int((t_now * 0.4) % len(palette))
        nxt = (idx + 1) % len(palette)
        f = (t_now * 0.4) % 1
        c = lerp_color(palette[idx], palette[nxt], f)
        for t in tripars:
            t.color(*c)

        pan = int(128 + 60 * math.sin(t_now * 0.7))
        tilt = int(128 + 30 * math.sin(t_now * 0.3))
        for h in focus + groot:
            h.position(pan, tilt)
        time.sleep(1 / 30)


def scene_chase(rig: Rig, stop: threading.Event) -> None:
    tripars, focus, groot = rig.tripars, rig.focus, rig.groot
    pinspots, spotlight = rig.pinspots, rig.spotlight
    _ensure_visible(tripars, focus, groot)
    for h in focus + groot:
        h.color("blue")
        h.dim(180)
        h.position(128, 100)
    for h in focus:
        h.gobo("open")

    chase_idx = 0
    direction = 1
    bg = (10, 0, 30)
    fg = (0, 200, 255)
    step = Every(0.25)              # 16th notes

    while not stop.is_set():
        if step():
            for i, t in enumerate(tripars):
                t.color(*(fg if i == chase_idx else bg))
            chase_idx += direction
            if chase_idx >= 11 or chase_idx <= 0:
                direction *= -1
        time.sleep(1 / 60)


def scene_rainbow(rig: Rig, stop: threading.Event) -> None:
    tripars, focus, groot = rig.tripars, rig.focus, rig.groot
    pinspots, spotlight = rig.pinspots, rig.spotlight
    _ensure_visible(tripars, focus, groot)
    for h in focus + groot:
        h.dim(255)

    color_cycle = ["red", "yellow", "green", "cyan", "blue", "pink"]
    next_colour = Every(4)          # heads change colour each bar
    ci = 0

    while not stop.is_set():
        phase = mtime() * 0.6
        for i, t in enumerate(tripars):
            t.color(*hsv(phase + i / 12.0))

        if next_colour():
            ci = (ci + 1) % len(color_cycle)
            for h in focus:
                try: h.color(color_cycle[ci])
                except ValueError: h.color("white")
            for h in groot:
                try: h.color(color_cycle[ci])
                except ValueError: h.color("white")

        t_now = mtime()
        pan = int(128 + 70 * math.cos(t_now * 0.8))
        tilt = int(128 + 50 * math.sin(t_now * 0.8))
        for h in focus + groot:
            h.position(pan, tilt)
        time.sleep(1 / 30)


def scene_buildup(rig: Rig, stop: threading.Event) -> None:
    """Cyclic energy ramp over an 8-bar phrase, then resets, on repeat."""
    tripars, focus, groot = rig.tripars, rig.focus, rig.groot
    pinspots, spotlight = rig.pinspots, rig.spotlight
    _ensure_visible(tripars, focus, groot)
    for h in focus + groot:
        h.dim(255)
    cycle_secs = 16.0   # 32 beats = one 8-bar phrase

    while not stop.is_set():
        start = math.floor(mtime() / cycle_secs) * cycle_secs   # line up with the phrase
        while not stop.is_set():
            elapsed = mtime() - start
            if not 0 <= elapsed < cycle_secs:   # phrase done, or tempo resynced
                break
            progress = elapsed / cycle_secs
            speed = 0.5 + progress * 4.0

            for i, t in enumerate(tripars):
                t.color(*hsv(mtime() * speed + i / 12.0))

            sweep = math.sin(mtime() * speed * 0.5)
            pan = int(128 + 60 * sweep)
            tilt = int(128 - 40 * sweep)
            for h in focus + groot:
                h.position(pan, tilt)
            time.sleep(1 / 40)


def scene_drop(rig: Rig, stop: threading.Event) -> None:
    tripars, focus, groot = rig.tripars, rig.focus, rig.groot
    pinspots, spotlight = rig.pinspots, rig.spotlight
    _ensure_visible(tripars, focus, groot)
    for h in focus + groot:
        h.color("white")
        h.dim(255)
        h.shutter("strobe")

    while not stop.is_set():
        t_now = mtime()
        v = int(127 + 128 * math.cos(t_now * 4 * math.pi))   # one pulse per beat, peak on the beat
        for t in tripars:
            t.color(v, v, v)
        # pinspots track the same pulse
        for p in pinspots:
            p.dim(v)
        pan = int(128 + 100 * math.sin(t_now * 1.2))
        tilt = int(128 + 60 * math.cos(t_now * 1.7))
        for h in focus + groot:
            h.position(pan, tilt)
        time.sleep(1 / 40)


def scene_calm(rig: Rig, stop: threading.Event) -> None:
    tripars, focus, groot = rig.tripars, rig.focus, rig.groot
    pinspots, spotlight = rig.pinspots, rig.spotlight
    _ensure_visible(tripars, focus, groot)
    for h in focus:
        h.shutter("open")
        h.color("blue")
        h.dim(150)
        h.gobo("open")
    for h in groot:
        h.shutter("open")
        h.color("blue")
        h.dim(150)

    while not stop.is_set():
        t_now = mtime()
        v = 100 + int(60 * math.sin(t_now * 0.8))
        for i, t in enumerate(tripars):
            offset = math.sin(t_now * 0.6 + i * 0.5)
            r = max(0, int(40 * offset))
            b = max(40, v + int(40 * offset))
            t.color(r, 0, b)

        for i, h in enumerate(focus + groot):
            pan = int(128 + 60 * math.sin(t_now * 0.5 + i))
            tilt = int(128 + 50 * math.cos(t_now * 0.6 + i * 0.7))
            h.position(pan, tilt)
        time.sleep(1 / 30)


def scene_disco(rig: Rig, stop: threading.Event) -> None:
    tripars, focus, groot = rig.tripars, rig.focus, rig.groot
    pinspots, spotlight = rig.pinspots, rig.spotlight
    _ensure_visible(tripars, focus, groot)
    gobos = ["gobo1", "gobo2", "gobo3", "gobo4"]
    for h, g in zip(focus, gobos):
        h.gobo(g)
        h.shutter("open")
        h.dim(255)
    for h in groot:
        h.dim(255)
        h.shutter("open")

    head_colors_focus = ["red", "blue", "green", "yellow"]
    head_colors_groot = ["magenta", "cyan", "yellow"]
    swap = Every(2)                 # heads rotate colours every 2 beats

    while not stop.is_set():
        phase = mtime() * 0.9
        for i, t in enumerate(tripars):
            t.color(*hsv(phase + i / 6.0))

        if swap():
            head_colors_focus = head_colors_focus[1:] + head_colors_focus[:1]
            head_colors_groot = head_colors_groot[1:] + head_colors_groot[:1]
            for h, c in zip(focus, head_colors_focus):
                h.color(c)
            for h, c in zip(groot, head_colors_groot):
                h.color(c)

        t_now = mtime()
        for i, h in enumerate(focus + groot):
            pan = int(128 + 80 * math.sin(t_now * 1.0 + i * 0.9))
            tilt = int(128 + 60 * math.cos(t_now * 0.7 + i * 0.6))
            h.position(pan, tilt)
        time.sleep(1 / 30)


def scene_climax(rig: Rig, stop: threading.Event) -> None:
    tripars, focus, groot = rig.tripars, rig.focus, rig.groot
    pinspots, spotlight = rig.pinspots, rig.spotlight
    _ensure_visible(tripars, focus, groot)
    for p in pinspots:
        p.dim(255)
    for h in focus + groot:
        h.shutter("strobe")
        h.dim(255)

    while not stop.is_set():
        h_phase = (mtime() * 1.5) % 1
        col = hsv(h_phase)
        for t in tripars:
            t.color(*col)
        idx = int(beats() * 2) % 6     # head colour every 8th note
        for fh in focus:
            try: fh.color(["red", "green", "blue", "yellow", "pink", "white"][idx])
            except ValueError: fh.color("white")
        for gh in groot:
            try: gh.color(["red", "green", "blue", "yellow", "magenta", "cyan"][idx])
            except ValueError: gh.color("white")
        t_now = mtime()
        pan = int(128 + 110 * math.sin(t_now * 2.5))
        tilt = int(128 + 80 * math.cos(t_now * 2.0))
        for h_ in focus + groot:
            h_.position(pan, tilt)
        time.sleep(1 / 40)


def scene_fade(rig: Rig, stop: threading.Event) -> None:
    """Fade to black, then hold dark until interrupted."""
    tripars, focus, groot = rig.tripars, rig.focus, rig.groot
    pinspots, spotlight = rig.pinspots, rig.spotlight
    _ensure_visible(tripars, focus, groot)

    fade_secs = 6.0
    steps = 60
    for i in range(steps + 1):
        if stop.is_set():
            return
        f = 1 - i / steps  # 1..0
        c = lerp_color((140, 140, 200), (0, 0, 0), 1 - f)
        for t in tripars:
            t.color(*c)
        for h in focus + groot:
            h.dim(int(180 * f))
        msleep(fade_secs / steps)

    # hold dark
    for t in tripars:
        t.color(0, 0, 0)
    for h in focus + groot:
        h.dim(0)
    while not stop.is_set():
        time.sleep(0.1)


def scene_beam_sweep(rig: Rig, stop: threading.Event) -> None:
    """Beam sweep — each head runs the cycle horizontal -> on -> tilt down ->
    off -> return on its own staggered phase, so it looks like a wave."""
    tripars, focus, groot = rig.tripars, rig.focus, rig.groot
    pinspots, spotlight = rig.pinspots, rig.spotlight
    _ensure_visible(tripars, focus, groot)
    for t in tripars:
        t.color(40, 20, 60)  # soft purple backdrop
    for h in focus:
        h._set("pan_tilt_speed", 0)
        h.color("white")
        h.gobo("open")
    for h in groot:
        h._set("speed", 0)
        h.color("white")

    heads = focus + groot
    HORIZONTAL = 32
    DOWN = 200
    CYCLE = 4.0  # seconds — full per-head cycle

    start = math.floor(mtime() / 2.0) * 2.0   # start on a bar line
    while not stop.is_set():
        t_now = mtime() - start
        for i, h in enumerate(heads):
            offset = (i * CYCLE) / len(heads)
            phase = ((t_now - offset) % CYCLE) / CYCLE

            if phase < 0.40:
                # silently moving back to horizontal (shutter closed)
                tilt, lit = HORIZONTAL, False
            elif phase < 0.55:
                # on at horizontal
                tilt, lit = HORIZONTAL, True
            elif phase < 0.85:
                # sweeping from horizontal to down (lit)
                f = (phase - 0.55) / 0.30
                tilt = int(HORIZONTAL + (DOWN - HORIZONTAL) * f)
                lit = True
            else:
                # off at down
                tilt, lit = DOWN, False

            h.position(128, tilt)
            h.shutter("open" if lit else "closed")
            h.dim(255)

        time.sleep(1 / 40)


def scene_police(rig: Rig, stop: threading.Event) -> None:
    """Red/blue alternating flash. Pinspots strobe with the beat, spotlight chops."""
    tripars, focus, groot = rig.tripars, rig.focus, rig.groot
    pinspots, spotlight = rig.pinspots, rig.spotlight
    _ensure_visible(tripars, focus, groot)
    for h in focus + groot:
        h.dim(255)
        h.shutter("open")

    state = 0
    flip = Every(0.5)               # 8th notes
    while not stop.is_set():
        if flip():
            state = 1 - state
            color = (255, 0, 0) if state == 0 else (0, 0, 255)
            head_color = "red" if state == 0 else "blue"
            for i, t in enumerate(tripars):
                t.color(*(color if (i % 2) == state else (0, 0, 0)))
            for h in focus + groot:
                h.color(head_color)
            # alternate pinspots between the two halves
            for i, p in enumerate(pinspots):
                p.dim(255 if (i % 2) == state else 0)
        time.sleep(1 / 60)


def scene_fire(rig: Rig, stop: threading.Event) -> None:
    """Flickering warm reds/oranges on tripars; heads slowly drift."""
    tripars, focus, groot = rig.tripars, rig.focus, rig.groot
    pinspots, spotlight = rig.pinspots, rig.spotlight
    _ensure_visible(tripars, focus, groot)
    for h in focus + groot:
        h.color("red")
        h.dim(180)

    while not stop.is_set():
        for t in tripars:
            r = random.randint(180, 255)
            g = random.randint(20, 90)
            t.color(r, g, 0)
        t_now = mtime()
        pan = int(128 + 30 * math.sin(t_now * 0.4))
        tilt = int(150 + 25 * math.sin(t_now * 0.3))
        for h in focus + groot:
            h.position(pan, tilt)
        time.sleep(0.06)


def scene_ocean(rig: Rig, stop: threading.Event) -> None:
    """Blue/teal waves on tripars; heads drift slowly."""
    tripars, focus, groot = rig.tripars, rig.focus, rig.groot
    pinspots, spotlight = rig.pinspots, rig.spotlight
    _ensure_visible(tripars, focus, groot)
    for h in focus:
        h.color("blue"); h.dim(150); h.gobo("open")
    for h in groot:
        h.color("blue"); h.dim(150)

    while not stop.is_set():
        t_now = mtime()
        for i, t in enumerate(tripars):
            wave = math.sin(t_now * 0.4 + i * 0.5)
            g = int(60 + 80 * (wave + 1) / 2)
            b = int(180 - 30 * (wave + 1) / 2)
            t.color(0, g, b)
        pan = int(128 + 40 * math.sin(t_now * 0.2))
        tilt = int(128 + 30 * math.sin(t_now * 0.25))
        for h in focus + groot:
            h.position(pan, tilt)
        time.sleep(1 / 30)


def scene_sunset(rig: Rig, stop: threading.Event) -> None:
    """Slow drift through warm to cool palette, looping."""
    tripars, focus, groot = rig.tripars, rig.focus, rig.groot
    pinspots, spotlight = rig.pinspots, rig.spotlight
    _ensure_visible(tripars, focus, groot)
    for h in focus + groot:
        h.dim(180)

    palette = [
        (255, 100, 0),
        (255, 50, 80),
        (200, 30, 120),
        (100, 30, 180),
        (40, 50, 180),
        (10, 20, 80),
    ]
    cycle_secs = 32.0   # 64 beats

    while not stop.is_set():
        phase = (mtime() % cycle_secs) / cycle_secs
        idx = int(phase * len(palette)) % len(palette)
        nxt = (idx + 1) % len(palette)
        f = (phase * len(palette)) % 1
        c = lerp_color(palette[idx], palette[nxt], f)
        for t in tripars:
            t.color(*c)
        t_now = mtime()
        pan = int(128 + 60 * math.sin(t_now * 0.15))
        tilt = int(128 + 50 * math.cos(t_now * 0.12))
        for h in focus + groot:
            h.position(pan, tilt)
        time.sleep(1 / 30)


def scene_wipe(rig: Rig, stop: threading.Event) -> None:
    """Color wipes across the tripars left-right-left-right..."""
    tripars, focus, groot = rig.tripars, rig.focus, rig.groot
    pinspots, spotlight = rig.pinspots, rig.spotlight
    _ensure_visible(tripars, focus, groot)
    for h in focus + groot:
        h.dim(200)

    palette = [(255, 0, 0), (0, 200, 255), (0, 255, 80),
               (255, 200, 0), (255, 0, 200), (255, 255, 255)]
    head_names = ["red", "blue", "green", "yellow", "magenta", "white"]
    color_idx = 0
    bg = (0, 0, 0)
    pos = 0
    direction = 1
    step = Every(0.25)              # 16th notes

    while not stop.is_set():
        if step():
            for i, t in enumerate(tripars):
                lit = (direction > 0 and i <= pos) or (direction < 0 and i >= pos)
                t.color(*(palette[color_idx] if lit else bg))
            pos += direction
            if pos > 11 or pos < 0:
                bg = palette[color_idx]
                color_idx = (color_idx + 1) % len(palette)
                direction *= -1
                pos = max(0, min(11, pos))
                for h in focus + groot:
                    try:
                        h.color(head_names[color_idx])
                    except ValueError:
                        h.color("white")
        time.sleep(1 / 60)


def scene_stars(rig: Rig, stop: threading.Event) -> None:
    """Random twinkles — random tripars flash white briefly on a deep blue bed."""
    tripars, focus, groot = rig.tripars, rig.focus, rig.groot
    pinspots, spotlight = rig.pinspots, rig.spotlight
    _ensure_visible(tripars, focus, groot)
    for h in focus:
        h.color("blue"); h.dim(80); h.gobo("open")
    for h in groot:
        h.color("blue"); h.dim(80)

    BG = (0, 5, 25)
    levels = [list(BG) for _ in tripars]  # current values

    while not stop.is_set():
        # randomly trigger sparks
        if random.random() < 0.35:
            i = random.randrange(len(tripars))
            v = random.randint(180, 255)
            levels[i] = [v, v, v]

        # decay everyone toward BG
        for i in range(len(tripars)):
            for c in range(3):
                levels[i][c] = int(levels[i][c] * 0.78 + BG[c] * 0.22)
            tripars[i].color(*levels[i])
        time.sleep(1 / 30)


def scene_evenodd(rig: Rig, stop: threading.Event) -> None:
    """Even/odd Tripars hold contrasting colors; swap periodically."""
    tripars, focus, groot = rig.tripars, rig.focus, rig.groot
    pinspots, spotlight = rig.pinspots, rig.spotlight
    _ensure_visible(tripars, focus, groot)
    for h in focus + groot:
        h.dim(220)

    palette = [
        ((255, 0, 0),   (0, 0, 255)),     # red / blue
        ((0, 255, 0),   (255, 0, 255)),   # green / magenta
        ((255, 255, 0), (0, 255, 255)),   # yellow / cyan
        ((255, 100, 0), (100, 0, 255)),   # orange / purple
    ]
    pi = 0
    swap = Every(2)
    swap_state = 0

    while not stop.is_set():
        if swap():
            swap_state = 1 - swap_state
            if swap_state == 0:
                pi = (pi + 1) % len(palette)
        c1, c2 = palette[pi]
        for i, t in enumerate(tripars):
            t.color(*(c1 if (i % 2) == swap_state else c2))
        t_now = mtime()
        pan = int(128 + 50 * math.sin(t_now * 0.5))
        tilt = int(128 + 30 * math.cos(t_now * 0.4))
        for h in focus + groot:
            h.position(pan, tilt)
        time.sleep(1 / 30)


# ----- geometry-aware scenes (use saved layout) -----

def scene_ring_spin(rig: Rig, stop: threading.Event) -> None:
    """A bright dot rotates clockwise around the ring of 8 tripars
    around the crowd. Stage row holds a soft warm backdrop."""
    tripars, focus, groot = rig.tripars, rig.focus, rig.groot
    pinspots, spotlight = rig.pinspots, rig.spotlight
    _ensure_visible(tripars, focus, groot)
    ring, stage = tripar_groups()
    bg = (8, 4, 25)
    fg = (0, 220, 255)
    backdrop = (60, 20, 80)

    for i in stage:
        tripars[i].color(*backdrop)
    for h in focus + groot:
        h.color("blue")
        h.dim(160)

    while not stop.is_set():
        pos = (beats() * 2) % len(ring)   # two tripars per beat: one lap of 8 per bar
        head = int(pos)
        # leading tripar bright, trailing one fades, others bg
        for k, idx in enumerate(ring):
            if k == head:
                tripars[idx].color(*fg)
            elif k == (head - 1) % len(ring):
                # trailing fade
                tripars[idx].color(fg[0] // 3, fg[1] // 3, fg[2] // 3)
            else:
                tripars[idx].color(*bg)
        time.sleep(1 / 60)


def scene_radial_wave(rig: Rig, stop: threading.Event) -> None:
    """Color wave around the ring — each ring tripar phase-offset.
    Stage tripars sync to the dominant hue."""
    tripars, focus, groot = rig.tripars, rig.focus, rig.groot
    pinspots, spotlight = rig.pinspots, rig.spotlight
    _ensure_visible(tripars, focus, groot)
    ring, stage = tripar_groups()
    for h in focus + groot:
        h.color("white")
        h.dim(180)

    while not stop.is_set():
        t_now = mtime()
        base = t_now * 0.18
        for k, idx in enumerate(ring):
            tripars[idx].color(*hsv(base + k / len(ring)))
        # stage row holds the leading hue, slightly desaturated
        stage_color = hsv(base, s=0.7, v=0.7)
        for idx in stage:
            tripars[idx].color(*stage_color)
        # heads do gentle synchronized circles
        pan = int(128 + 50 * math.cos(t_now * 0.5))
        tilt = int(128 + 40 * math.sin(t_now * 0.5))
        for h in focus + groot:
            h.position(pan, tilt)
        time.sleep(1 / 30)


def scene_stage_chase(rig: Rig, stop: threading.Event) -> None:
    """Energetic chase along the stage row (T9-12 + 3 Groots).
    Ring stays in a calm color. Groot heads pan side to side."""
    tripars, focus, groot = rig.tripars, rig.focus, rig.groot
    pinspots, spotlight = rig.pinspots, rig.spotlight
    _ensure_visible(tripars, focus, groot)
    ring, stage = tripar_groups()
    g_order = head_order_lr("groot", len(groot))

    for idx in ring:
        tripars[idx].color(20, 0, 60)
    for h in focus:
        h.color("blue")
        h.dim(120)
    for h in groot:
        h.color("white")
        h.dim(255)

    palette = [(255, 0, 80), (0, 200, 255), (255, 200, 0)]
    pal_idx = 0
    pos = 0
    step = Every(0.25)              # 16th notes
    direction = 1
    line = list(stage) + [None] * len(groot)  # tripar idx or None for Groot slot

    while not stop.is_set():
        if step():
            on_color = palette[pal_idx]
            off_color = (12, 0, 20)
            for k, slot in enumerate(line):
                lit = (k == pos)
                if slot is not None:
                    tripars[slot].color(*(on_color if lit else off_color))
            # Groot slots take the colored beam
            for j, gi in enumerate(g_order):
                slot_pos = len(stage) + j
                if slot_pos == pos:
                    groot[gi].dim(255)
                else:
                    groot[gi].dim(40)
            pos += direction
            if pos >= len(line):
                pos = len(line) - 2
                direction = -1
                pal_idx = (pal_idx + 1) % len(palette)
            elif pos < 0:
                pos = 1
                direction = 1
                pal_idx = (pal_idx + 1) % len(palette)
        # heads sweep side-to-side
        t_now = mtime()
        pan = int(128 + 80 * math.sin(t_now * 1.0))
        tilt = 100
        for h in groot:
            h.position(pan, tilt)
        time.sleep(1 / 60)


def scene_crowd_glow(rig: Rig, stop: threading.Event) -> None:
    """Atmospheric: Focus Spots aimed up over the crowd in white,
    ring tripars in a slow warm wash, stage off. No strobing."""
    tripars, focus, groot = rig.tripars, rig.focus, rig.groot
    pinspots, spotlight = rig.pinspots, rig.spotlight
    _ensure_visible(tripars, focus, groot)
    ring, stage = tripar_groups()

    for p in pinspots:
        p.dim(180)  # pinspots glow warm on the crowd
    for h in focus:
        h.color("white")
        h.dim(180)
        h.gobo("open")
        h.position(128, 80)
    for h in groot:
        h.color("white")
        h.dim(120)
        h.position(128, 80)
    for idx in stage:
        tripars[idx].color(0, 0, 0)

    while not stop.is_set():
        t_now = mtime()
        v = 0.6 + 0.3 * (math.sin(t_now * 0.3) + 1) / 2
        col = hsv(0.06, s=0.8, v=v)
        for k, idx in enumerate(ring):
            shimmer = 1.0 + 0.05 * math.sin(t_now * 0.4 + k)
            tripars[idx].color(
                min(255, int(col[0] * shimmer)),
                min(255, int(col[1] * shimmer)),
                min(255, int(col[2] * shimmer)),
            )
        # pinspots breathe along
        pin_v = 140 + int(40 * math.sin(t_now * 0.4))
        for p in pinspots:
            p.dim(pin_v)
        d = 140 + int(40 * math.sin(t_now * 0.4))
        for h in focus:
            h.dim(d)
        time.sleep(1 / 30)


def scene_ring_quadrants(rig: Rig, stop: threading.Event) -> None:
    """Split the 8-ring into 4 pairs (quadrants); each holds a different
    color, all four colors rotate around the ring every beat."""
    tripars, focus, groot = rig.tripars, rig.focus, rig.groot
    pinspots, spotlight = rig.pinspots, rig.spotlight
    _ensure_visible(tripars, focus, groot)
    ring, stage = tripar_groups()
    for h in focus + groot:
        h.color("white")
        h.dim(180)

    palette = [
        (255, 30, 80),   # pink-red
        (0, 200, 255),   # cyan
        (255, 200, 0),   # amber
        (160, 0, 255),   # purple
    ]
    rotation = 0
    rotate = Every(1)               # every beat

    while not stop.is_set():
        if rotate():
            rotation = (rotation + 1) % len(ring)
        for k, idx in enumerate(ring):
            quad = ((k + rotation) // 2) % len(palette)
            tripars[idx].color(*palette[quad])
        # stage row holds the dominant color (first quadrant)
        for idx in stage:
            tripars[idx].color(*palette[rotation % len(palette)])
        time.sleep(1 / 30)


# ====================================================================
# NEW TEMPO-CURATED SCENES
# ====================================================================

# ---------- SLOW (atmospheric) ----------

def scene_breathe(rig: Rig, stop: threading.Event) -> None:
    """Single warm hue breathing in and out, very slow. Heads still.
    Pinspots breathe along with the tripars at low intensity."""
    tripars, focus, groot = rig.tripars, rig.focus, rig.groot
    pinspots, spotlight = rig.pinspots, rig.spotlight
    _ensure_visible(tripars, focus, groot)
    for h in focus + groot:
        h.color("white")
        h.dim(120)
        h.position(128, 110)
        try:
            h._set("pan_tilt_speed", 240)
        except (KeyError, ValueError):
            pass
        try:
            h._set("speed", 240)
        except (KeyError, ValueError):
            pass

    while not stop.is_set():
        t_now = mtime()
        h_drift = 0.05 + 0.05 * math.sin(t_now * 0.04)
        breath = 0.35 + 0.30 * (1 + math.sin(t_now * 0.9)) / 2
        col = hsv(h_drift, s=0.65, v=breath)
        for t in tripars:
            t.color(*col)
        # pinspots track the breath at ~40% peak
        pin_level = int(100 * breath)
        for p in pinspots:
            p.dim(pin_level)
        time.sleep(1 / 30)


def scene_drift(rig: Rig, stop: threading.Event) -> None:
    """Slow blue/purple/teal drift, ring tripars phase-offset, heads sway."""
    tripars, focus, groot = rig.tripars, rig.focus, rig.groot
    pinspots, spotlight = rig.pinspots, rig.spotlight
    _ensure_visible(tripars, focus, groot)
    ring, stage = tripar_groups()
    for h in focus + groot:
        h.color("blue")
        h.dim(140)
        try:
            h._set("pan_tilt_speed", 230)
        except (KeyError, ValueError):
            pass
        try:
            h._set("speed", 230)
        except (KeyError, ValueError):
            pass

    palette_hsv = [(0.55, 1.00), (0.65, 0.90), (0.72, 0.85), (0.50, 1.00), (0.46, 0.95)]

    while not stop.is_set():
        t_now = mtime()
        phase = (t_now * 0.025) % 1.0
        seg = phase * len(palette_hsv)
        i0 = int(seg) % len(palette_hsv)
        i1 = (i0 + 1) % len(palette_hsv)
        f = seg - int(seg)
        h0, s0 = palette_hsv[i0]
        h1, s1 = palette_hsv[i1]
        base_h = h0 + (h1 - h0) * f
        base_s = s0 + (s1 - s0) * f

        for k, idx in enumerate(ring):
            offset = math.sin(t_now * 0.25 + k * 0.6) * 0.04
            tripars[idx].color(*hsv(base_h + offset, s=base_s, v=0.55))
        for idx in stage:
            tripars[idx].color(*hsv(base_h, s=base_s, v=0.40))

        pan = int(128 + 25 * math.sin(t_now * 0.15))
        tilt = int(128 + 18 * math.cos(t_now * 0.10))
        for h in focus + groot:
            h.position(pan, tilt)
        time.sleep(1 / 30)


def scene_ember(rig: Rig, stop: threading.Event) -> None:
    """Warm flickering on the tripars, like coals. Heads dim red, pointing down.
    Pinspots flicker dim warm too."""
    tripars, focus, groot = rig.tripars, rig.focus, rig.groot
    pinspots, spotlight = rig.pinspots, rig.spotlight
    _ensure_visible(tripars, focus, groot)
    for h in focus + groot:
        h.color("red")
        h.dim(70)
        h.position(128, 200)

    next_flicker = 0.0
    last_pop = 0.0
    while not stop.is_set():
        t_now = mtime()
        if t_now >= next_flicker:
            for t in tripars:
                base = random.randint(80, 160)
                r = base + random.randint(0, 60)
                g = random.randint(8, 30)
                if random.random() < 0.04:
                    r = random.randint(220, 255)
                    g = random.randint(40, 90)
                t.color(min(255, r), g, 0)
            # pinspots flicker more subtly
            for p in pinspots:
                level = random.randint(20, 80)
                if random.random() < 0.05:
                    level = random.randint(150, 200)
                p.dim(level)
            next_flicker = t_now + random.uniform(0.10, 0.25)
        if t_now - last_pop > 6:
            for h in focus + groot:
                h.dim(60 + random.randint(0, 30))
            last_pop = t_now
        time.sleep(1 / 30)


# ---------- MEDIUM (groove) ----------

def scene_groove(rig: Rig, stop: threading.Event) -> None:
    """2 Hz pulse on tripars, palette changes every 4s, heads gentle sway.
    Pinspots punch on every beat. Spotlight pulses every other beat."""
    tripars, focus, groot = rig.tripars, rig.focus, rig.groot
    pinspots, spotlight = rig.pinspots, rig.spotlight
    _ensure_visible(tripars, focus, groot)
    for h in focus + groot:
        h.color("white")
        h.dim(180)

    palette = [
        (255, 60, 120), (60, 120, 255), (60, 255, 120),
        (255, 200, 60), (200, 60, 255), (60, 255, 220),
    ]
    pi = 0
    next_colour = Every(8)          # new colour every 2 bars
    last_beat = -1

    while not stop.is_set():
        t_now = mtime()
        beat_phase = (t_now * 2) % 1.0
        pulse = max(0.25, 1.0 - beat_phase * 0.85)
        c = palette[pi]
        col = (int(c[0] * pulse), int(c[1] * pulse), int(c[2] * pulse))
        for t in tripars:
            t.color(*col)

        # pinspots: full attack on the beat, decay
        for p in pinspots:
            p.dim(int(255 * pulse))
        # spotlight: every second beat
        beat_idx = int(t_now * 2)
        if beat_idx != last_beat:
            last_beat = beat_idx

        if next_colour():
            pi = (pi + 1) % len(palette)

        pan = int(128 + 45 * math.sin(t_now * 0.55))
        tilt = int(128 + 15 * math.cos(t_now * 0.4))
        for h in focus + groot:
            h.position(pan, tilt)
        time.sleep(1 / 40)


def scene_pinwheel(rig: Rig, stop: threading.Event) -> None:
    """4 colour quadrants rotate around the ring at moderate speed."""
    tripars, focus, groot = rig.tripars, rig.focus, rig.groot
    pinspots, spotlight = rig.pinspots, rig.spotlight
    _ensure_visible(tripars, focus, groot)
    ring, stage = tripar_groups()
    for h in focus + groot:
        h.color("white")
        h.dim(200)

    palette = [
        (255, 50, 50), (50, 50, 255), (50, 255, 80), (255, 200, 50),
    ]
    while not stop.is_set():
        t_now = mtime()
        rotation = t_now * 1.4   # ring positions per second of rotation
        for k, idx in enumerate(ring):
            quad = (int(k + rotation) // 2) % len(palette)
            tripars[idx].color(*palette[quad])
        # stage row gets a darker mix
        c = palette[int(rotation) % len(palette)]
        dim = (int(c[0] * 0.55), int(c[1] * 0.55), int(c[2] * 0.55))
        for idx in stage:
            tripars[idx].color(*dim)

        # heads slow circle
        pan = int(128 + 40 * math.cos(t_now * 0.6))
        tilt = int(128 + 30 * math.sin(t_now * 0.6))
        for h in focus + groot:
            h.position(pan, tilt)
        time.sleep(1 / 30)


def scene_lighthouse(rig: Rig, stop: threading.Event) -> None:
    """All heads sweep left-right in unison; backdrop hue rotates.
    Spotlight stays on as a steady anchor; pinspots stay at half."""
    tripars, focus, groot = rig.tripars, rig.focus, rig.groot
    pinspots, spotlight = rig.pinspots, rig.spotlight
    _ensure_visible(tripars, focus, groot)
    for p in pinspots:
        p.dim(120)
    for h in focus + groot:
        h.dim(255)
        h.color("yellow")
        try:
            h._set("pan_tilt_speed", 90)
        except (KeyError, ValueError):
            pass
        try:
            h._set("speed", 90)
        except (KeyError, ValueError):
            pass

    while not stop.is_set():
        t_now = mtime()
        pan = int(128 + 110 * math.sin(t_now * math.pi))
        tilt = 90
        for h in focus + groot:
            h.position(pan, tilt)
        col = hsv((t_now * 0.05) % 1.0, s=0.55, v=0.45)
        for t in tripars:
            t.color(*col)
        time.sleep(1 / 30)


# ---------- FAST (energetic) ----------

def scene_chase_storm(rig: Rig, stop: threading.Event) -> None:
    """4 colour 'comets' with trailing fade chasing around the ring.
    Pinspots strobe in time with the chase head passing 'in front of' them."""
    tripars, focus, groot = rig.tripars, rig.focus, rig.groot
    pinspots, spotlight = rig.pinspots, rig.spotlight
    _ensure_visible(tripars, focus, groot)
    ring, stage = tripar_groups()
    for h in focus + groot:
        h.dim(220)
        h.color("white")

    chase_colors = [
        (255, 50, 50),   # red
        (50, 255, 100),  # green
        (50, 100, 255),  # blue
        (255, 200, 50),  # amber
    ]
    n = len(ring)
    bg = (5, 0, 18)

    while not stop.is_set():
        now = mtime()
        chase_pos = (beats() * 4) % n   # 16th notes round the ring

        # for each ring tripar, find the closest chase head and fade
        for k, idx in enumerate(ring):
            best = bg
            best_dist = 999.0
            for ci, frac in enumerate([0.0, 0.25, 0.5, 0.75]):
                head_k = (chase_pos + frac * n) % n
                d = min(abs(k - head_k), n - abs(k - head_k))
                if d < 1.6 and d < best_dist:
                    best_dist = d
                    fade = max(0.0, 1.0 - d / 1.6)
                    fade = fade * fade  # quadratic falloff for crisp head
                    c = chase_colors[ci]
                    best = (int(c[0] * fade), int(c[1] * fade), int(c[2] * fade))
            tripars[idx].color(*best)

        # stage row dim background
        for idx in stage:
            tripars[idx].color(*bg)

        # pinspots: each one fires when ANY chase head is over its "phase angle"
        # we have N pinspots distributed evenly across the cycle
        for pi, p in enumerate(pinspots):
            phase = (pi / max(1, len(pinspots))) * n
            min_dist = min(
                min(abs(((chase_pos + frac * n) % n) - phase),
                    n - abs(((chase_pos + frac * n) % n) - phase))
                for frac in (0.0, 0.25, 0.5, 0.75)
            )
            p.dim(255 if min_dist < 0.6 else 0)

        # heads sweep with the chase
        pan = int(128 + 90 * math.sin(now * 0.9))
        tilt = int(128 + 40 * math.cos(now * 1.3))
        for h in focus + groot:
            h.position(pan, tilt)
        time.sleep(1 / 60)


def scene_strobe_rain(rig: Rig, stop: threading.Event) -> None:
    """Random fast strobes per tripar — feels like rain. Heads strobe + sweep.
    Pinspots also strobe randomly; spotlight flashes occasionally."""
    tripars, focus, groot = rig.tripars, rig.focus, rig.groot
    pinspots, spotlight = rig.pinspots, rig.spotlight
    _ensure_visible(tripars, focus, groot)
    for h in focus + groot:
        h.color("white")
        h.dim(255)
        h.shutter("strobe")

    on_frames = [0] * len(tripars)
    pin_frames = [0] * len(pinspots)
    cur_color: list[tuple[int, int, int]] = [(0, 0, 0)] * len(tripars)
    palette = [
        (255, 255, 255), (255, 110, 200), (110, 200, 255),
        (255, 200, 110), (200, 110, 255), (110, 255, 200),
    ]

    while not stop.is_set():
        t_now = mtime()
        for i, t in enumerate(tripars):
            if on_frames[i] > 0:
                on_frames[i] -= 1
                t.color(*cur_color[i])
            else:
                if random.random() < 0.20:
                    on_frames[i] = random.randint(1, 3)
                    cur_color[i] = random.choice(palette)
                else:
                    t.color(0, 0, 0)
        # pinspots strobe at their own slower random rate
        for i, p in enumerate(pinspots):
            if pin_frames[i] > 0:
                pin_frames[i] -= 1
                p.dim(255)
            else:
                if random.random() < 0.15:
                    pin_frames[i] = random.randint(1, 2)
                else:
                    p.dim(0)
        # spotlight: occasional pop

        pan = int(128 + 100 * math.sin(t_now * 1.6))
        tilt = int(128 + 60 * math.cos(t_now * 2.1))
        for h in focus + groot:
            h.position(pan, tilt)
        time.sleep(1 / 60)


# ---------- INSANE (peak) ----------

def scene_glitch(rig: Rig, stop: threading.Event) -> None:
    """Chaotic — full rig randomised every 60-150 ms. Pinspots and spotlight too."""
    tripars, focus, groot = rig.tripars, rig.focus, rig.groot
    pinspots, spotlight = rig.pinspots, rig.spotlight
    _ensure_visible(tripars, focus, groot)
    for h in focus + groot:
        h.dim(255)
        h.shutter("strobe")

    next_change = 0.0
    head_colors = ["red", "blue", "green", "yellow", "white"]

    while not stop.is_set():
        t_now = mtime()
        if t_now >= next_change:
            for t in tripars:
                if random.random() < 0.78:
                    t.color(random.randint(0, 255), random.randint(0, 255), random.randint(0, 255))
                else:
                    t.color(0, 0, 0)
            for h in focus + groot:
                h.position(random.randint(0, 255), random.randint(40, 230))
                try:
                    h.color(random.choice(head_colors))
                except ValueError:
                    pass
            for p in pinspots:
                p.dim(random.choice([0, 0, 255, random.randint(60, 200)]))
            next_change = t_now + random.uniform(0.06, 0.15)
        time.sleep(1 / 60)


def scene_supernova(rig: Rig, stop: threading.Event) -> None:
    """Repeating explosion — stage front pops first, ring ignites, then flash, then cool.
    Pinspots and spotlight time with the phases."""
    tripars, focus, groot = rig.tripars, rig.focus, rig.groot
    pinspots, spotlight = rig.pinspots, rig.spotlight
    _ensure_visible(tripars, focus, groot)
    ring, stage = tripar_groups()
    cycle = 2.0   # one bar

    for h in focus + groot:
        h.color("white")

    while not stop.is_set():
        t_now = mtime()
        p = (t_now % cycle) / cycle

        if p < 0.10:
            # gathering — dim purple, everything off
            for t in tripars:
                t.color(20, 0, 40)
            for h in focus + groot:
                h.dim(80)
                h.shutter("open")
            for pin in pinspots:
                pin.dim(0)
        elif p < 0.30:
            # stage explodes — pinspots brighten
            f = (p - 0.10) / 0.20
            v = int(255 * f)
            for idx in stage:
                tripars[idx].color(0, v, v)
            for idx in ring:
                tripars[idx].color(20, 0, 40)
            for pin in pinspots:
                pin.dim(v)
        elif p < 0.50:
            # ring ignites — pinspots pop full
            f = (p - 0.30) / 0.20
            v = int(255 * f)
            for idx in stage:
                tripars[idx].color(0, 200, 220)
            for idx in ring:
                tripars[idx].color(v, 80, int(v * 0.9))
            for pin in pinspots:
                pin.dim(255)
        elif p < 0.80:
            # peak — strobing chaos, spotlight ON
            for h in focus + groot:
                h.shutter("strobe")
                h.dim(255)
            for t in tripars:
                t.color(255, 200, 255)
            for pin in pinspots:
                pin.dim(255)
            pan = int(128 + 110 * math.sin(t_now * 5))
            tilt = int(128 + 60 * math.cos(t_now * 4))
            for h in focus + groot:
                h.position(pan, tilt)
        else:
            # cool down
            for h in focus + groot:
                h.shutter("open")
            f = 1.0 - (p - 0.80) / 0.20
            v = int(180 * f)
            for t in tripars:
                t.color(v, int(v * 0.4), v)
            for pin in pinspots:
                pin.dim(int(255 * f))
        time.sleep(1 / 60)


# ----- registry: consumed by app.py -----

# ----- techno (all on the beat clock; Atomic and fog stay manual) -----

def _kick(phase: float, decay: float = 7.0) -> float:
    """Envelope that hits 1.0 on the beat and decays — a visual kick drum."""
    return math.exp(-phase * decay)


def _heads_lr(rig: Rig) -> list:
    """All moving heads (focus + groot) ordered left to right by the saved layout."""
    pos = positions()
    hs = [(f"focus-{i + 1}", h) for i, h in enumerate(rig.focus)]
    hs += [(f"groot-{i + 1}", h) for i, h in enumerate(rig.groot)]
    hs.sort(key=lambda t: pos.get(t[0], (0.5, 0.5))[0])
    return [h for _, h in hs]


def _head_colour(h, rig: Rig, focus_name: str, groot_name: str) -> None:
    h.color(focus_name if h in rig.focus else groot_name)


def _beams(heads: list, colour: str = "white") -> None:
    """Tight, fast beams: open shutter, no gobo/prism, snap moves."""
    for h in heads:
        aim.beam_for_aiming(h)
        if colour != "white":
            try:
                h.color(colour)
            except ValueError:
                pass


def scene_hypnotic(rig: Rig, stop: threading.Event) -> None:
    """Intro / break: cold blue bed, one white dot stepping round the ring each
    beat, heads circling slowly together with a gobo texture."""
    tripars, heads = rig.tripars, _heads_lr(rig)
    ring, stage = tripar_groups()
    _ensure_visible(tripars, rig.focus, rig.groot)
    for p in rig.pinspots:
        p.dim(0)
    for h in heads:
        _head_colour(h, rig, "blue", "blue")
        h.dim(120)
    for h in rig.focus:
        h.gobo("gobo3")
    while not stop.is_set():
        b = beats()
        dot = int(b) % len(ring)
        for k, idx in enumerate(ring):
            tripars[idx].color(*((200, 200, 255) if k == dot else (0, 6, 40)))
        for idx in stage:
            tripars[idx].color(0, 4, 28)
        for i, h in enumerate(heads):
            a = 2 * math.pi * (b / 16 + i * 0.04)          # one lap every 4 bars
            h.position(int(128 + 50 * math.cos(a)), int(150 + 30 * math.sin(a)))
        time.sleep(1 / 40)


def scene_warehouse(rig: Rig, stop: threading.Event) -> None:
    """Near dark: stage pars pulse deep red on the kick, tight white beams
    fanned out over the crowd, drifting up and down over 8 bars."""
    tripars, heads = rig.tripars, _heads_lr(rig)
    ring, stage = tripar_groups()
    for t in tripars:
        t.enable()
    for idx in ring:
        tripars[idx].color(0, 0, 0)
    for p in rig.pinspots:
        p.dim(0)
    _beams(heads)
    n = len(heads)
    while not stop.is_set():
        b = beats()
        k = _kick(b % 1.0, 5.0)
        for idx in stage:
            tripars[idx].color(int(30 + 225 * k), 0, 0)
        tilt = int(160 + 35 * math.sin(2 * math.pi * b / 32))   # 8-bar drift
        for i, h in enumerate(heads):
            h.position(int(128 + (i - (n - 1) / 2) * 20), tilt)
            h.dim(170)
        time.sleep(1 / 40)


def scene_four_floor(rig: Rig, stop: threading.Event) -> None:
    """White hit on every kick, pinspots on the offbeat; heads flip between
    fanned in and fanned out every bar."""
    tripars, heads = rig.tripars, _heads_lr(rig)
    for t in tripars:
        t.enable()
    _beams(heads)
    n = len(heads)
    bar = Every(4)
    spread = 0
    while not stop.is_set():
        b = beats()
        if bar():
            spread = 28 if spread != 28 else -14            # fan out / fan in
            for i, h in enumerate(heads):
                h.position(int(128 + (i - (n - 1) / 2) * spread), 155)
        k = _kick(b % 1.0, 8.0)
        v = int(255 * k)
        for t in tripars:
            t.color(v, v, v, v)
        off = _kick((b + 0.5) % 1.0, 10.0)                  # the "and" of each beat
        for p in rig.pinspots:
            p.dim(int(255 * off))
        for h in heads:
            h.dim(int(60 + 195 * k))
        time.sleep(1 / 60)


def scene_hihat(rig: Rig, stop: threading.Event) -> None:
    """A white dot races the ring on 16ths, red kick on the stage, head beams
    chopping on 8ths."""
    tripars, heads = rig.tripars, _heads_lr(rig)
    ring, stage = tripar_groups()
    for t in tripars:
        t.enable()
    _beams(heads)
    n = len(heads)
    bar = Every(4)
    lean = 1
    while not stop.is_set():
        b = beats()
        dot = int(b * 4) % len(ring)
        for k_, idx in enumerate(ring):
            tripars[idx].color(*((0, 0, 0, 255) if k_ == dot else (0, 0, 0, 0)))
        r = int(255 * _kick(b % 1.0, 6.0))
        for idx in stage:
            tripars[idx].color(r, 0, 0)
        if bar():
            lean = -lean
            for i, h in enumerate(heads):
                h.position(int(128 + lean * 30 + (i - (n - 1) / 2) * 10), 165)
        gate = 255 if (b * 2) % 1.0 < 0.45 else 0           # open for the first half of each 8th
        for h in heads:
            h.dim(gate)
        time.sleep(1 / 60)


def scene_scanner(rig: Rig, stop: threading.Event) -> None:
    """Heads sweep in a mirrored fan, one sweep per bar; prism every other
    bar; white accent on every downbeat."""
    tripars, heads = rig.tripars, _heads_lr(rig)
    for t in tripars:
        t.enable()
    _beams(heads)
    n = len(heads)
    bar = Every(4)
    bar_no = 0
    while not stop.is_set():
        b = beats()
        if bar():
            bar_no += 1
            for h in rig.focus:
                h.prism(bar_no % 2 == 0)
        sweep = math.sin(2 * math.pi * b / 4)
        for i, h in enumerate(heads):
            side = -1 if i < n / 2 else 1                   # left half mirrors the right
            h.position(int(128 + side * 75 * sweep), 135)
            h.dim(255)
        accent = _kick(b % 4.0, 3.0)                        # decays over the bar's first beat
        v = int(255 * accent)
        for t in tripars:
            t.color(0, 0, 0, v)
        time.sleep(1 / 60)


def scene_acid(rig: Rig, stop: threading.Event) -> None:
    """Acid green and magenta swapping on 8ths; heads circle once per bar
    with prism and gobos."""
    tripars, heads = rig.tripars, _heads_lr(rig)
    _ensure_visible(tripars, rig.focus, rig.groot)
    for h in heads:
        _head_colour(h, rig, "light_green", "light_green")
    for h in rig.focus:
        h.gobo("gobo2")
        h.prism(True)
    acid, mag = (90, 255, 0), (255, 0, 190)
    swap = Every(0.5)
    flip = 0
    col_bar = Every(4)
    alt = False
    while not stop.is_set():
        b = beats()
        if swap():
            flip = 1 - flip
        if col_bar():
            alt = not alt
            for h in heads:
                _head_colour(h, rig, "pink" if alt else "light_green", "magenta" if alt else "light_green")
        pump = 0.55 + 0.45 * _kick((b * 4) % 1.0, 6.0)      # 16th-note shimmer
        for i, t in enumerate(tripars):
            c = acid if (i % 2) == flip else mag
            t.color(int(c[0] * pump), int(c[1] * pump), int(c[2] * pump))
        for i, h in enumerate(heads):
            a = 2 * math.pi * (b / 4 + i / max(1, len(heads)))
            h.position(int(128 + 60 * math.cos(a)), int(140 + 40 * math.sin(a)))
            h.dim(int(255 * (0.4 + 0.6 * _kick(b % 1.0, 4.0))))
        time.sleep(1 / 60)


def scene_beam_cross(rig: Rig, stop: threading.Event) -> None:
    """Beams snap between an X and straight down on every beat; shutter
    strobe fill on the last beat of every 4 bars."""
    tripars, heads = rig.tripars, _heads_lr(rig)
    for t in tripars:
        t.off()
    for p in rig.pinspots:
        p.dim(0)
    _beams(heads)
    n = len(heads)
    beat = Every(1)
    while not stop.is_set():
        b = beats()
        if beat():
            crossed = int(b) % 2 == 0
            for i, h in enumerate(heads):
                side = -1 if i < n / 2 else 1
                pan = 128 - side * 55 if crossed else 128 + (i - (n - 1) / 2) * 6
                h.position(int(pan), 150 if crossed else 185)
            fill = int(b) % 16 == 15                        # last beat of 4 bars
            for h in heads:
                h.shutter("strobe" if fill else "open")
        for h in heads:
            h.dim(int(255 * (0.25 + 0.75 * _kick(b % 1.0, 5.0))))
        time.sleep(1 / 60)


def scene_build_drop(rig: Rig, stop: threading.Event) -> None:
    """Follows the 8-bar phrase (hit Resync on a phrase start): 6 bars of
    groove, a 2-bar build whose pulse doubles (8ths, 16ths, 32nds) while the
    heads rise, a half-beat blackout, then a full white hit on the 1."""
    tripars, heads = rig.tripars, _heads_lr(rig)
    ring, stage = tripar_groups()
    for t in tripars:
        t.enable()
    _beams(heads)
    n = len(heads)
    while not stop.is_set():
        b = beats()
        pb = b % 32                                         # position in the phrase
        if pb < 1:                                          # THE DROP: white hit, fans out
            k = _kick(pb, 2.5)
            v = int(255 * (0.3 + 0.7 * k))
            for t in tripars:
                t.color(v, v, v, v)
            for p in rig.pinspots:
                p.dim(v)
            for i, h in enumerate(heads):
                h.shutter("open")
                h.position(int(128 + (i - (n - 1) / 2) * 30), 150)
                h.dim(255)
        elif pb < 24:                                       # groove: red kick, slow sweep
            k = _kick(pb % 1.0, 6.0)
            for idx in stage:
                tripars[idx].color(int(255 * k), 0, 0)
            for idx in ring:
                tripars[idx].color(0, 0, 0, int(90 * _kick((pb + 0.5) % 1.0, 8.0)))
            for p in rig.pinspots:
                p.dim(0)
            s = math.sin(2 * math.pi * pb / 8)
            for i, h in enumerate(heads):
                h.position(int(128 + 50 * s + (i - (n - 1) / 2) * 12), 160)
                h.dim(140)
        elif pb < 31.5:                                     # build: pulse rate doubles
            sub = 2 if pb < 28 else 4 if pb < 30 else 8
            progress = (pb - 24) / 7.5
            on = (pb * sub) % 1.0 < 0.5
            v = int((80 + 175 * progress) * on)
            for t in tripars:
                t.color(v, v, v, v)
            for p in rig.pinspots:
                p.dim(v)
            for i, h in enumerate(heads):
                h.position(int(128 + (i - (n - 1) / 2) * (12 - 10 * progress)), int(160 - 90 * progress))
                h.dim(int(255 * on))
        else:                                               # the gap before the drop
            for t in tripars:
                t.color(0, 0, 0, 0)
            for p in rig.pinspots:
                p.dim(0)
            for h in heads:
                h.dim(0)
        time.sleep(1 / 60)


# ----- mirror ball (heads aimed via the Layout page's aim calibration) -----

def _aim_on_ball(rig: Rig) -> list:
    """Point every calibrated head at the ball with a tight white beam.
    Heads without a saved aim point keep their shutter closed — an
    uncalibrated head would just spray light into the crowd."""
    points = aim.load().get("ball", {})
    aimed = []
    for hid, h in aim.heads(rig).items():
        p = points.get(hid)
        if p is None:
            h.shutter("closed")
            continue
        aim.beam_for_aiming(h)
        h.position16(p["pan"], p["tilt"])
        aimed.append(h)
    if not aimed:
        print("[mirror-ball] no heads calibrated — set them up on the Layout page")
    return aimed


def scene_mirror_ball(rig: Rig, stop: threading.Event) -> None:
    """Classic mirror ball: room dark, every head and the pinspots on the ball."""
    for t in rig.tripars:
        t.off()
    for p in rig.pinspots:
        p.dim(255)
    _aim_on_ball(rig)
    while not stop.is_set():
        time.sleep(0.1)


def scene_mirror_ball_pulse(rig: Rig, stop: threading.Event) -> None:
    """Heads on the ball, pumping on every beat; new colour every bar."""
    for t in rig.tripars:
        t.off()
    for p in rig.pinspots:
        p.dim(255)
    heads = _aim_on_ball(rig)
    focus_cols = ["white", "blue", "pink", "green", "yellow", "red"]
    groot_cols = ["white", "blue", "magenta", "green", "yellow", "red"]
    bar = Every(4)
    ci = -1
    while not stop.is_set():
        if bar():
            ci = (ci + 1) % len(focus_cols)
            for h in heads:
                h.color(focus_cols[ci] if h in rig.focus else groot_cols[ci])
        phase = beats() % 1.0
        level = int(255 * (0.15 + 0.85 * math.exp(-phase * 5)))   # hit on the beat, decay
        for h in heads:
            h.dim(level)
        time.sleep(1 / 40)


SCENES: list[tuple[str, str, Tempo, Scene]] = [
    # ---- SLOW (atmospheric) ----
    ("breathe",     "Breathe",       "slow",   scene_breathe),
    ("drift",       "Drift",         "slow",   scene_drift),
    ("ember",       "Ember",         "slow",   scene_ember),
    ("ocean",       "Ocean",         "slow",   scene_ocean),
    ("sunset",      "Sunset",        "slow",   scene_sunset),
    ("crowd_glow",  "Crowd glow",    "slow",   scene_crowd_glow),
    ("mirror_ball", "Mirror ball",   "slow",   scene_mirror_ball),
    ("hypnotic",    "Hypnotic",      "slow",   scene_hypnotic),

    # ---- MEDIUM (groove) ----
    ("groove",       "Groove",        "medium", scene_groove),
    ("mirror_ball_pulse", "Mirror ball pulse", "medium", scene_mirror_ball_pulse),
    ("warehouse",    "Warehouse",     "medium", scene_warehouse),
    ("ring_spin",    "Ring spin",     "medium", scene_ring_spin),
    ("radial_wave",  "Radial wave",   "medium", scene_radial_wave),
    ("pinwheel",     "Pinwheel",      "medium", scene_pinwheel),
    ("lighthouse",   "Lighthouse",    "medium", scene_lighthouse),
    ("beam_sweep",   "Beam sweep",    "medium", scene_beam_sweep),
    ("rainbow",      "Rainbow",       "medium", scene_rainbow),

    # ---- FAST (energetic) ----
    ("chase_storm",     "Chase storm",  "fast",   scene_chase_storm),
    ("stage_chase",     "Stage chase",  "fast",   scene_stage_chase),
    ("police",          "Police",       "fast",   scene_police),
    ("disco",           "Disco",        "fast",   scene_disco),
    ("ring_quadrants",  "Quadrants",    "fast",   scene_ring_quadrants),
    ("strobe_rain",     "Strobe rain",  "fast",   scene_strobe_rain),
    ("buildup",         "Buildup",      "fast",   scene_buildup),
    ("four_floor",      "Four to the floor", "fast", scene_four_floor),
    ("hihat",           "Hi-hat",       "fast",   scene_hihat),
    ("scanner",         "Scanner",      "fast",   scene_scanner),

    # ---- INSANE (peak) ----
    ("drop",        "Drop",          "insane", scene_drop),
    ("climax",      "Climax",        "insane", scene_climax),
    ("glitch",      "Glitch",        "insane", scene_glitch),
    ("supernova",   "Supernova",     "insane", scene_supernova),
    ("acid",        "Acid",          "insane", scene_acid),
    ("beam_cross",  "Beam cross",    "insane", scene_beam_cross),
    ("build_drop",  "Build & drop",  "insane", scene_build_drop),
]

SCENE_BY_KEY: dict[str, tuple[str, Tempo, Scene]] = {
    k: (label, tempo, fn) for k, label, tempo, fn in SCENES
}
