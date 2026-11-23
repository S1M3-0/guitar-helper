import { describe, expect, it } from 'vitest';
import { NoteTracker } from './tracker';
import { midiToFreq } from './music';

function run(tracker: NoteTracker, from: number, to: number, midi: number | null, db: number, cents = 0) {
  let state;
  for (let t = from; t < to; t += 16) {
    state = tracker.update({ t, freq: midi === null ? null : midiToFreq(midi + cents / 100), clarity: midi === null ? 0 : 0.95, levelDb: db });
  }
  return state!;
}

describe('NoteTracker', () => {
  it('fires once a pitch is stable and measures sustain', () => {
    const tr = new NoteTracker({ gateDb: -50, a4: 440 });
    const notes: number[] = [];
    let released = 0;
    tr.onNote = (n) => notes.push(n.midi);
    tr.onRelease = (_n, s) => (released = s);
    run(tr, 0, 50, null, -80);
    const s = run(tr, 50, 2050, 45, -20, 8);
    expect(notes).toEqual([45]);
    expect(s.ringing).toBe(true);
    expect(s.sustainSec).toBeGreaterThan(1.9);
    expect(s.note!.cents).toBeCloseTo(8, 0);
    const after = run(tr, 2050, 2500, null, -80);
    expect(after.ringing).toBe(false);
    expect(released).toBeGreaterThan(1.9);
    expect(after.sustainSec).toBeCloseTo(released);
  });

  it('ignores brief blips and tolerates octave errors while decaying', () => {
    const tr = new NoteTracker({ gateDb: -50, a4: 440 });
    const notes: number[] = [];
    tr.onNote = (n) => notes.push(n.midi);
    run(tr, 0, 40, 50, -20); // too short to count
    run(tr, 40, 60, null, -80);
    expect(notes).toEqual([]);
    run(tr, 100, 600, 52, -20);
    run(tr, 600, 680, 64, -30); // octave jump
    const s = run(tr, 680, 1000, 52, -35);
    expect(notes).toEqual([52]);
    expect(s.sustainSec).toBeGreaterThan(0.8);
  });

  it('auto sensitivity picks up quiet notes a fixed -52 dB gate would miss', () => {
    const fixed = new NoteTracker({ gateDb: -52, a4: 440 });
    const auto = new NoteTracker({ gateDb: -52, autoGate: true, a4: 440 });
    const heard = { fixed: 0, auto: 0 };
    fixed.onNote = () => heard.fixed++;
    auto.onNote = () => heard.auto++;
    for (const tr of [fixed, auto]) {
      run(tr, 0, 1000, null, -78); // quiet room / interface noise
      run(tr, 1000, 2000, 45, -60); // quiet guitar
    }
    expect(heard.fixed).toBe(0);
    expect(heard.auto).toBe(1);
  });

  it('treats a level jump as a re-pluck of the same note', () => {
    const tr = new NoteTracker({ gateDb: -50, a4: 440 });
    const notes: number[] = [];
    tr.onNote = (n) => notes.push(n.midi);
    run(tr, 0, 500, 40, -40);
    run(tr, 500, 800, 40, -15);
    expect(notes).toEqual([40, 40]);
  });
});
