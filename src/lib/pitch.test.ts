import { describe, expect, it } from 'vitest';
import { detectPitch } from './pitch';
import { renderPluck } from './synth';
import { freqToMidi, midiToFreq } from './music';

const SR = 48000;

function seeded(seed = 1) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function frame(sig: Float32Array, start: number, size = 4096) {
  return sig.slice(start, start + size);
}

describe('YIN pitch detection', () => {
  it('detects pure sines across the guitar range', () => {
    for (const midi of [35, 40, 52, 64, 76, 86, 88]) {
      const f = midiToFreq(midi);
      const buf = new Float32Array(4096).map((_, i) => Math.sin((2 * Math.PI * f * i) / SR));
      const r = detectPitch(buf, SR);
      expect(r.freq).not.toBeNull();
      expect(Math.abs(freqToMidi(r.freq!) - midi) * 100).toBeLessThan(5);
    }
  });

  it('returns no pitch for noise', () => {
    const rand = seeded(7);
    const buf = new Float32Array(4096).map(() => rand() * 2 - 1);
    expect(detectPitch(buf, SR).freq).toBeNull();
  });

  it('synthesised plucks are in tune and detectable (low E to 24th fret)', () => {
    for (const midi of [40, 45, 50, 55, 59, 64, 69, 76, 81, 86, 88]) {
      const sig = renderPluck(midiToFreq(midi), SR, { rand: seeded(midi) });
      for (const start of [2400, 9600, 24000]) {
        const r = detectPitch(frame(sig, start), SR);
        expect(r.freq, `midi ${midi} @${start}`).not.toBeNull();
        const cents = (freqToMidi(r.freq!) - midi) * 100;
        expect(Math.abs(cents), `midi ${midi} @${start}: ${cents.toFixed(1)}c`).toBeLessThan(10);
      }
    }
  });
});
