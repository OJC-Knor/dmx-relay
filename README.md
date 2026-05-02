# soos-lights

DMX lighting control for our rig — a Python core, a FastAPI web UI, and a
library of looping scenes. Drives the rig directly through a generic
FTDI-based USB-DMX adapter (DSD Tech) using the OpenDMX raw protocol.

## The rig

| Fixture | Count | DMX | Profile |
|---|---|---|---|
| ADJ Mega Tripar (RGBW, 6Ch) | 12 | 1, 7, …, 67 | `MegaTripar` |
| Pinspots & Spotlight        | 4  | 80–83       | `Pinspot` / `Switch` |
| Martin Atomic 3000 (4Ch)    | 1  | 100         | `Atomic` |
| ADJ Focus Spot Two (18Ch)   | 4  | 110, 128, 146, 164 | `FocusSpotTwo` |
| MS Zoom 250 XT (Mode 1)     | 3  | 182, 198, 214 | `MSZoom250` |
| Fog                         | 1  | 500         | `Fog` |

Full patch + per-fixture notes in [`docs/fixtures.md`](docs/fixtures.md).
Manufacturer manuals in [`manuals/`](manuals/).

## Setup

Requires Python 3.12 and [uv](https://docs.astral.sh/uv/).

```sh
uv sync
```

The DMX adapter shows up as `/dev/cu.usbserial-BG03CYC2` on this Mac.
If yours has a different serial number, update the `PORT` constant at
the top of `app.py` and the test scripts.

## Run the web UI

```sh
uv run python app.py
```

Listens on `0.0.0.0:8000`. Open `http://<mac-ip>:8000` from any device on
the same Wi-Fi (use `ipconfig getifaddr en0` to find the IP).

The UI has:
- **All Tripars** — color picker, white slider, master dimmer
- **Atomic** — single FLASH, slow / fast strobe, lightning, off
- **Fog** — level slider, PUFF (3 s burst), off
- **Scenes** — tap to start a looping scene, tap the running one to stop
- **BLACKOUT** — sticky red bar at the bottom; stops the scene and zeroes everything

## Run individual fixture tests

```sh
uv run python tests/test_tripar.py
uv run python tests/test_focus_spot.py
uv run python tests/test_ms_zoom.py
uv run python tests/test_atomic.py
uv run python tests/test_fog.py
uv run python tests/test_all.py     # everything in sequence
```

## Poke channels by hand

```sh
uv run python tools/interactive.py
> 67 255       # set DMX channel 67 to 255
> 80-83 255    # range
> all 0        # blackout
> show         # dump non-zero channels
> q            # quit (blackout on exit)
```

## Layout

```
.
├── app.py            FastAPI app + embedded HTML UI
├── dmx.py            Universe (background sender thread, BREAK timing) + Fixture base
├── scenes.py         looping scenes — each takes (tripars, focus, groot, stop_event)
├── fixtures/         per-fixture profiles
├── tests/            hardware smoke tests (one per fixture type, plus test_all)
├── tools/            interactive helpers (channel poker)
├── docs/             patch table, screenshots
├── manuals/          PDF user manuals for each fixture
├── pyproject.toml
└── uv.lock
```

## Notes on the DMX path

The DSD Tech adapter is a generic FTDI FT232R USB-serial chip. We use
the standard "OpenDMX" raw protocol:

1. Generate the DMX BREAK by briefly switching to 90 000 baud and
   writing a `0x00` byte (≈ 111 µs low pulse — well above the 88 µs
   minimum, and clean because the UART itself produces it).
2. Switch to 250 000 baud, send the start code `0x00`, then 512
   channel bytes.
3. Repeat at ~30 Hz.

The `break_condition` + `time.sleep` approach is too loose on macOS for
stricter fixtures (the Mega Tripar rejected the malformed BREAK while
simpler ones like Fog accepted it). The baud-switch trick is what
made everything reliable.

The `Universe` class in `dmx.py` runs this loop in a background daemon
thread; fixtures register and write to their slice of the 512-byte
channel array, and the next frame the sender pushes picks up the new
values.
