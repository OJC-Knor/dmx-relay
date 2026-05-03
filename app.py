"""FastAPI control panel for the rig.

Run: uv run python app.py
Open: http://localhost:8000/  (or your LAN IP for phone access)
"""

import threading
import time
import traceback
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from dmx import Universe
from rig import PORT, Rig, build_rig
from scenes import SCENES, SCENE_BY_KEY

INDEX_PATH = Path(__file__).parent / "templates" / "index.html"

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

@app.get("/scenes")
def list_scenes():
    return {
        "scenes": [{"key": k, "label": label} for k, label, _ in SCENES],
        "running": _current_scene,
    }


# /scene/stop must be declared BEFORE /scene/{key},
# otherwise FastAPI matches "stop" as a dynamic key and 404s.
@app.post("/scene/stop")
def stop_scene():
    _stop_current_scene()
    return {"ok": True}


@app.post("/scene/{key}")
def run_scene(key: str):
    if key not in SCENE_BY_KEY:
        raise HTTPException(404, f"unknown scene {key!r}")
    _spawn_scene(key)
    return {"ok": True, "scene": key}


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


# ----- UI -----

@app.get("/", response_class=HTMLResponse)
def index():
    return INDEX_PATH.read_text()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
