// Browser audio: playing the reference notes through a clean electric-guitar amp.

import { renderPluck } from './synth';

let ctx: AudioContext | null = null;

export function getContext(): AudioContext {
  if (!ctx) ctx = new AudioContext({ latencyHint: 'interactive' });
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

// ---------------------------------------------------------------------------
// Clean electric guitar amp: gentle valve warmth -> tone stack -> cab sim, plus a little room reverb.

let amp: GainNode | null = null;

function warmthCurve(): Float32Array {
  const n = 2048;
  const drive = 1.6;
  const curve = new Float32Array(n);
  const norm = Math.tanh(drive);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(drive * (x + 0.08 * x * x)) / norm;
  }
  return curve;
}

function roomImpulse(ac: AudioContext): AudioBuffer {
  const len = Math.floor(ac.sampleRate * 1.2);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.5);
  }
  return buf;
}

function getAmp(): GainNode {
  if (amp) return amp;
  const ac = getContext();
  const input = ac.createGain();
  const shaper = new WaveShaperNode(ac, { curve: warmthCurve(), oversample: '4x' });
  const post = new GainNode(ac, { gain: 0.9 });
  const highpass = new BiquadFilterNode(ac, { type: 'highpass', frequency: 85, Q: 0.7 });
  const mid = new BiquadFilterNode(ac, { type: 'peaking', frequency: 750, Q: 0.8, gain: -2 });
  const presence = new BiquadFilterNode(ac, { type: 'peaking', frequency: 2600, Q: 1, gain: 3 });
  // A 12" speaker rolls off sharply above ~5 kHz.
  const cab1 = new BiquadFilterNode(ac, { type: 'lowpass', frequency: 5200, Q: 0.9 });
  const cab2 = new BiquadFilterNode(ac, { type: 'lowpass', frequency: 6500, Q: 0.6 });
  const wet = new GainNode(ac, { gain: 0.18 });
  const reverb = new ConvolverNode(ac, { buffer: roomImpulse(ac) });
  input.connect(shaper).connect(post).connect(highpass).connect(mid).connect(presence).connect(cab1).connect(cab2);
  cab2.connect(ac.destination);
  cab2.connect(reverb).connect(wet).connect(ac.destination);
  amp = input;
  return amp;
}

const bufferCache = new Map<string, AudioBuffer & { loopRegion?: [number, number] }>();
let current: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

// Fixed level into the amp; loudness is left to the system volume.
const PLAYBACK_GAIN = 0.8;

type PlaybackListener = (playing: boolean) => void;
const listeners = new Set<PlaybackListener>();
const notify = () => listeners.forEach((l) => l(current !== null));

/** Subscribe to playback starting/stopping. Returns an unsubscribe function. */
export function onPlaybackChange(listener: PlaybackListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isPlaying(): boolean {
  return current !== null;
}

export function stopPlayback() {
  if (!current) return;
  const ac = getContext();
  const { src, gain } = current;
  gain.gain.setTargetAtTime(0, ac.currentTime, 0.015);
  src.stop(ac.currentTime + 0.1);
  current = null;
  notify();
}

export interface PlayOptions {
  /** Seconds the note is held before it fades out. */
  length: number;
  /** Ring until stopPlayback() is called. */
  infinite: boolean;
}

/** Play a plucked electric-guitar note. */
export function playFrequency(freq: number, opts: PlayOptions) {
  const ac = getContext();
  stopPlayback();
  const key = `${freq.toFixed(3)}@${ac.sampleRate}/${opts.infinite ? 'inf' : opts.length}`;
  let buffer = bufferCache.get(key);
  if (!buffer) {
    const { data, loopStart, loopEnd } = renderPluck(freq, ac.sampleRate, { duration: opts.length, loop: opts.infinite });
    buffer = ac.createBuffer(1, data.length, ac.sampleRate);
    buffer.copyToChannel(data, 0);
    if (loopStart !== undefined && loopEnd !== undefined) buffer.loopRegion = [loopStart, loopEnd];
    if (bufferCache.size > 100) bufferCache.clear();
    bufferCache.set(key, buffer);
  }
  const src = ac.createBufferSource();
  src.buffer = buffer;
  if (buffer.loopRegion) {
    src.loop = true;
    src.loopStart = buffer.loopRegion[0] / ac.sampleRate;
    src.loopEnd = buffer.loopRegion[1] / ac.sampleRate;
  }
  const gain = ac.createGain();
  gain.gain.value = PLAYBACK_GAIN;
  src.connect(gain).connect(getAmp());
  src.start();
  src.onended = () => {
    if (current?.src === src) {
      current = null;
      notify();
    }
  };
  current = { src, gain };
  notify();
}
