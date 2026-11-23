import { describe, expect, it } from 'vitest';
import { detectPitch, rmsDb } from './pitch';
import { renderPluck } from './synth';
import { freqToMidi, midiToFreq } from './music';

const SR = 48000;
const seeded = (seed = 1) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const window = (sig: Float32Array, sec: number, size = 4096) => sig.slice(Math.floor(sec * SR), Math.floor(sec * SR) + size);
const centsOff = (buf: Float32Array, midi: number) => {
  const r = detectPitch(buf, SR);
  return r.freq ? (freqToMidi(r.freq) - midi) * 100 : NaN;
};

describe('electric string synth', () => {
  it('decays slowly: under 12 dB lost between 0.6 s and 4 s, low E to the 24th fret', () => {
    for (const midi of [40, 52, 64, 76, 88]) {
      const { data } = renderPluck(midiToFreq(midi), SR, { duration: 5, rand: seeded(midi) });
      const drop = rmsDb(window(data, 0.6)) - rmsDb(window(data, 4));
      expect(drop, `midi ${midi}`).toBeGreaterThan(0);
      expect(drop, `midi ${midi}`).toBeLessThan(12);
      expect(Math.abs(centsOff(window(data, 3.5), midi)), `midi ${midi} tuning`).toBeLessThan(3);
    }
  });

  it('infinite sustain renders a level, in-tune, seamless loop', () => {
    for (const midi of [40, 47, 55, 64, 71, 81, 88]) {
      const { data, loopStart, loopEnd } = renderPluck(midiToFreq(midi), SR, { loop: true, rand: seeded(midi) });
      expect(loopStart).toBeDefined();
      const ls = loopStart!;
      const le = loopEnd!;
      expect(le - ls).toBeGreaterThan(SR); // > 1 s of loop
      // Level is steady across the loop.
      const a = rmsDb(data.slice(ls, ls + 4096));
      const b = rmsDb(data.slice(le - 8192, le - 4096));
      expect(Math.abs(a - b), `midi ${midi} level`).toBeLessThan(1.5);
      // Playing through the seam (end of loop -> its start) is in tune and click-free.
      const seam = new Float32Array(8192);
      seam.set(data.slice(le - 4096, le), 0);
      seam.set(data.slice(ls, ls + 4096), 4096);
      expect(Math.abs(centsOff(seam.slice(2048, 6144), midi)), `midi ${midi} seam tuning`).toBeLessThan(3);
      let maxStepAtSeam = Math.abs(seam[4096] - seam[4095]);
      let typicalStep = 0;
      for (let i = 1; i < 4096; i++) typicalStep = Math.max(typicalStep, Math.abs(seam[i] - seam[i - 1]));
      expect(maxStepAtSeam, `midi ${midi} seam jump`).toBeLessThanOrEqual(typicalStep * 1.05);
    }
  });
});
