# soos-lights

DMX lighting control for our rig — Python + FastAPI core, React + Tailwind
front-end, library of looping scenes plus a step-sequencer pattern builder.
Drives the rig directly through a generic FTDI-based USB-DMX adapter (DSD
Tech) using the OpenDMX raw protocol.

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
Manufacturer manuals are not in the repo (they're copyrighted PDFs).
Drop them locally into `manuals/` if you want them on hand — that path
is gitignored.

## Setup

Requires Python 3.12 + [uv](https://docs.astral.sh/uv/) and Node 18+ + npm.

```sh
uv sync                         # Python deps
cd web && npm install && cd ..  # JS deps
```

The DMX adapter is auto-detected — `rig.PORT` looks for macOS
`/dev/cu.usbserial-*`, then Linux `/dev/serial/by-id/usb-FTDI_*`,
then `/dev/ttyUSB*`. Override with `DMX_PORT=/dev/whatever` in the env
if needed. With no adapter present, `Universe` falls back to mock
mode and the app keeps working for development.

## Run

**Production-ish (single server):**

```sh
cd web && npm run build && cd ..   # build the React app once
uv run python app.py               # FastAPI serves /api, /ws, AND the built UI
```

Listens on `0.0.0.0:8000`. Open `http://<mac-ip>:8000` from any device on
the same Wi-Fi. With no DMX adapter plugged in, `Universe` falls back to
mock mode automatically — every page works and you can preview scenes
in `/viz` without hardware.

**Dev (hot-reloaded UI):**

```sh
uv run python app.py     # backend on :8000
cd web && npm run dev    # Vite on :5173 with HMR + proxy back to :8000
```

Visit `http://localhost:5173`.

## Deploy as a Proxmox LXC

Full guide in [`deploy/README.md`](deploy/README.md). TL;DR:

1. Create a Debian 13 unprivileged LXC.
2. Append the USB-passthrough block from
   [`deploy/proxmox-lxc.conf.example`](deploy/proxmox-lxc.conf.example)
   to `/etc/pve/lxc/<vmid>.conf` and reboot the container.
3. Inside the container, run:
   ```sh
   curl -fsSL https://raw.githubusercontent.com/OJC-Knor/dmx-relay/main/deploy/setup.sh | bash
   ```
4. Open `http://<lxc-ip>:8000`.

Updates: `bash /opt/soos-lights/deploy/update.sh`.

The UI has four pages:

- **Controls** (`/`) — colour picker for all Tripars, white & dimmer
  sliders, Atomic action buttons, Fog level + puff, scene grid (built-in
  scenes and saved patterns), sticky BLACKOUT bar.
- **Builder** (`/builder`) — FL-style step sequencer for tripar
  patterns. Save them and they appear in the Controls scene grid.
- **Viz** (`/viz`) — live rendering of the rig over a WebSocket; lets
  you preview every scene without the hardware.
- **Layout** (`/editor`) — drag fixtures to where they actually sit on
  stage. Geometry-aware scenes read from this.

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

```text
.
├── app.py            FastAPI app: REST + WebSocket + SPA fallback
├── dmx.py            Universe (background sender thread, BREAK timing) + Fixture base
├── rig.py            single source of truth for the patch (PORT, addresses, build_rig)
├── layout.py         reads state/layout.json into geometric groupings (ring vs stage, etc.)
├── scenes.py         looping scenes — each takes (tripars, focus, groot, stop_event)
├── fixtures/         per-fixture profiles
├── tests/            hardware smoke tests
├── tools/            interactive channel poker
├── docs/             patch table, screenshots
├── manuals/          (gitignored — drop fixture PDFs here locally)
├── state/            layout.json (tracked) + patterns.json (gitignored, user content)
├── web/              React + Vite + Tailwind front-end
│   ├── src/pages/    Controls, Builder, Viz, Editor
│   ├── src/components/  Layout, Button, Slider, Toast, Section
│   ├── src/lib/      api.ts, useLiveState.ts, types.ts, utils.ts
│   └── dist/         (gitignored — output of `npm run build`)
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
