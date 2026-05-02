# DMX Universe — Fixture Layout

All fixtures live on **Universe 1**.

## Patch table

| ID | Name | Type | Channels | Start address | Range |
|----|------|------|---------:|--------------:|------:|
| 1  | Tripar 1  | Mega Tripar Profile Plus 6 Ch | 6  | 1   | 1–6 |
| 2  | Tripar 2  | Mega Tripar Profile Plus 6 Ch | 6  | 7   | 7–12 |
| 3  | Tripar 3  | Mega Tripar Profile Plus 6 Ch | 6  | 13  | 13–18 |
| 4  | Tripar 4  | Mega Tripar Profile Plus 6 Ch | 6  | 19  | 19–24 |
| 5  | Tripar 5  | Mega Tripar Profile Plus 6 Ch | 6  | 25  | 25–30 |
| 6  | Tripar 6  | Mega Tripar Profile Plus 6 Ch | 6  | 31  | 31–36 |
| 7  | Tripar 7  | Mega Tripar Profile Plus 6 Ch | 6  | 37  | 37–42 |
| 8  | Tripar 8  | Mega Tripar Profile Plus 6 Ch | 6  | 43  | 43–48 |
| 9  | Tripar 9  | Mega Tripar Profile Plus 6 Ch | 6  | 49  | 49–54 |
| 10 | Tripar 10 | Mega Tripar Profile Plus 6 Ch | 6  | 55  | 55–60 |
| 11 | Tripar 11 | Mega Tripar Profile Plus 6 Ch | 6  | 61  | 61–66 |
| 12 | Tripar 12 | Mega Tripar Profile Plus 6 Ch | 6  | 67  | 67–72 |
| 16 | Pinspots & Spotlight | MultiChannel 4 Ch | 4  | 80  | 80–83 |
| 13 | Atomic | Atomic 3000 4 Channel | 4  | 100 | 100–103 |
| 19 | Fog | Channel GM Enabled | 1  | 500 | 500 |
| 20 | Movinghead 1 | Focus Spot Two 18 Ch | 18 | 110 | 110–127 |
| 21 | Movinghead 2 | Focus Spot Two 18 Ch | 18 | 128 | 128–145 |
| 22 | Movinghead 3 | Focus Spot Two 18 Ch | 18 | 146 | 146–163 |
| 23 | Movinghead 4 | Focus Spot Two 18 Ch | 18 | 164 | 164–181 |
| 24 | Movinghead Groot 1 | MS Zoom 250 M1 | 16 | 182 | 182–197 |
| 25 | Movinghead Groot 2 | MS Zoom 250 M1 | 16 | 198 | 198–213 |
| 26 | Movinghead Groot 3 | MS Zoom 250 M1 | 16 | 214 | 214–229 |

> The Fog start address was hard to read in the screenshot — please confirm before driving it.

---

## Fixture descriptions

### Tripar 1–12 — Mega Tripar Profile Plus (6-channel mode)
Twelve RGB(W/A/UV) LED PAR-style wash fixtures, daisy-chained through addresses **1–72**. In the standard 6-channel personality the channels are typically:

1. Dimmer (master intensity)
2. Red
3. Green
4. Blue
5. Strobe / shutter
6. Function / macro (auto-programs, sound active, etc.)

These are the workhorses of the rig — use them for color washes, chases, and ambient color across the room.

### Pinspots & Spotlight (ID 16) — MultiChannel 4 Ch
A small grouped fixture (or DIY combo) patched as a generic 4-channel device at address **80**. Channels are user-defined; common layout for a pinspot/spot combo:

1. Pinspot A intensity
2. Pinspot B intensity
3. Spotlight intensity
4. Strobe / aux

Confirm the exact mapping from the original wiring before sending levels.

### Atomic (ID 13) — Atomic 3000 4 Channel
Martin/Showtec-style strobe fixture at address **100–103**. Standard 4-channel personality:

1. Flash rate
2. Dimmer / intensity
3. Flash duration
4. Effects (ramping, random strobe, etc.)

Use for high-impact accent flashes — keep the duty cycle low.

### Fog (ID 19) — Channel GM Enabled
A fog/haze machine on a single DMX channel. "GM Enabled" means it responds to the desk's Grand Master, so it will fade out when the GM is pulled. One channel:

1. Fog output level (0 = off, 255 = full)

### Movinghead 1–4 (IDs 20–23) — Focus Spot Two (18-channel mode)
Four ADJ Focus Spot Two LED moving heads, addresses **110–181**. Typical 18-ch personality:

1. Pan
2. Pan fine
3. Tilt
4. Tilt fine
5. Pan/Tilt speed
6. Color wheel
7. Gobo wheel
8. Gobo rotation
9. Prism
10. Prism rotation
11. Focus
12. Dimmer
13. Shutter / strobe
14. Movement macros
15. Color macros
16. Reset / lamp control
17. Dimmer curve
18. Built-in programs

(Verify against the fixture's manual — manufacturers shuffle channel order.)

### Movinghead Groot 1–3 (IDs 24–26) — MS Zoom 250 M1
Three larger LED moving heads ("Groot") with motorised zoom, addresses **182–229**, 16 channels each. Typical layout:

1. Pan
2. Pan fine
3. Tilt
4. Tilt fine
5. Speed
6. Dimmer
7. Shutter / strobe
8. Red
9. Green
10. Blue
11. White
12. Color macros
13. Zoom
14. Auto programs
15. Reset
16. Dimmer curve

Confirm the exact channel map from the MS Zoom 250 M1 manual before scripting.

---

## Universe summary

- **Universe:** 1
- **Highest used address:** 229 (Movinghead Groot 3 ends at 229)
- **Free addresses for expansion:** 73–79, 84–99, 104–109, and 230–512

## Next steps for the Python app

To drive these from Python you'll want:

1. A DMX output interface — common options: **Enttec Open DMX USB / DMX USB Pro**, **uDMX**, or an **Art-Net / sACN** node over Ethernet.
2. A library to talk to it — e.g. `pyserial` for Enttec, `pyartnet` / `sacn` for network protocols, or `ola` (Open Lighting Architecture) bindings for a backend-agnostic approach.
3. A fixture-abstraction layer in code that mirrors this table so the UI talks in terms of "Tripar 5 → red = 200" rather than raw channel numbers.

Let me know which DMX interface you're using and I can scaffold the project around it.
