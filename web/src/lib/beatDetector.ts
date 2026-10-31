// Microphone beat detection, running in the browser of the phone that
// switched it on.
//
// Kick drums put a burst of energy below ~150 Hz. We watch that band for
// sudden rises (onsets), then estimate the tempo from the gaps between
// onsets: every gap (and the gaps to the next few onsets) is folded into
// 85–170 BPM and voted into a histogram; the peak is the tempo.
//
// Browsers only allow the microphone on a secure origin (https:// or
// localhost), so on http://<ip>:8000 this reports "insecure".

export type DetectorStatus = "off" | "starting" | "listening" | "insecure" | "denied" | "error";

export type DetectorReading = {
  bpm: number | null;     // null until there are enough onsets
  confidence: number;     // 0..1, share of votes in the winning bin
  level: number;          // 0..1 bass level, for a meter
};

type Callbacks = {
  onOnset: (t: number) => void;              // performance.now() of a kick
  onReading: (r: DetectorReading) => void;
};

const MIN_GAP_MS = 280;        // ignore onsets closer than this (~214 BPM)
const WINDOW_MS = 10_000;      // onsets used for the tempo estimate
const LO_BPM = 85;
const HI_BPM = 170;

export class BeatDetector {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private timer: number | null = null;
  private onsets: number[] = [];
  private prevEnergy = 0;
  private fluxAvg = 0;
  private energyAvg = 0;
  private lastOnset = 0;

  constructor(private cb: Callbacks) {}

  static supported(): DetectorStatus | null {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return "insecure";
    return null;
  }

  async start(): Promise<DetectorStatus> {
    const unsupported = BeatDetector.supported();
    if (unsupported) return unsupported;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (e) {
      return (e as DOMException)?.name === "NotAllowedError" ? "denied" : "error";
    }
    this.ctx = new AudioContext();
    const src = this.ctx.createMediaStreamSource(this.stream);
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0;
    src.connect(analyser);

    const bins = new Uint8Array(analyser.frequencyBinCount);
    const binHz = this.ctx.sampleRate / analyser.fftSize;
    const lo = Math.max(1, Math.floor(40 / binHz));
    const hi = Math.max(lo + 1, Math.ceil(150 / binHz));
    let readingAt = 0;

    this.timer = window.setInterval(() => {
      analyser.getByteFrequencyData(bins);
      let sum = 0;
      for (let i = lo; i <= hi; i++) sum += bins[i];
      const energy = sum / (hi - lo + 1) / 255;
      const flux = Math.max(0, energy - this.prevEnergy);
      this.prevEnergy = energy;
      // slow running averages (~1 s) set an adaptive threshold
      this.fluxAvg = this.fluxAvg * 0.98 + flux * 0.02;
      this.energyAvg = this.energyAvg * 0.99 + energy * 0.01;

      const now = performance.now();
      if (
        flux > this.fluxAvg * 3 + 0.015 &&
        energy > this.energyAvg * 0.9 &&
        now - this.lastOnset > MIN_GAP_MS
      ) {
        this.lastOnset = now;
        this.onsets.push(now);
        this.onsets = this.onsets.filter((t) => now - t < WINDOW_MS);
        this.cb.onOnset(now);
      }
      if (now - readingAt > 250) {
        readingAt = now;
        this.cb.onReading({ ...this.estimate(), level: Math.min(1, energy * 1.5) });
      }
    }, 10);
    return "listening";
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.ctx?.close();
    this.ctx = null;
    this.onsets = [];
  }

  private estimate(): { bpm: number | null; confidence: number } {
    const on = this.onsets;
    if (on.length < 8) return { bpm: null, confidence: 0 };
    const votes = new Map<number, number>();
    let total = 0;
    for (let i = 0; i < on.length; i++) {
      for (let j = i + 1; j < Math.min(on.length, i + 5); j++) {
        let bpm = 60_000 / (on[j] - on[i]);
        while (bpm < LO_BPM) bpm *= 2;
        while (bpm > HI_BPM) bpm /= 2;
        const bin = Math.round(bpm);
        const w = 1 / (j - i);          // nearer neighbours count more
        for (const d of [-1, 0, 1]) votes.set(bin + d, (votes.get(bin + d) ?? 0) + (d ? w / 2 : w));
        total += w;
      }
    }
    let best = 0, bestVotes = 0;
    votes.forEach((v, k) => { if (v > bestVotes) { bestVotes = v; best = k; } });
    return { bpm: best, confidence: Math.min(1, bestVotes / total) };
  }
}
