"""FastAPI control panel for the rig.

Run: uv run python app.py
Open: http://localhost:8000/  (or your LAN IP for phone access)
"""

import threading
import time
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from dmx import Universe
from fixtures import Atomic, FocusSpotTwo, Fog, MegaTripar, MSZoom250
from scenes import (
    scene_1_atmosphere,
    scene_2_sunrise,
    scene_3_chase,
    scene_4_rainbow,
    scene_5_buildup,
    scene_6_drop,
    scene_7_calm,
    scene_8_disco,
    scene_9_climax,
    scene_10_fade,
    scene_11_beam_sweep,
    scene_12_police,
    scene_13_fire,
    scene_14_ocean,
    scene_15_sunset,
    scene_16_wipe,
    scene_17_stars,
    scene_18_evenodd,
)

PORT = "/dev/cu.usbserial-BG03CYC2"

FOCUS_ADDRS = [110, 128, 146, 164]
GROOT_ADDRS = [182, 198, 214]

# global state, initialized in lifespan
_universe: Universe | None = None
_tripars: list[MegaTripar] = []
_focus: list[FocusSpotTwo] = []
_groot: list[MSZoom250] = []
_atomic: Atomic | None = None
_fog: Fog | None = None
_scene_thread: threading.Thread | None = None
_scene_stop: threading.Event = threading.Event()
_current_scene: str | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _universe, _tripars, _focus, _groot, _atomic, _fog
    _universe = Universe(PORT)
    _universe.start()
    _tripars = [
        MegaTripar(start_address=1 + i * 6, name=f"Tripar {i + 1}")
        for i in range(12)
    ]
    _focus = [
        FocusSpotTwo(start_address=a, name=f"Focus {i + 1}")
        for i, a in enumerate(FOCUS_ADDRS)
    ]
    _groot = [
        MSZoom250(start_address=a, name=f"Groot {i + 1}")
        for i, a in enumerate(GROOT_ADDRS)
    ]
    _atomic = Atomic(start_address=100, name="Atomic")
    _fog = Fog(start_address=500, name="Fog")
    _universe.add(*_tripars, *_focus, *_groot, _atomic, _fog)

    for t in _tripars:
        t.enable()
    for h in _focus:
        h.home()
    for h in _groot:
        h.home()
    _atomic.blackout()
    _fog.output(0)
    try:
        yield
    finally:
        _stop_current_scene()
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


# ----- scene registry -----

# (key, label, scene_fn) — scenes loop forever until stop_event is set.
SCENES: list[tuple[str, str, callable]] = [
    ("atmosphere", "Atmosphere", scene_1_atmosphere),
    ("sunrise",    "Sunrise",    scene_2_sunrise),
    ("chase",      "Chase",      scene_3_chase),
    ("rainbow",    "Rainbow",    scene_4_rainbow),
    ("buildup",    "Buildup",    scene_5_buildup),
    ("drop",       "Drop",       scene_6_drop),
    ("calm",       "Calm",       scene_7_calm),
    ("disco",      "Disco",      scene_8_disco),
    ("climax",     "Climax",     scene_9_climax),
    ("fade",       "Fade out",   scene_10_fade),
    ("beam_sweep", "Beam sweep", scene_11_beam_sweep),
    ("police",     "Police",     scene_12_police),
    ("fire",       "Fire",       scene_13_fire),
    ("ocean",      "Ocean",      scene_14_ocean),
    ("sunset",     "Sunset",     scene_15_sunset),
    ("wipe",       "Wipe",       scene_16_wipe),
    ("stars",      "Stars",      scene_17_stars),
    ("evenodd",    "Even/Odd",   scene_18_evenodd),
]
SCENE_BY_KEY = {k: (label, fn) for k, label, fn in SCENES}


def _stop_current_scene(timeout: float = 2.0) -> None:
    """Signal the running scene to exit and wait for it to actually finish."""
    global _scene_thread, _current_scene
    if _scene_thread is not None and _scene_thread.is_alive():
        _scene_stop.set()
        _scene_thread.join(timeout=timeout)
    _scene_thread = None
    _current_scene = None


def _spawn_scene(key: str) -> None:
    """Cancel any current scene and start a new looping one."""
    global _scene_thread, _scene_stop, _current_scene
    _stop_current_scene()
    _, fn = SCENE_BY_KEY[key]
    _scene_stop = threading.Event()
    stop = _scene_stop

    def run():
        global _current_scene
        try:
            fn(_tripars, _focus, _groot, stop)
        finally:
            if _current_scene == key:
                _current_scene = None

    _current_scene = key
    _scene_thread = threading.Thread(target=run, daemon=True, name=f"scene-{key}")
    _scene_thread.start()


def _spawn_oneoff(target: callable, name: str) -> None:
    """Run a small one-off action in a daemon thread (e.g. fog puff)."""
    threading.Thread(target=target, daemon=True, name=name).start()


# ----- endpoints: tripars -----

@app.post("/tripars/color")
def all_color(color: Color):
    for t in _tripars:
        t.color(color.r, color.g, color.b, color.w)
    return {"ok": True}


@app.post("/tripars/dim")
def all_dim(level: Level):
    for t in _tripars:
        t.dim(level.level)
    return {"ok": True}


# ----- endpoints: atomic -----

@app.post("/atomic/flash")
def atomic_flash():
    """Single short flash."""
    def fire():
        _atomic.intensity(255); _atomic.duration(80); _atomic.rate(0); _atomic.effect("none")
        time.sleep(0.15)
        _atomic.intensity(0)
    _spawn_oneoff(fire, "atomic-flash")
    return {"ok": True}


@app.post("/atomic/strobe_slow")
def atomic_strobe_slow():
    _atomic.strobe(intensity=255, rate=60, duration=140)
    return {"ok": True}


@app.post("/atomic/strobe_fast")
def atomic_strobe_fast():
    _atomic.strobe(intensity=255, rate=220, duration=60)
    return {"ok": True}


@app.post("/atomic/lightning")
def atomic_lightning():
    _atomic.intensity(255); _atomic.duration(128); _atomic.rate(0); _atomic.effect("lightning")
    return {"ok": True}


@app.post("/atomic/off")
def atomic_off():
    _atomic.blackout()
    return {"ok": True}


# ----- endpoints: fog -----

@app.post("/fog/level")
def fog_level(level: Level):
    _fog.output(level.level)
    return {"ok": True}


@app.post("/fog/puff")
def fog_puff():
    """Full output for 3 seconds, then off."""
    def burst():
        _fog.output(255)
        time.sleep(3.0)
        _fog.output(0)
    _spawn_oneoff(burst, "fog-puff")
    return {"ok": True}


@app.post("/fog/off")
def fog_off():
    _fog.output(0)
    return {"ok": True}


# ----- endpoints: scenes -----

@app.get("/scenes")
def list_scenes():
    return {
        "scenes": [{"key": k, "label": label} for k, label, _ in SCENES],
        "running": _current_scene,
    }


# Note: /scene/stop must be declared BEFORE /scene/{key},
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


# ----- master / blackout -----

@app.post("/blackout")
def blackout():
    """Stop any running scene, then black out every fixture."""
    _stop_current_scene()
    for t in _tripars:
        t.off()
    for h in _focus:
        h.blackout()
    for h in _groot:
        h.blackout()
    _atomic.blackout()
    _fog.output(0)
    return {"ok": True}


# ----- UI -----

INDEX_HTML = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>soos-lights</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #0a0a0c;
    --card: #16161a;
    --card-2: #1f1f25;
    --line: #2a2a30;
    --text: #f4f4f6;
    --muted: #8a8a94;
    --accent: #6c8eff;
    --warn: #ff9a3c;
    --danger: #ff4d6a;
    --ok: #51cf66;
    --shadow: 0 8px 32px rgba(0,0,0,.4);
  }
  * { box-sizing: border-box; }
  html, body { background: var(--bg); }
  body {
    font-family: -apple-system, system-ui, "Segoe UI", Roboto, sans-serif;
    margin: 0; padding: 20px 16px 120px; color: var(--text);
    max-width: 760px; margin: 0 auto;
    -webkit-font-smoothing: antialiased;
  }
  header {
    display: flex; align-items: baseline; justify-content: space-between;
    margin-bottom: 24px;
  }
  h1 { margin: 0; font-weight: 700; font-size: 28px; letter-spacing: -.02em; }
  .status {
    font-size: 12px; color: var(--muted); display: flex; align-items: center; gap: 6px;
  }
  .status .dot {
    width: 8px; height: 8px; border-radius: 50%; background: var(--ok);
    box-shadow: 0 0 8px var(--ok);
  }
  .status.running .dot { background: var(--accent); box-shadow: 0 0 8px var(--accent); animation: pulse 1.2s infinite; }
  @keyframes pulse { 50% { opacity: .35; } }

  section {
    background: var(--card); padding: 18px 20px; border-radius: 16px;
    margin-bottom: 14px; border: 1px solid var(--line);
  }
  section.special-atomic {
    background: linear-gradient(135deg, #2a1410, #1a0d0c);
    border-color: #4a2418;
  }
  section.special-fog {
    background: linear-gradient(135deg, #14202a, #0d1118);
    border-color: #1f3548;
  }

  h2 {
    margin: 0 0 14px; font-size: 11px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 1.2px; color: var(--muted);
  }

  .row { display: flex; align-items: center; gap: 14px; margin: 12px 0; }
  label { min-width: 64px; font-size: 14px; color: var(--muted); }
  .value { min-width: 44px; text-align: right; font-variant-numeric: tabular-nums;
           font-size: 13px; color: var(--muted); }

  input[type=color] {
    width: 56px; height: 44px; border: 1px solid var(--line);
    background: transparent; cursor: pointer; border-radius: 10px; padding: 4px;
  }

  input[type=range] {
    flex: 1; -webkit-appearance: none; appearance: none;
    background: transparent; height: 32px; cursor: pointer;
  }
  input[type=range]::-webkit-slider-runnable-track {
    height: 6px; background: var(--card-2); border-radius: 3px;
  }
  input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 22px; height: 22px; border-radius: 50%;
    background: var(--text); margin-top: -8px;
    box-shadow: 0 2px 6px rgba(0,0,0,.5);
  }
  input[type=range]::-moz-range-track { height: 6px; background: var(--card-2); border-radius: 3px; }
  input[type=range]::-moz-range-thumb {
    width: 22px; height: 22px; border-radius: 50%; background: var(--text); border: none;
  }

  .grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 10px;
  }
  .grid.tight { grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); }

  button {
    background: var(--card-2); color: var(--text);
    border: 1px solid var(--line); padding: 14px 12px;
    border-radius: 12px; font-size: 14px; font-weight: 500;
    cursor: pointer; transition: all .15s ease;
    min-height: 50px;
    -webkit-tap-highlight-color: transparent;
  }
  button:hover { background: #2a2a32; transform: translateY(-1px); }
  button:active { transform: translateY(0); }
  button.running { background: var(--accent); color: #000; border-color: var(--accent); }

  button.atomic {
    background: linear-gradient(180deg, #3a1f18, #2a1612);
    border-color: #5a2c20;
  }
  button.atomic:hover { background: linear-gradient(180deg, #4a2820, #3a1c18); }
  button.atomic-fire {
    background: linear-gradient(180deg, var(--warn), #d97a2c);
    border-color: var(--warn); color: #1a0d04; font-weight: 700;
  }

  button.fog-puff {
    background: linear-gradient(180deg, #2c4860, #1a2c40);
    border-color: #3a6080; color: #cfe4f5; font-weight: 700;
    grid-column: span 2;
  }

  .blackout-bar {
    position: fixed; left: 0; right: 0; bottom: 0;
    padding: 14px 16px env(safe-area-inset-bottom, 14px);
    background: linear-gradient(0deg, var(--bg), rgba(10,10,12,0));
    pointer-events: none;
  }
  .blackout-bar > div { max-width: 760px; margin: 0 auto; pointer-events: auto; }
  button.blackout {
    width: 100%;
    background: linear-gradient(180deg, var(--danger), #c93750);
    border-color: var(--danger); color: white; font-weight: 700;
    font-size: 16px; min-height: 56px;
    box-shadow: 0 8px 24px rgba(255,77,106,.25);
  }
  button.blackout:hover { background: linear-gradient(180deg, #ff5c75, #d23e58); }

  .toast {
    position: fixed; left: 50%; top: 24px; transform: translateX(-50%);
    background: var(--card-2); border: 1px solid var(--line);
    padding: 10px 16px; border-radius: 10px; font-size: 13px;
    opacity: 0; pointer-events: none; transition: opacity .2s;
    z-index: 100; box-shadow: var(--shadow);
  }
  .toast.show { opacity: 1; }
  .toast.error { background: #2a1418; border-color: var(--danger); color: #ffb8c4; }
</style>
</head>
<body>
  <header>
    <h1>soos-lights</h1>
    <div class="status" id="status"><span class="dot"></span><span id="statusText">Ready</span></div>
  </header>

  <section>
    <h2>All Tripars</h2>
    <div class="row">
      <label for="color">Color</label>
      <input type="color" id="color" value="#ffffff">
      <span class="value" id="colorval">#ffffff</span>
    </div>
    <div class="row">
      <label for="white">White</label>
      <input type="range" id="white" min="0" max="255" value="0">
      <span class="value" id="whiteval">0</span>
    </div>
    <div class="row">
      <label for="dim">Dimmer</label>
      <input type="range" id="dim" min="0" max="255" value="255">
      <span class="value" id="dimval">255</span>
    </div>
  </section>

  <section class="special-atomic">
    <h2>Atomic</h2>
    <div class="grid tight">
      <button class="atomic-fire" onclick="post('/atomic/flash')">FLASH</button>
      <button class="atomic" onclick="post('/atomic/strobe_slow')">Slow strobe</button>
      <button class="atomic" onclick="post('/atomic/strobe_fast')">Fast strobe</button>
      <button class="atomic" onclick="post('/atomic/lightning')">Lightning</button>
      <button class="atomic" onclick="post('/atomic/off')">Off</button>
    </div>
  </section>

  <section class="special-fog">
    <h2>Fog</h2>
    <div class="row">
      <label for="fog">Level</label>
      <input type="range" id="fog" min="0" max="255" value="0">
      <span class="value" id="fogval">0</span>
    </div>
    <div class="grid tight">
      <button class="fog-puff" onclick="post('/fog/puff')">PUFF (3s)</button>
      <button onclick="(()=>{ $('fog').value=0; $('fogval').textContent=0; post('/fog/off'); })()">Off</button>
    </div>
  </section>

  <section>
    <h2>Scenes <span style="float:right;font-weight:400;text-transform:none;letter-spacing:0;font-size:11px;opacity:.6">tap to start, tap running to stop</span></h2>
    <div class="grid" id="scenes"></div>
  </section>

  <div class="blackout-bar">
    <div>
      <button class="blackout" onclick="post('/blackout')">BLACKOUT</button>
    </div>
  </div>

  <div class="toast" id="toast"></div>

<script>
const $ = (id) => document.getElementById(id);

function showToast(msg, kind) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show' + (kind === 'error' ? ' error' : '');
  clearTimeout(showToast._h);
  showToast._h = setTimeout(() => { t.className = 'toast'; }, 2200);
}

async function post(path, body) {
  try {
    const r = await fetch(path, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: body ? JSON.stringify(body) : '{}',
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      showToast(err.detail || `${r.status}: ${path}`, 'error');
    }
    return r;
  } catch (e) {
    showToast(`network: ${e.message}`, 'error');
  }
}

function throttle(fn, ms) {
  let last = 0, pending = null, args;
  return (...a) => {
    args = a;
    const now = Date.now();
    if (now - last >= ms) { last = now; fn(...args); }
    else if (!pending) {
      pending = setTimeout(() => {
        last = Date.now(); pending = null; fn(...args);
      }, ms - (now - last));
    }
  };
}

function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

let curW = 0, curDim = 255;

const sendColor = throttle(() => {
  const { r, g, b } = hexToRgb($('color').value);
  post('/tripars/color', { r, g, b, w: curW });
}, 60);
const sendDim = throttle(() => post('/tripars/dim', { level: curDim }), 60);
const sendFog = throttle((v) => post('/fog/level', { level: v }), 60);

$('color').addEventListener('input', () => { $('colorval').textContent = $('color').value; sendColor(); });
$('white').addEventListener('input', () => { curW = +$('white').value; $('whiteval').textContent = curW; sendColor(); });
$('dim').addEventListener('input', () => { curDim = +$('dim').value; $('dimval').textContent = curDim; sendDim(); });
$('fog').addEventListener('input', () => { const v = +$('fog').value; $('fogval').textContent = v; sendFog(v); });

// load scenes from server and render buttons
async function loadScenes() {
  try {
    const r = await fetch('/scenes');
    const data = await r.json();
    const grid = $('scenes');
    grid.innerHTML = '';
    for (const s of data.scenes) {
      const b = document.createElement('button');
      b.dataset.key = s.key;
      b.textContent = s.label;
      b.onclick = async () => {
        // toggle: tapping the running scene stops it
        const path = b.classList.contains('running') ? '/scene/stop' : `/scene/${s.key}`;
        await post(path);
        updateStatus();
      };
      grid.appendChild(b);
    }
    updateStatus(data.running);
  } catch (e) {
    showToast(`failed to load scenes: ${e.message}`, 'error');
  }
}

async function updateStatus(known) {
  let running = known;
  if (running === undefined) {
    try { running = (await (await fetch('/scenes')).json()).running; } catch {}
  }
  const sEl = $('status'), txt = $('statusText');
  if (running) {
    sEl.classList.add('running');
    txt.textContent = `Running: ${running}`;
  } else {
    sEl.classList.remove('running');
    txt.textContent = 'Ready';
  }
  document.querySelectorAll('#scenes button').forEach((b) => {
    b.classList.toggle('running', b.dataset.key === running);
  });
}

loadScenes();
setInterval(updateStatus, 2000);
</script>
</body>
</html>
"""


@app.get("/", response_class=HTMLResponse)
def index():
    return INDEX_HTML


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
