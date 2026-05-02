"""Looping scenes for the rig — Tripars + moving heads only.

Each scene takes (tripars, focus, groot, stop) where `stop` is a
threading.Event. Scenes loop forever and exit promptly when stop is set.
Atomic and Fog are intentionally NOT touched here — they're driven
manually from the UI.
"""

from __future__ import annotations

import colorsys
import math
import random
import threading
import time

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

def scene_1_atmosphere(tripars, focus, groot, stop: threading.Event) -> None:
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


def scene_2_sunrise(tripars, focus, groot, stop: threading.Event) -> None:
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


def scene_3_chase(tripars, focus, groot, stop: threading.Event) -> None:
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


def scene_4_rainbow(tripars, focus, groot, stop: threading.Event) -> None:
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


def scene_5_buildup(tripars, focus, groot, stop: threading.Event) -> None:
    """Cyclic energy ramp: builds up over 15s then resets, on repeat."""
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


def scene_6_drop(tripars, focus, groot, stop: threading.Event) -> None:
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
        pan = int(128 + 100 * math.sin(t_now * 1.2))
        tilt = int(128 + 60 * math.cos(t_now * 1.7))
        for h in focus + groot:
            h.position(pan, tilt)
        time.sleep(1 / 40)


def scene_7_calm(tripars, focus, groot, stop: threading.Event) -> None:
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


def scene_8_disco(tripars, focus, groot, stop: threading.Event) -> None:
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


def scene_9_climax(tripars, focus, groot, stop: threading.Event) -> None:
    _ensure_visible(tripars, focus, groot)
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


def scene_10_fade(tripars, focus, groot, stop: threading.Event) -> None:
    """Fade to black, then hold dark until interrupted."""
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


def scene_11_beam_sweep(tripars, focus, groot, stop: threading.Event) -> None:
    """Heads sweep: position horizontal, turn on, tilt down, turn off, return."""
    _ensure_visible(tripars, focus, groot)
    for t in tripars:
        t.color(40, 20, 60)  # soft purple backdrop
    for h in focus:
        h._set("pan_tilt_speed", 0)
        h.color("white"); h.gobo("open")
    for h in groot:
        h._set("speed", 0)
        h.color("white")

    HORIZONTAL = 32
    DOWN = 200

    while not stop.is_set():
        # 1. move silently to horizontal
        for h in focus + groot:
            h.shutter("closed")
            h.position(128, HORIZONTAL)
        if stop.wait(0.9):
            return
        # 2. turn on at horizontal
        for h in focus + groot:
            h.shutter("open")
            h.dim(255)
        if stop.wait(0.4):
            return
        # 3. animated sweep down
        steps = 20
        for i in range(1, steps + 1):
            if stop.is_set():
                return
            f = i / steps
            tilt = int(HORIZONTAL + (DOWN - HORIZONTAL) * f)
            for h in focus + groot:
                h.position(128, tilt)
            time.sleep(1.1 / steps)
        # 4. turn off at down
        for h in focus + groot:
            h.shutter("closed")
        if stop.wait(0.35):
            return


def scene_12_police(tripars, focus, groot, stop: threading.Event) -> None:
    """Red/blue alternating flash — tripars and heads in sync."""
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
            last = time.time()
        time.sleep(1 / 60)


def scene_13_fire(tripars, focus, groot, stop: threading.Event) -> None:
    """Flickering warm reds/oranges on tripars; heads slowly drift."""
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


def scene_14_ocean(tripars, focus, groot, stop: threading.Event) -> None:
    """Blue/teal waves on tripars; heads drift slowly."""
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


def scene_15_sunset(tripars, focus, groot, stop: threading.Event) -> None:
    """Slow drift through warm to cool palette, looping."""
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


def scene_16_wipe(tripars, focus, groot, stop: threading.Event) -> None:
    """Color wipes across the tripars left-right-left-right..."""
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


def scene_17_stars(tripars, focus, groot, stop: threading.Event) -> None:
    """Random twinkles — random tripars flash white briefly on a deep blue bed."""
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


def scene_18_evenodd(tripars, focus, groot, stop: threading.Event) -> None:
    """Even/odd Tripars hold contrasting colors; swap periodically."""
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
