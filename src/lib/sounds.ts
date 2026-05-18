/**
 * Sound system for DamaDojo.
 *
 * Uses Web Audio API to synthesize chess.com-style sounds on the fly so the
 * app ships with audio out of the box — no asset pipeline, no licensing.
 * Real Lichess sound files can be dropped into /public/sounds/ later; the
 * `playFile` helper is wired up to use them if present.
 */

export type SoundName =
  | "move"
  | "move-opponent"
  | "capture"
  | "promote"
  | "click"
  | "notify"
  | "low-time"
  | "game-start"
  | "game-end-win"
  | "game-end-lose"
  | "game-end-draw"
  | "badge-brilliant"
  | "badge-great"
  | "badge-good"
  | "badge-mistake"
  | "badge-blunder";

let cachedCtx: AudioContext | null = null;
const audioCache = new Map<string, HTMLAudioElement>();

export function soundAssetFor(name: SoundName): string | null {
  switch (name) {
    case "move":
    case "move-opponent":
      return "/sounds/lichess-standard/Move.mp3";
    case "capture":
      return "/sounds/lichess-standard/Capture.mp3";
    case "promote":
    case "game-start":
    case "notify":
      return "/sounds/lichess-standard/GenericNotify.mp3";
    case "low-time":
      return "/sounds/lichess-standard/LowTime.mp3";
    case "game-end-win":
    case "game-end-lose":
    case "game-end-draw":
      return "/sounds/lichess-standard/GenericNotify.mp3";
    case "click":
      return "/sounds/lichess-standard/Select.mp3";
    case "badge-brilliant":
    case "badge-great":
    case "badge-good":
    case "badge-mistake":
    case "badge-blunder":
      return null;
  }
}

function assetVolumeFor(name: SoundName): number {
  switch (name) {
    case "move-opponent":
      return 0.72;
    case "capture":
      return 1;
    case "click":
      return 0.42;
    case "low-time":
      return 0.75;
    case "game-start":
    case "notify":
      return 0.82;
    default:
      return 0.92;
  }
}

function playAsset(name: SoundName, volume: number, fallback: () => void): boolean {
  const src = soundAssetFor(name);
  if (!src || typeof window === "undefined") return false;

  let cached = audioCache.get(src);
  if (!cached) {
    cached = new Audio(src);
    cached.preload = "auto";
    audioCache.set(src, cached);
  }

  const audio = cached.cloneNode(true) as HTMLAudioElement;
  audio.volume = Math.max(0, Math.min(1, volume * assetVolumeFor(name)));
  audio.currentTime = 0;
  void audio.play().catch(() => fallback());
  return true;
}

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (cachedCtx) return cachedCtx;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const AC: typeof AudioContext = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!AC) return null;
  cachedCtx = new AC();
  return cachedCtx;
}

function noiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
  const length = Math.max(1, Math.floor(durationSec * ctx.sampleRate));
  const buf = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

interface ClickOpts {
  bodyFreq: number;
  noiseQ: number;
  noiseFreq: number;
  duration: number;
  volume: number;
  bodyShape?: OscillatorType;
}

/**
 * Synthesize a percussive wood-like click: bandpassed noise burst (attack)
 * + decaying tone (body resonance).
 */
function woodClick(opts: ClickOpts) {
  const ctx = getCtx();
  if (!ctx) return;

  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = opts.volume;
  out.connect(ctx.destination);

  // Attack: filtered noise burst
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, 0.06);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = opts.noiseFreq;
  bp.Q.value = opts.noiseQ;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0, now);
  noiseGain.gain.linearRampToValueAtTime(0.7, now + 0.0008);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
  noise.connect(bp).connect(noiseGain).connect(out);
  noise.start(now);
  noise.stop(now + 0.05);

  // Body resonance
  const body = ctx.createOscillator();
  body.type = opts.bodyShape ?? "sine";
  body.frequency.setValueAtTime(opts.bodyFreq, now);
  body.frequency.exponentialRampToValueAtTime(opts.bodyFreq * 0.7, now + opts.duration);
  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(0, now);
  bodyGain.gain.linearRampToValueAtTime(0.45, now + 0.003);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, now + opts.duration);
  body.connect(bodyGain).connect(out);
  body.start(now);
  body.stop(now + opts.duration);
}

/**
 * Play a quick tone-arpeggio (used for promotion / brilliant / game start).
 */
function tones(
  freqs: readonly number[],
  stepMs: number,
  duration: number,
  volume: number,
  shape: OscillatorType = "triangle"
) {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = volume;
  out.connect(ctx.destination);

  freqs.forEach((freq, i) => {
    const t = now + (i * stepMs) / 1000;
    const o = ctx.createOscillator();
    o.type = shape;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.4, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + duration);
  });
}

interface Settings {
  enabled: boolean;
  volume: number;
}

const settings: Settings = { enabled: true, volume: 0.9 };

export function setSoundEnabled(enabled: boolean) {
  settings.enabled = enabled;
}
export function setSoundVolume(v: number) {
  settings.volume = Math.max(0, Math.min(1, v));
}
export function getSoundSettings(): Readonly<Settings> {
  return settings;
}

/**
 * Play a named sound. No-op on server or when disabled.
 * Resumes the AudioContext if it was suspended by browser policy.
 */
export function playSound(name: SoundName) {
  if (typeof window === "undefined") return;
  if (!settings.enabled) return;
  const v = settings.volume;
  if (playAsset(name, v, () => synthSound(name, v))) return;
  synthSound(name, v);
}

function synthSound(name: SoundName, v: number) {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    // Will start playing on next user-interaction-triggered call
    void ctx.resume();
  }

  switch (name) {
    case "move":
      woodClick({
        bodyFreq: 280,
        noiseFreq: 1600,
        noiseQ: 7,
        duration: 0.09,
        volume: v * 0.95,
      });
      break;
    case "move-opponent":
      woodClick({
        bodyFreq: 230,
        noiseFreq: 1300,
        noiseQ: 6,
        duration: 0.1,
        volume: v * 0.65,
      });
      break;
    case "capture":
      woodClick({
        bodyFreq: 160,
        noiseFreq: 900,
        noiseQ: 4,
        duration: 0.18,
        volume: v * 1.18,
      });
      break;
    case "promote":
      tones([523.25, 659.25, 783.99, 1046.5], 55, 0.18, v * 0.45, "triangle");
      break;
    case "click":
      woodClick({
        bodyFreq: 420,
        noiseFreq: 2400,
        noiseQ: 9,
        duration: 0.04,
        volume: v * 0.3,
      });
      break;
    case "notify":
      tones([880, 1174.66], 90, 0.22, v * 0.4, "sine");
      break;
    case "low-time":
      tones([1318.51], 0, 0.08, v * 0.5, "square");
      break;
    case "game-start":
      tones([392, 523.25, 659.25], 72, 0.22, v * 0.7, "triangle");
      break;
    case "game-end-win":
      tones([523.25, 659.25, 783.99, 1046.5, 1318.51], 70, 0.28, v * 0.55, "triangle");
      break;
    case "game-end-lose":
      tones([523.25, 415.3, 349.23, 261.63], 110, 0.32, v * 0.45, "sine");
      break;
    case "game-end-draw":
      tones([523.25, 523.25], 200, 0.32, v * 0.4, "sine");
      break;
    case "badge-brilliant":
      tones([783.99, 1046.5, 1396.91, 1760], 60, 0.22, v * 0.55, "triangle");
      break;
    case "badge-great":
      tones([783.99, 1046.5], 70, 0.18, v * 0.45, "triangle");
      break;
    case "badge-good":
      tones([880], 0, 0.12, v * 0.35, "sine");
      break;
    case "badge-mistake":
      tones([523.25, 466.16], 90, 0.18, v * 0.4, "sine");
      break;
    case "badge-blunder":
      tones([392, 311.13, 261.63], 100, 0.32, v * 0.55, "sine");
      break;
  }
}

/** Resume the AudioContext on first user interaction (call once at app boot). */
export function unlockAudio() {
  const ctx = getCtx();
  if (ctx && ctx.state === "suspended") void ctx.resume();
}
