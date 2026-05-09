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

from dmx import Universe
from rig import PORT, Rig, build_rig, fixture_ids
from scenes import SCENES, SCENE_BY_KEY

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


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _universe, _rig
    _universe = Universe(PORT)
    _universe.start()
    _rig = build_rig(_universe)
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
    if _scene_thread is not None and _scene_thread.is_alive():
        _scene_stop.set()
        _scene_thread.join(timeout=timeout)
    _scene_thread = None
    _current_scene = None


def _spawn_scene(key: str) -> None:
    """Cancel any current scene and start a new looping one."""
    global _scene_thread, _scene_stop, _current_scene
    assert _rig is not None
    _stop_current_scene()
    _, fn = SCENE_BY_KEY[key]
    _scene_stop = threading.Event()
    stop = _scene_stop

    def run():
        global _current_scene
        try:
            fn(_rig.tripars, _rig.focus, _rig.groot, stop)
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
    assert _rig is not None
    _rig.fog.output(level.level)
    return {"ok": True}


@app.post("/fog/puff")
def fog_puff():
    """Full output for 3 seconds, then off."""
    assert _rig is not None
    fog = _rig.fog

    def burst():
        fog.output(255)
        time.sleep(3.0)
        fog.output(0)

    _spawn_oneoff(burst, "fog-puff")
    return {"ok": True}


@app.post("/fog/off")
def fog_off():
    assert _rig is not None
    _rig.fog.output(0)
    return {"ok": True}


# ----- endpoints: scenes -----

@app.get("/api/scenes")
def list_scenes():
    """Built-in scenes + saved patterns.

    Patterns appear as keys "pattern:<name>"; the front-end can show
    them grouped if it cares about the prefix.
    """
    items = [{"key": k, "label": label, "kind": "scene"}
             for k, label, _ in SCENES]
    for name in sorted(_load_patterns()):
        if name.startswith("__"):  # hide auto-saved ad-hoc patterns
            continue
        items.append({"key": f"pattern:{name}", "label": name, "kind": "pattern"})
    return {"scenes": items, "running": _current_scene}


# /scene/stop must be declared BEFORE /scene/{key},
# otherwise FastAPI matches "stop" as a dynamic key and 404s.
@app.post("/scene/stop")
def stop_scene():
    _stop_current_scene()
    return {"ok": True}


@app.post("/scene/{key:path}")
def run_scene(key: str):
    """Dispatch a scene key. Built-in scenes go to the registry; keys
    of the form `pattern:<name>` look up a saved pattern and play it."""
    if key in SCENE_BY_KEY:
        _spawn_scene(key)
        return {"ok": True, "scene": key}
    if key.startswith("pattern:"):
        name = key.split(":", 1)[1]
        patterns = _load_patterns()
        if name not in patterns:
            raise HTTPException(404, f"pattern {name!r} not found")
        _spawn_pattern(name, patterns[name])
        return {"ok": True, "scene": key}
    raise HTTPException(404, f"unknown scene {key!r}")


# ----- master -----

@app.post("/blackout")
def blackout():
    """Stop any running scene, then black out every fixture."""
    assert _rig is not None
    _stop_current_scene()
    for t in _rig.tripars:
        t.off()
    for h in _rig.heads:
        h.blackout()
    _rig.atomic.blackout()
    _rig.fog.output(0)
    return {"ok": True}


# ----- layout editor -----

DEFAULT_LAYOUT: dict[str, dict[str, float]] = {
    # Tripars in two rows of 6 across the front of the stage
    **{f"tripar-{i + 1}": {"x": 0.05 + (i % 6) * 0.16, "y": 0.62 + (i // 6) * 0.18}
       for i in range(12)},
    # Focus Spots on a top truss
    **{f"focus-{i + 1}": {"x": 0.10 + i * 0.25, "y": 0.10}
       for i in range(4)},
    # MS Zoom 250 (Groot) on a mid truss
    **{f"groot-{i + 1}": {"x": 0.20 + i * 0.30, "y": 0.30}
       for i in range(3)},
    "atomic": {"x": 0.85, "y": 0.10},
    "fog":    {"x": 0.05, "y": 0.95},
}


def _load_layout() -> dict:
    if LAYOUT_PATH.exists():
        try:
            return json.loads(LAYOUT_PATH.read_text())
        except json.JSONDecodeError:
            pass
    return DEFAULT_LAYOUT


@app.get("/api/rig")
def get_rig():
    return {"fixtures": fixture_ids()}


@app.get("/api/state")
def get_state():
    """Live fixture state for the visualizer (polled by /viz)."""
    if _rig is None:
        return {"running_scene": None, "tripars": [], "focus": [], "groot": [],
                "atomic": {}, "fog": 0}
    return {
        "running_scene": _current_scene,
        "tripars": [{"id": f"tripar-{i + 1}", **t.state}
                    for i, t in enumerate(_rig.tripars)],
        "focus":   [{"id": f"focus-{i + 1}",  **h.state}
                    for i, h in enumerate(_rig.focus)],
        "groot":   [{"id": f"groot-{i + 1}",  **h.state}
                    for i, h in enumerate(_rig.groot)],
        "atomic":  _rig.atomic.state,
        "fog":     _rig.fog.state["level"],
    }


@app.get("/api/layout")
def get_layout():
    return _load_layout()


@app.post("/api/layout")
def save_layout(layout: dict):
    LAYOUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    LAYOUT_PATH.write_text(json.dumps(layout, indent=2, sort_keys=True))
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


def _play_pattern_loop(rig: Rig, stop: threading.Event, pattern: dict) -> None:
    """Step through a tripar pattern indefinitely, one row per tripar."""
    tracks = pattern.get("tracks", {})       # {tripar-1: [[r,g,b], ...], ...}
    step_ms = max(20, int(pattern.get("step_ms", 200)))
    n_steps = max((len(v) for v in tracks.values()), default=0)
    if n_steps == 0:
        # nothing to play; just hold dark
        for t in rig.tripars:
            t.off()
        while not stop.is_set():
            time.sleep(0.1)
        return

    for t in rig.tripars:
        t.enable()

    step = 0
    period = step_ms / 1000.0
    while not stop.is_set():
        for tripar_id, colors in tracks.items():
            try:
                idx = int(tripar_id.split("-")[1]) - 1
            except (ValueError, IndexError):
                continue
            if not (0 <= idx < len(rig.tripars)):
                continue
            if not colors:
                continue
            r, g, b = colors[step % len(colors)]
            rig.tripars[idx].color(r, g, b)
        if stop.wait(period):
            return
        step += 1


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
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
