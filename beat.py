"""Shared beat clock — one BPM and phase for the whole app.

Every browser taps into the same clock, so all phones see the same beat
and the VJ effects and patterns land on it. Time is `time.monotonic()`.

The position is kept as an anchor: at `anchor` seconds we were at beat
`anchor_beat`. Changing the BPM re-anchors at the current position so
the beat count never jumps.
"""

from __future__ import annotations

import math
import threading
import time

MIN_BPM = 40.0
MAX_BPM = 240.0


class BeatClock:
    def __init__(self, bpm: float = 120.0) -> None:
        self._lock = threading.Lock()
        self.bpm = bpm
        self._anchor = time.monotonic()
        self._anchor_beat = 0.0
        self.sync = False      # patterns follow this clock instead of their own step_ms
        self.source = "tap"    # "tap" | "mic" — who set it last, for the UI

    # ----- reading -----

    def beats(self, t: float | None = None) -> float:
        """Beat position at time t (default now). Beat 0, 4, 8, … are downbeats."""
        t = time.monotonic() if t is None else t
        with self._lock:
            return self._anchor_beat + (t - self._anchor) * self.bpm / 60.0

    def time_until(self, beat: float) -> float:
        """Seconds from now until the clock reaches `beat` (0 if already past)."""
        now = time.monotonic()
        with self._lock:
            pos = self._anchor_beat + (now - self._anchor) * self.bpm / 60.0
            return max(0.0, (beat - pos) * 60.0 / self.bpm)

    def next_bar(self) -> float:
        """Beat number of the next downbeat."""
        return math.floor(self.beats() / 4 + 1) * 4

    def snapshot(self) -> dict:
        return {"bpm": round(self.bpm, 2), "beat": self.beats(), "sync": self.sync,
                "source": self.source}

    # ----- writing -----

    def _reanchor(self, now: float) -> None:
        self._anchor_beat += (now - self._anchor) * self.bpm / 60.0
        self._anchor = now

    def set_bpm(self, bpm: float) -> None:
        now = time.monotonic()
        with self._lock:
            self._reanchor(now)
            self.bpm = min(MAX_BPM, max(MIN_BPM, float(bpm)))

    def tap(self, bpm: float | None, index: int, source: str = "tap") -> None:
        """A tap landed now. `index` is its position in the tap run, so the
        first tap of a run is a downbeat and the bar lines up with it."""
        now = time.monotonic()
        with self._lock:
            if bpm:
                self.bpm = min(MAX_BPM, max(MIN_BPM, float(bpm)))
            self._anchor = now
            self._anchor_beat = float(index)
            self.sync = True
            self.source = source

    def beat_now(self, source: str = "mic") -> None:
        """A beat happened now: snap to the nearest whole beat, keep the bar."""
        now = time.monotonic()
        with self._lock:
            self._reanchor(now)
            self._anchor_beat = float(round(self._anchor_beat))
            self.source = source

    def downbeat(self) -> None:
        """Resync: now is beat 1 of bar 1 of a new phrase (8 bars = 32 beats)."""
        now = time.monotonic()
        with self._lock:
            self._anchor = now
            self._anchor_beat = 0.0

    def nudge(self, ms: float) -> None:
        """Shift the phase: positive = beats land later."""
        with self._lock:
            self._anchor += ms / 1000.0
