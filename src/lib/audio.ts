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

const bufferCache = new Map<string, AudioBuffer>();
let current: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

export function stopPlayback() {
  if (!current) return;
  const ac = getContext();
  const { src, gain } = current;
  gain.gain.setTargetAtTime(0, ac.currentTime, 0.015);
  src.stop(ac.currentTime + 0.1);
  current = null;
}

export interface PlayOptions {
  volume: number;
  /** Seconds the note is held before it is cut off. */
  length: number;
}

/** Play a plucked electric-guitar note. Returns the playback duration in ms. */
export function playFrequency(freq: number, opts: PlayOptions): number {
  const ac = getContext();
  stopPlayback();
  const key = `${freq.toFixed(3)}@${ac.sampleRate}/${opts.length}`;
  let buffer = bufferCache.get(key);
  if (!buffer) {
    const data = renderPluck(freq, ac.sampleRate, { duration: opts.length });
    buffer = ac.createBuffer(1, data.length, ac.sampleRate);
    buffer.copyToChannel(data, 0);
    if (bufferCache.size > 200) bufferCache.clear();
    bufferCache.set(key, buffer);
  }
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const gain = ac.createGain();
  gain.gain.value = opts.volume;
  src.connect(gain).connect(getAmp());
  src.start();
  src.onended = () => {
    if (current?.src === src) current = null;
  };
  current = { src, gain };
  return buffer.duration * 1000;
}
