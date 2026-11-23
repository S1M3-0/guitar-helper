import { describe, expect, it } from 'vitest';
import {
  candidatePositions,
  describeDiff,
  freqToMidi,
  midiToFreq,
  midiToName,
  parseNote,
  pickRandomPosition,
  presetMidi,
  semitoneDiff,
  TUNING_PRESETS,
} from './music';

const standard = presetMidi(TUNING_PRESETS[0]);
const all = (n: number) => Array(n).fill(true);

describe('note helpers', () => {
  it('parses and names notes', () => {
    expect(parseNote('E2')).toBe(40);
    expect(parseNote('A4')).toBe(69);
    expect(parseNote('Bb1')).toBe(34);
    expect(midiToName(64)).toBe('E4');
    expect(midiToName(61, true)).toBe('Db4');
  });
  it('converts frequency', () => {
    expect(midiToFreq(69)).toBeCloseTo(440);
    expect(freqToMidi(82.41)).toBeCloseTo(40, 2);
  });
  it('standard tuning is EADGBE', () => {
    expect(standard.map((m) => midiToName(m))).toEqual(['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);
  });
});

describe('candidate positions', () => {
  it('defaults to the whole 22 fret neck', () => {
    const c = candidatePositions({ tuning: standard, minFret: 0, maxFret: 22, enabledStrings: all(6), keyRoot: 0, scaleId: 'chromatic' });
    expect(c.length).toBe(6 * 23);
  });
  it('filters by fret range, strings and scale', () => {
    const c = candidatePositions({
      tuning: standard, minFret: 5, maxFret: 8,
      enabledStrings: [false, false, false, false, false, true],
      keyRoot: 0, scaleId: 'ionian',
    });
    // high E frets 5..8 = A A# B C -> A, B, C in C major
    expect(c.map((p) => p.fret)).toEqual([5, 7, 8]);
  });
  it('never picks the same string twice in a row and covers every string', () => {
    const c = candidatePositions({ tuning: standard, minFret: 0, maxFret: 22, enabledStrings: all(6), keyRoot: 0, scaleId: 'chromatic' });
    let prev = pickRandomPosition(c)!;
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const next = pickRandomPosition(c, prev)!;
      expect(next.string).not.toBe(prev.string);
      seen.add(next.string);
      prev = next;
    }
    expect(seen.size).toBe(6);
  });
  it('avoids repeating the previous pitch', () => {
    const c = candidatePositions({ tuning: standard, minFret: 0, maxFret: 1, enabledStrings: [true, false, false, false, false, false], keyRoot: 0, scaleId: 'chromatic' });
    for (let i = 0; i < 20; i++) expect(pickRandomPosition(c, c[0])!.midi).toBe(c[1].midi);
  });
});

describe('diffs', () => {
  it('wraps in any-octave mode', () => {
    expect(semitoneDiff(52, 40, false)).toBe(12);
    expect(semitoneDiff(52, 40, true)).toBe(0);
    expect(semitoneDiff(51, 40, true)).toBe(-1);
    expect(describeDiff(-2)).toBe('2 semitones flat (too low)');
    expect(describeDiff(12)).toBe('1 octave too high');
  });
});
