"""FastAPI control panel for the rig.

Run: uv run python app.py
Open: http://localhost:8000/  (or your LAN IP for phone access)
"""

import asyncio
import json
import threading
import time
import traceback
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from beat import BeatClock
from dmx import Universe
from rig import PORT, Rig, build_rig, fixture_ids
from scenes import SCENES, SCENE_BY_KEY, set_clock
from vj import EFFECTS, HOLDS, RATES, VJ

ROOT = Path(__file__).parent
WEB_DIST = ROOT / "web" / "dist"
LAYOUT_PATH = ROOT / "state" / "layout.json"
PATTERNS_PATH = ROOT / "state" / "patterns.json"

# global state, initialized in lifespan
_universe: Universe | None = None
_rig: Rig | None = None
_scene_thread: threading.Thread | None = None
_scene_stop: threading.Event = threading.Event()
_current_scene: str | None = None
# Held across stop-old + start-new so two requests arriving together (two
# phones, a double tap) can't both start a scene and orphan one of them —
# an orphaned scene keeps writing forever and overlaps the new one.
_scene_lock = threading.RLock()
# Fog level the operator asked for; a puff returns to this afterwards.
_fog_level = 0
_fog_puff_gen = 0
_fog_lock = threading.Lock()
# Bumped on every layout/pattern save so all connected browsers refetch.
_revs = {"layout": 0, "patterns": 0}
# Shared tempo (tap / mic) and the VJ effects layer on top of the scenes.
_clock = BeatClock()
set_clock(_clock)        # scenes follow the shared tempo too
_vj: VJ | None = None
_queued_scene: str | None = None          # scene waiting for the next bar
_queued_timer: threading.Timer | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _universe, _rig, _vj
    _universe = Universe(PORT)
    _universe.start()
    _rig = build_rig(_universe)
    _vj = VJ(_rig, _clock)
    _universe.output_filter = _vj.apply
    try:
        yield
    finally:
        _stop_current_scene()
        if _universe is not None:
            _universe.stop()


app = FastAPI(lifespan=lifespan, title="soos-lights")


# ----- request models -----

class Color(BaseModel):
    r: Annotated[int, Field(ge=0, le=255)] = 0
    g: Annotated[int, Field(ge=0, le=255)] = 0
    b: Annotated[int, Field(ge=0, le=255)] = 0
    w: Annotated[int, Field(ge=0, le=255)] = 0


class Level(BaseModel):
    level: Annotated[int, Field(ge=0, le=255)]


# ----- scene runner -----

def _stop_current_scene(timeout: float = 2.0) -> None:
    """Signal the running scene to exit and wait for it to finish."""
    global _scene_thread, _current_scene
    with _scene_lock:
        if _scene_thread is not None and _scene_thread.is_alive():
            _scene_stop.set()
            _scene_thread.join(timeout=timeout)
            if _scene_thread.is_alive():
                print(f"[scene] {_scene_thread.name} did not stop within {timeout}s")
        _scene_thread = None
        _current_scene = None


def _spawn_scene(key: str) -> None:
    """Cancel any current scene and start a new looping one."""
    global _scene_thread, _scene_stop, _current_scene
    assert _rig is not None
    with _scene_lock:
        _stop_current_scene()
        _label, _tempo, fn = SCENE_BY_KEY[key]
        _scene_stop = threading.Event()
        stop = _scene_stop

        def run():
            global _current_scene
            try:
                fn(_rig, stop)
            except Exception as e:
                print(f"[scene-{key}] CRASHED: {e!r}")
                traceback.print_exc()
            finally:
                if _current_scene == key:
                    _current_scene = None

        _current_scene = key
        _scene_thread = threading.Thread(target=run, daemon=True, name=f"scene-{key}")
        _scene_thread.start()


def _spawn_oneoff(target, name: str) -> None:
    """Run a small one-off action in a daemon thread (e.g. fog puff)."""
    threading.Thread(target=target, daemon=True, name=name).start()


# ----- endpoints: tripars -----

@app.post("/tripars/color")
def all_color(color: Color):
    assert _rig is not None
    for t in _rig.tripars:
        t.color(color.r, color.g, color.b, color.w)
    return {"ok": True}


@app.post("/tripars/dim")
def all_dim(level: Level):
    assert _rig is not None
    for t in _rig.tripars:
        t.dim(level.level)
    return {"ok": True}


# ----- endpoints: atomic -----

@app.post("/atomic/flash")
def atomic_flash():
    """Single short flash."""
    assert _rig is not None
    atomic = _rig.atomic

    def fire():
        atomic.intensity(255)
        atomic.duration(80)
        atomic.rate(0)
        atomic.effect("none")
        time.sleep(0.15)
        atomic.intensity(0)

    _spawn_oneoff(fire, "atomic-flash")
    return {"ok": True}


@app.post("/atomic/strobe_slow")
def atomic_strobe_slow():
    assert _rig is not None
    _rig.atomic.strobe(intensity=255, rate=60, duration=140)
    return {"ok": True}


@app.post("/atomic/strobe_fast")
def atomic_strobe_fast():
    assert _rig is not None
    _rig.atomic.strobe(intensity=255, rate=220, duration=60)
    return {"ok": True}


@app.post("/atomic/lightning")
def atomic_lightning():
    assert _rig is not None
    a = _rig.atomic
    a.intensity(255)
    a.duration(128)
    a.rate(0)
    a.effect("lightning")
    return {"ok": True}


@app.post("/atomic/off")
def atomic_off():
    assert _rig is not None
    _rig.atomic.blackout()
    return {"ok": True}


# ----- endpoints: fog -----

@app.post("/fog/level")
def fog_level(level: Level):
    global _fog_level
    assert _rig is not None
    with _fog_lock:
        _fog_level = level.level
        _rig.fog.output(level.level)
    return {"ok": True}


@app.post("/fog/puff")
def fog_puff():
    """Full output for 3 seconds, then back to the slider level.

    Only the newest puff restores, and only if nothing else touched the
    fog meanwhile — otherwise a puff would cut a slider set to 255 to 0.
    """
    global _fog_puff_gen
    assert _rig is not None
    fog = _rig.fog
    with _fog_lock:
        _fog_puff_gen += 1
        gen = _fog_puff_gen
        fog.output(255)

    def burst():
        time.sleep(3.0)
        with _fog_lock:
            if gen == _fog_puff_gen and fog.state["level"] == 255:
                fog.output(_fog_level)

    _spawn_oneoff(burst, "fog-puff")
    return {"ok": True}


@app.post("/fog/off")
def fog_off():
    global _fog_level, _fog_puff_gen
    assert _rig is not None
    with _fog_lock:
        _fog_level = 0
        _fog_puff_gen += 1   # cancel a pending puff restore
        _rig.fog.output(0)
    return {"ok": True}


# ----- spotlight -----

@app.post("/spotlight/on")
def spotlight_on():
    assert _rig is not None
    _rig.spotlight.on()
    return {"ok": True}


@app.post("/spotlight/off")
def spotlight_off():
    assert _rig is not None
    _rig.spotlight.off()
    return {"ok": True}


@app.post("/spotlight/toggle")
def spotlight_toggle():
    assert _rig is not None
    if _rig.spotlight.state["level"] > 0:
        _rig.spotlight.off()
    else:
        _rig.spotlight.on()
    return {"ok": True}


# ----- endpoints: scenes -----

@app.get("/api/scenes")
def list_scenes():
    """Built-in scenes + saved patterns.

    Patterns appear as keys "pattern:<name>"; the front-end can show
    them grouped if it cares about the prefix.
    """
    items = [{"key": k, "label": label, "kind": "scene", "tempo": tempo}
             for k, label, tempo, _ in SCENES]
    for name in sorted(_load_patterns()):
        if name.startswith("__"):  # hide auto-saved ad-hoc patterns
            continue
        items.append({"key": f"pattern:{name}", "label": name, "kind": "pattern", "tempo": "pattern"})
    return {"scenes": items, "running": _current_scene}


# /scene/stop must be declared BEFORE /scene/{key},
# otherwise FastAPI matches "stop" as a dynamic key and 404s.
@app.post("/scene/stop")
def stop_scene():
    _cancel_queued_scene()
    _stop_current_scene()
    return {"ok": True}


@app.post("/scene/{key:path}")
def run_scene(key: str):
    """Dispatch a scene key. Built-in scenes go to the registry; keys
    of the form `pattern:<name>` look up a saved pattern and play it."""
    _cancel_queued_scene()
    _start_scene_key(key)
    return {"ok": True, "scene": key}


def _start_scene_key(key: str) -> None:
    if key in SCENE_BY_KEY:
        _spawn_scene(key)
        return
    if key.startswith("pattern:"):
        name = key.split(":", 1)[1]
        patterns = _load_patterns()
        if name not in patterns:
            raise HTTPException(404, f"pattern {name!r} not found")
        _spawn_pattern(name, patterns[name])
        return
    raise HTTPException(404, f"unknown scene {key!r}")


def _cancel_queued_scene() -> None:
    global _queued_scene, _queued_timer
    with _scene_lock:
        if _queued_timer is not None:
            _queued_timer.cancel()
        _queued_timer = None
        _queued_scene = None


# ----- master -----

@app.post("/blackout")
def blackout():
    """Stop any running scene, then black out every fixture."""
    assert _rig is not None
    _cancel_queued_scene()
    if _vj is not None:
        _vj.release_all()
    _stop_current_scene()
    for t in _rig.tripars:
        t.off()
    for h in _rig.heads:
        h.blackout()
    _rig.atomic.blackout()
    fog_off()
    return {"ok": True}


# ----- VJ: tempo, effects, hold buttons, quantised scene pads -----

class Tap(BaseModel):
    bpm: Annotated[float, Field(ge=40, le=240)] | None = None   # None on the first tap
    index: Annotated[int, Field(ge=0)] = 0                      # position in the tap run
    source: str = "tap"


class Tempo(BaseModel):
    bpm: Annotated[float, Field(ge=40, le=240)] | None = None
    downbeat: bool = False      # now is beat 1
    beat_now: bool = False      # a beat happened now (mic): snap phase
    nudge_ms: Annotated[float, Field(ge=-500, le=500)] | None = None
    sync: bool | None = None    # patterns follow the shared BPM
    source: str | None = None


class VJSettings(BaseModel):
    effects: dict[str, bool] | None = None
    rate: float | None = None
    colour: list[Annotated[int, Field(ge=0, le=255)]] | None = Field(None, min_length=4, max_length=4)
    master: Annotated[int, Field(ge=0, le=255)] | None = None
    quantize: bool | None = None


class Hold(BaseModel):
    name: str
    on: bool


@app.post("/vj/tap")
def vj_tap(tap: Tap):
    _clock.tap(tap.bpm, tap.index, source=tap.source)
    return {"ok": True, "clock": _clock.snapshot()}


@app.post("/vj/tempo")
def vj_tempo(t: Tempo):
    if t.bpm is not None:
        _clock.set_bpm(t.bpm)
    if t.downbeat:
        _clock.downbeat()
    if t.beat_now:
        _clock.beat_now(source=t.source or "mic")
    elif t.source:
        _clock.source = t.source
    if t.nudge_ms:
        _clock.nudge(t.nudge_ms)
    if t.sync is not None:
        _clock.sync = t.sync
    return {"ok": True, "clock": _clock.snapshot()}


@app.post("/vj/settings")
def vj_settings(cfg: VJSettings):
    assert _vj is not None
    if cfg.rate is not None and cfg.rate not in RATES:
        raise HTTPException(422, f"rate must be one of {list(RATES)}")
    if cfg.effects and not set(cfg.effects) <= set(EFFECTS):
        raise HTTPException(422, f"effects must be among {list(EFFECTS)}")
    # `colour: null` clears the override; leaving it out keeps it.
    colour = (tuple(cfg.colour) if cfg.colour else None) if "colour" in cfg.model_fields_set else False
    _vj.configure(effects=cfg.effects, rate=cfg.rate, colour=colour,
                  master=cfg.master, quantize=cfg.quantize)
    return {"ok": True}


@app.post("/vj/hold")
def vj_hold(h: Hold):
    assert _vj is not None
    if h.name not in HOLDS:
        raise HTTPException(422, f"hold must be one of {list(HOLDS)}")
    _vj.hold(h.name, h.on)
    return {"ok": True}


@app.post("/vj/scene/{key:path}")
def vj_scene(key: str):
    """Scene pad. With quantise on, the switch waits for the next bar."""
    global _queued_scene, _queued_timer
    assert _vj is not None
    if key not in SCENE_BY_KEY and not (key.startswith("pattern:")
                                        and key.split(":", 1)[1] in _load_patterns()):
        raise HTTPException(404, f"unknown scene {key!r}")
    _cancel_queued_scene()
    if not _vj.quantize:
        _start_scene_key(key)
        return {"ok": True, "queued": False}

    def fire():
        global _queued_scene, _queued_timer
        with _scene_lock:
            if _queued_scene != key:
                return          # cancelled or replaced meanwhile
            _queued_scene = None
            _queued_timer = None
            _start_scene_key(key)

    with _scene_lock:
        _queued_scene = key
        _queued_timer = threading.Timer(_clock.time_until(_clock.next_bar()), fire)
        _queued_timer.daemon = True
        _queued_timer.start()
    return {"ok": True, "queued": True}


# ----- layout editor -----

DEFAULT_LAYOUT: dict[str, dict[str, float]] = {
    # Tripars in two rows of 6 across the front of the stage
    **{f"tripar-{i + 1}": {"x": 0.05 + (i % 6) * 0.16, "y": 0.62 + (i // 6) * 0.18}
       for i in range(12)},
    # Pinspots along the upper edge
    **{f"pinspot-{i + 1}": {"x": 0.10 + i * 0.10, "y": 0.04}
       for i in range(3)},
    "spotlight": {"x": 0.45, "y": 0.04},
    # Focus Spots on a top truss
    **{f"focus-{i + 1}": {"x": 0.55 + i * 0.10, "y": 0.04}
       for i in range(4)},
    # MS Zoom 250 (Groot) on a mid truss
    **{f"groot-{i + 1}": {"x": 0.20 + i * 0.30, "y": 0.30}
       for i in range(3)},
    "atomic": {"x": 0.95, "y": 0.04},
    "fog":    {"x": 0.05, "y": 0.95},
}


def _load_layout() -> dict:
    """Saved positions override defaults; new fixtures still get a sensible
    starting spot so they don't all stack at (0.5, 0.5)."""
    saved: dict = {}
    if LAYOUT_PATH.exists():
        try:
            saved = json.loads(LAYOUT_PATH.read_text())
        except json.JSONDecodeError:
            pass
    return {**DEFAULT_LAYOUT, **saved}


@app.get("/api/rig")
def get_rig():
    return {"fixtures": fixture_ids()}


def _vj_state() -> dict | None:
    if _vj is None:
        return None
    return {**_vj.snapshot(), "clock": _clock.snapshot(), "queued_scene": _queued_scene}


@app.get("/api/state")
def get_state():
    """Live fixture state for the visualizer."""
    if _rig is None:
        return {
            "running_scene": None, "tripars": [], "pinspots": [],
            "spotlight": 0, "focus": [], "groot": [], "atomic": {}, "fog": 0,
            "fog_level": 0, "revs": _revs, "vj": _vj_state(),
        }
    return {
        "running_scene": _current_scene,
        "tripars":  [{"id": f"tripar-{i + 1}",  **t.state}
                     for i, t in enumerate(_rig.tripars)],
        "pinspots": [{"id": f"pinspot-{i + 1}", **p.state}
                     for i, p in enumerate(_rig.pinspots)],
        "spotlight": _rig.spotlight.state["level"],
        "focus":    [{"id": f"focus-{i + 1}",   **h.state}
                     for i, h in enumerate(_rig.focus)],
        "groot":    [{"id": f"groot-{i + 1}",   **h.state}
                     for i, h in enumerate(_rig.groot)],
        "atomic":   _rig.atomic.state,
        "fog":      _rig.fog.state["level"],
        "fog_level": _fog_level,   # slider setting; `fog` is the live output (255 during a puff)
        "revs":     _revs,
        "vj":       _vj_state(),
    }


@app.get("/api/layout")
def get_layout():
    return _load_layout()


@app.post("/api/layout")
def save_layout(layout: dict):
    LAYOUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    LAYOUT_PATH.write_text(json.dumps(layout, indent=2, sort_keys=True))
    _revs["layout"] += 1
    return {"ok": True}


# ----- live state websocket -----

@app.websocket("/ws/state")
async def ws_state(ws: WebSocket):
    """Push the live fixture state at ~20 Hz to every connected client."""
    await ws.accept()
    try:
        while True:
            await ws.send_json(get_state())
            await asyncio.sleep(1 / 20)
    except WebSocketDisconnect:
        pass


# ----- pattern builder -----

def _load_patterns() -> dict[str, dict]:
    if PATTERNS_PATH.exists():
        try:
            return json.loads(PATTERNS_PATH.read_text())
        except json.JSONDecodeError:
            pass
    return {}


def _save_patterns(patterns: dict[str, dict]) -> None:
    PATTERNS_PATH.parent.mkdir(parents=True, exist_ok=True)
    PATTERNS_PATH.write_text(json.dumps(patterns, indent=2, sort_keys=True))
    _revs["patterns"] += 1


@app.get("/api/patterns")
def list_patterns():
    return {"patterns": _load_patterns()}


@app.post("/api/patterns/{name}")
def save_pattern(name: str, pattern: dict):
    patterns = _load_patterns()
    patterns[name] = pattern
    _save_patterns(patterns)
    return {"ok": True}


@app.delete("/api/patterns/{name}")
def delete_pattern(name: str):
    patterns = _load_patterns()
    patterns.pop(name, None)
    _save_patterns(patterns)
    return {"ok": True}


@app.post("/api/patterns/{name}/play")
def play_pattern(name: str):
    patterns = _load_patterns()
    if name not in patterns:
        raise HTTPException(404, f"pattern {name!r} not found")
    _spawn_pattern(name, patterns[name])
    return {"ok": True}


def _spawn_pattern(name: str, pattern: dict) -> None:
    """Run a saved pattern as a looping scene."""
    global _scene_thread, _scene_stop, _current_scene
    assert _rig is not None
    with _scene_lock:
        _stop_current_scene()
        _scene_stop = threading.Event()
        stop = _scene_stop
        rig = _rig

        def run():
            global _current_scene
            try:
                _play_pattern_loop(rig, stop, pattern)
            except Exception as e:
                print(f"[pattern-{name}] CRASHED: {e!r}")
                traceback.print_exc()
            finally:
                label = f"pattern:{name}"
                if _current_scene == label:
                    _current_scene = None

        _current_scene = f"pattern:{name}"
        _scene_thread = threading.Thread(target=run, daemon=True, name=f"pattern-{name}")
        _scene_thread.start()


# Named position presets used by head .pos tracks.
# (pan, tilt) — both 0..255, with 128 the centre of each axis.
POSITIONS: dict[str, tuple[int, int]] = {
    "center":     (128, 128),
    "up":         (128, 64),
    "down":       (128, 192),
    "left":       (64, 128),
    "right":      (192, 128),
    "up-left":    (64, 64),
    "up-right":   (192, 64),
    "down-left":  (64, 192),
    "down-right": (192, 192),
}


def _play_pattern_loop(rig: Rig, stop: threading.Event, pattern: dict) -> None:
    """Step through a multi-fixture pattern indefinitely.

    Track keys:
      - tripar-N, pinspot-N, spotlight, atomic, fog: RGB cells
      - focus-N, groot-N: RGB cells (the head's main colour row)
      - focus-N.gobo:  gobo-name string cells (FocusSpotTwo)
      - focus-N.pos / groot-N.pos: POSITIONS-name cells

    Cells are RGB triples for colour rows, strings for gobo/pos rows
    (the JSON serialiser carries them as-is). null/None = no change.
    """
    tracks = pattern.get("tracks", {})
    step_ms = max(20, int(pattern.get("step_ms", 200)))
    n_steps = max((len(v) for v in tracks.values()), default=0)
    if n_steps == 0:
        for t in rig.tripars:
            t.off()
        while not stop.is_set():
            time.sleep(0.1)
        return

    # Build {fixture_id: (kind, fixture)} lookup
    fmap: dict[str, tuple[str, object]] = {}
    for i, t in enumerate(rig.tripars):
        fmap[f"tripar-{i + 1}"] = ("tripar", t)
    for i, p in enumerate(rig.pinspots):
        fmap[f"pinspot-{i + 1}"] = ("pinspot", p)
    fmap["spotlight"] = ("spotlight", rig.spotlight)
    for i, h in enumerate(rig.focus):
        fmap[f"focus-{i + 1}"] = ("focus", h)
    for i, h in enumerate(rig.groot):
        fmap[f"groot-{i + 1}"] = ("groot", h)
    fmap["atomic"] = ("atomic", rig.atomic)
    fmap["fog"] = ("fog", rig.fog)

    # Pre-enable so dimmers/shutters are open
    for t in rig.tripars:
        t.enable()
    for h in rig.heads:
        h.shutter("open")
        h.color("white")

    # Steps are 16th notes. With the beat clock synced (someone tapped) the
    # pattern follows the shared BPM; otherwise its own saved step_ms.
    counter = 0
    period = step_ms / 1000.0
    while not stop.is_set():
        if _clock.sync:
            pos = _clock.beats() * 4
            step = int(pos)
            wait = _clock.time_until((step + 1) / 4)
        else:
            step = counter
            wait = period
        for tid, cells in tracks.items():
            if not cells:
                continue
            cell = cells[step % len(cells)]
            if cell is None:
                continue

            # decode the track id into (fixture_id, sub) — e.g.
            #   "focus-1"      -> ("focus-1", None)         colour row
            #   "focus-1.gobo" -> ("focus-1", "gobo")
            #   "groot-2.pos"  -> ("groot-2", "pos")
            if "." in tid:
                fid, sub = tid.rsplit(".", 1)
            else:
                fid, sub = tid, None

            entry = fmap.get(fid)
            if entry is None:
                continue
            kind, fixture = entry
            _apply_cell(kind, fixture, sub, cell)
        if stop.wait(max(0.005, wait)):
            return
        counter += 1


def _apply_cell(kind: str, fixture, sub: str | None, cell) -> None:
    """Apply one cell value to a fixture.

    Colour rows receive an [r, g, b] list; sub-rows receive a string
    (gobo name or position name).
    """
    # ---- gobo / position sub-rows on heads ----
    if sub == "gobo":
        if isinstance(cell, str):
            try:
                fixture.gobo(cell)
            except (AttributeError, ValueError):
                pass
        return
    if sub == "pos":
        if isinstance(cell, str) and cell in POSITIONS:
            pan, tilt = POSITIONS[cell]
            try:
                fixture.position(pan, tilt)
            except AttributeError:
                pass
        return

    # ---- colour rows ----
    if not isinstance(cell, (list, tuple)) or len(cell) < 3:
        return
    r, g, b = int(cell[0]), int(cell[1]), int(cell[2])

    if kind == "tripar":
        fixture.color(r, g, b)
    elif kind == "pinspot":
        fixture.dim(max(r, g, b))
    elif kind == "spotlight":
        fixture.set(bool(r or g or b))
    elif kind in ("focus", "groot"):
        fixture.dim(max(r, g, b))
    elif kind == "atomic":
        v = max(r, g, b)
        if v > 0:
            fixture.intensity(v)
            fixture.duration(80)
            fixture.rate(0)
            fixture.effect("none")
        else:
            fixture.intensity(0)
    elif kind == "fog":
        fixture.output(max(r, g, b))


# ----- SPA fallback (must be registered LAST) -----
# Serves the React build under web/dist for every GET that didn't match
# an API route above. In dev, run `npm run dev` in web/ for HMR — Vite
# proxies /api and /ws to this server.

if WEB_DIST.exists():
    @app.get("/{path:path}")
    async def spa_fallback(path: str):
        candidate = WEB_DIST / path
        if path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(WEB_DIST / "index.html")
else:
    @app.get("/")
    async def no_build():
        return HTMLResponse(
            "<h1>soos-lights</h1>"
            "<p>Frontend isn't built yet. From <code>web/</code>, run:</p>"
            "<pre>npm install && npm run build</pre>"
            "<p>Or for dev: <code>npm run dev</code> in <code>web/</code> "
            "(HMR with proxy back to this server).</p>"
        )


if __name__ == "__main__":
    import os

    import uvicorn
    # The reloader runs the app in a child process; if the parent is killed
    # (closed terminal, SIGKILL) that child can live on as a ghost that still
    # drives the lights. Opt in for development only: DEV=1 python app.py
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=bool(os.environ.get("DEV")))
