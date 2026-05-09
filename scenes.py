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

from layout import head_order_lr, tripar_groups
from rig import Rig

Scene = Callable[[Rig, threading.Event], None]
Tempo = Literal["slow", "medium", "fast", "insane"]

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
        time.sleep(fade_secs / steps)

    # gentle pulse on the blue
    while not stop.is_set():
        v = 30 + int(20 * math.sin(time.time() * 0.4))
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
        t_now = time.time()
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
    last_step = time.time()

    while not stop.is_set():
        if time.time() - last_step > 0.12:
            for i, t in enumerate(tripars):
                t.color(*(fg if i == chase_idx else bg))
            chase_idx += direction
            if chase_idx >= 11 or chase_idx <= 0:
                direction *= -1
            last_step = time.time()
        time.sleep(1 / 60)


def scene_rainbow(rig: Rig, stop: threading.Event) -> None:
    tripars, focus, groot = rig.tripars, rig.focus, rig.groot
    pinspots, spotlight = rig.pinspots, rig.spotlight
    _ensure_visible(tripars, focus, groot)
    for h in focus + groot:
        h.dim(255)

    color_cycle = ["red", "yellow", "green", "cyan", "blue", "pink"]
    last_color = time.time()
    ci = 0

    while not stop.is_set():
        phase = time.time() * 0.6
        for i, t in enumerate(tripars):
            t.color(*hsv(phase + i / 12.0))

        if time.time() - last_color > 1.5:
            ci = (ci + 1) % len(color_cycle)
            for h in focus:
                try: h.color(color_cycle[ci])
                except ValueError: h.color("white")
            for h in groot:
                try: h.color(color_cycle[ci])
                except ValueError: h.color("white")
            last_color = time.time()

        t_now = time.time()
        pan = int(128 + 70 * math.cos(t_now * 0.8))
        tilt = int(128 + 50 * math.sin(t_now * 0.8))
        for h in focus + groot:
            h.position(pan, tilt)
        time.sleep(1 / 30)


def scene_buildup(rig: Rig, stop: threading.Event) -> None:
    """Cyclic energy ramp: builds up over 15s then resets, on repeat."""
    tripars, focus, groot = rig.tripars, rig.focus, rig.groot
    pinspots, spotlight = rig.pinspots, rig.spotlight
    _ensure_visible(tripars, focus, groot)
    for h in focus + groot:
        h.dim(255)
    cycle_secs = 15.0

    while not stop.is_set():
        start = time.time()
        while not stop.is_set():
            elapsed = time.time() - start
            if elapsed >= cycle_secs:
                break
            progress = elapsed / cycle_secs
            speed = 0.5 + progress * 4.0

            for i, t in enumerate(tripars):
                t.color(*hsv(time.time() * speed + i / 12.0))

            sweep = math.sin(time.time() * speed * 0.5)
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
        t_now = time.time()
        v = int(127 + 128 * math.sin(t_now * 6))
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
        t_now = time.time()
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
    last_color_change = time.time()

    while not stop.is_set():
        phase = time.time() * 0.9
        for i, t in enumerate(tripars):
            t.color(*hsv(phase + i / 6.0))

        if time.time() - last_color_change > 0.8:
            head_colors_focus = head_colors_focus[1:] + head_colors_focus[:1]
            head_colors_groot = head_colors_groot[1:] + head_colors_groot[:1]
            for h, c in zip(focus, head_colors_focus):
                h.color(c)
            for h, c in zip(groot, head_colors_groot):
                h.color(c)
            last_color_change = time.time()

        t_now = time.time()
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
        h_phase = (time.time() * 1.5) % 1
        col = hsv(h_phase)
        for t in tripars:
            t.color(*col)
        idx = int(time.time() * 5) % 6
        for fh in focus:
            try: fh.color(["red", "green", "blue", "yellow", "pink", "white"][idx])
            except ValueError: fh.color("white")
        for gh in groot:
            try: gh.color(["red", "green", "blue", "yellow", "magenta", "cyan"][idx])
            except ValueError: gh.color("white")
        t_now = time.time()
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
        time.sleep(fade_secs / steps)

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

    start = time.time()
    while not stop.is_set():
        t_now = time.time() - start
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

    period = 0.18
    state = 0
    last = time.time()
    while not stop.is_set():
        if time.time() - last > period:
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
            last = time.time()
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
        t_now = time.time()
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
        t_now = time.time()
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
    cycle_secs = 30.0

    while not stop.is_set():
        phase = (time.time() % cycle_secs) / cycle_secs
        idx = int(phase * len(palette)) % len(palette)
        nxt = (idx + 1) % len(palette)
        f = (phase * len(palette)) % 1
        c = lerp_color(palette[idx], palette[nxt], f)
        for t in tripars:
            t.color(*c)
        t_now = time.time()
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
    last_step = time.time()

    while not stop.is_set():
        if time.time() - last_step > 0.1:
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
            last_step = time.time()
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
    last_swap = time.time()
    swap_state = 0

    while not stop.is_set():
        if time.time() - last_swap > 1.4:
            swap_state = 1 - swap_state
            if swap_state == 0:
                pi = (pi + 1) % len(palette)
            last_swap = time.time()
        c1, c2 = palette[pi]
        for i, t in enumerate(tripars):
            t.color(*(c1 if (i % 2) == swap_state else c2))
        t_now = time.time()
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

    pos = 0.0  # fractional position in the ring, 0..len(ring)
    speed = 1 / 0.18  # one tripar every 180 ms
    last = time.time()
    while not stop.is_set():
        now = time.time()
        pos = (pos + speed * (now - last)) % len(ring)
        last = now
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
        t_now = time.time()
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
    last_step = time.time()
    direction = 1
    line = list(stage) + [None] * len(groot)  # tripar idx or None for Groot slot

    while not stop.is_set():
        if time.time() - last_step > 0.10:
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
            last_step = time.time()
        # heads sweep side-to-side
        t_now = time.time()
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
        t_now = time.time()
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
    last_rot = time.time()

    while not stop.is_set():
        if time.time() - last_rot > 0.85:
            rotation = (rotation + 1) % len(ring)
            last_rot = time.time()
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
        t_now = time.time()
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
        t_now = time.time()
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
        t_now = time.time()
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
    last_change = time.time()
    last_beat = -1

    while not stop.is_set():
        t_now = time.time()
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

        if t_now - last_change > 4.0:
            pi = (pi + 1) % len(palette)
            last_change = t_now

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
        t_now = time.time()
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
        t_now = time.time()
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
    speed = 9.0  # ring positions per second
    chase_pos = 0.0
    last_t = time.time()

    while not stop.is_set():
        now = time.time()
        chase_pos = (chase_pos + speed * (now - last_t)) % n
        last_t = now

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
        t_now = time.time()
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
        t_now = time.time()
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
    cycle = 1.4

    for h in focus + groot:
        h.color("white")

    while not stop.is_set():
        t_now = time.time()
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

SCENES: list[tuple[str, str, Tempo, Scene]] = [
    # ---- SLOW (atmospheric) ----
    ("breathe",     "Breathe",       "slow",   scene_breathe),
    ("drift",       "Drift",         "slow",   scene_drift),
    ("ember",       "Ember",         "slow",   scene_ember),
    ("ocean",       "Ocean",         "slow",   scene_ocean),
    ("sunset",      "Sunset",        "slow",   scene_sunset),
    ("crowd_glow",  "Crowd glow",    "slow",   scene_crowd_glow),

    # ---- MEDIUM (groove) ----
    ("groove",       "Groove",        "medium", scene_groove),
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

    # ---- INSANE (peak) ----
    ("drop",        "Drop",          "insane", scene_drop),
    ("climax",      "Climax",        "insane", scene_climax),
    ("glitch",      "Glitch",        "insane", scene_glitch),
    ("supernova",   "Supernova",     "insane", scene_supernova),
]

SCENE_BY_KEY: dict[str, tuple[str, Tempo, Scene]] = {
    k: (label, tempo, fn) for k, label, tempo, fn in SCENES
}
