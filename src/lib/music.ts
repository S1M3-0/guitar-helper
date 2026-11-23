// Core music theory helpers: note naming, tunings, scales and fretboard maths.
// Pitches are represented as MIDI note numbers (C4 = 60, A4 = 69).

export const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export const pitchClass = (midi: number): number => ((Math.round(midi) % 12) + 12) % 12;

export function midiToFreq(midi: number, a4 = 440): number {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

/** Fractional MIDI number for a frequency. */
export function freqToMidi(freq: number, a4 = 440): number {
  return 69 + 12 * Math.log2(freq / a4);
}

export function pcName(pc: number, flats = false): string {
  return (flats ? FLAT_NAMES : SHARP_NAMES)[((pc % 12) + 12) % 12];
}

export function midiToName(midi: number, flats = false): string {
  const m = Math.round(midi);
  return `${pcName(m, flats)}${Math.floor(m / 12) - 1}`;
}

/** Parse names like "E2", "F#3", "Bb1". Returns null if invalid. */
export function parseNote(name: string): number | null {
  const match = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(name.trim());
  if (!match) return null;
  const base = SHARP_NAMES.indexOf(match[1].toUpperCase());
  const acc = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
  return (parseInt(match[3], 10) + 1) * 12 + base + acc;
}

// ---------------------------------------------------------------------------
// Tunings (listed from lowest / thickest string to highest)

export interface TuningPreset {
  id: string;
  name: string;
  notes: string[];
}

export const TUNING_PRESETS: TuningPreset[] = [
  { id: 'standard', name: 'Standard (E A D G B E)', notes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
  { id: 'drop-d', name: 'Drop D (D A D G B E)', notes: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
  { id: 'half-down', name: 'Half step down (Eb)', notes: ['Eb2', 'Ab2', 'Db3', 'Gb3', 'Bb3', 'Eb4'] },
  { id: 'd-standard', name: 'D Standard', notes: ['D2', 'G2', 'C3', 'F3', 'A3', 'D4'] },
  { id: 'drop-c', name: 'Drop C (C G C F A D)', notes: ['C2', 'G2', 'C3', 'F3', 'A3', 'D4'] },
  { id: 'dadgad', name: 'DADGAD', notes: ['D2', 'A2', 'D3', 'G3', 'A3', 'D4'] },
  { id: 'open-g', name: 'Open G (D G D G B D)', notes: ['D2', 'G2', 'D3', 'G3', 'B3', 'D4'] },
  { id: 'open-d', name: 'Open D (D A D F# A D)', notes: ['D2', 'A2', 'D3', 'F#3', 'A3', 'D4'] },
  { id: 'open-e', name: 'Open E (E B E G# B E)', notes: ['E2', 'B2', 'E3', 'G#3', 'B3', 'E4'] },
  { id: '7-standard', name: '7-string (B E A D G B E)', notes: ['B1', 'E2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
];

export function presetMidi(preset: TuningPreset): number[] {
  return preset.notes.map((n) => parseNote(n)!);
}

export function findPresetId(tuning: number[]): string {
  const hit = TUNING_PRESETS.find((p) => {
    const m = presetMidi(p);
    return m.length === tuning.length && m.every((v, i) => v === tuning[i]);
  });
  return hit ? hit.id : 'custom';
}

// ---------------------------------------------------------------------------
// Scales and modes (intervals in semitones from the root)

export interface ScaleDef {
  id: string;
  name: string;
  intervals: number[];
  group: 'Any' | 'Modes' | 'Scales';
}

export const SCALES: ScaleDef[] = [
  { id: 'chromatic', name: 'Any note (chromatic)', intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], group: 'Any' },
  { id: 'ionian', name: 'Major / Ionian', intervals: [0, 2, 4, 5, 7, 9, 11], group: 'Modes' },
  { id: 'dorian', name: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10], group: 'Modes' },
  { id: 'phrygian', name: 'Phrygian', intervals: [0, 1, 3, 5, 7, 8, 10], group: 'Modes' },
  { id: 'lydian', name: 'Lydian', intervals: [0, 2, 4, 6, 7, 9, 11], group: 'Modes' },
  { id: 'mixolydian', name: 'Mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10], group: 'Modes' },
  { id: 'aeolian', name: 'Natural minor / Aeolian', intervals: [0, 2, 3, 5, 7, 8, 10], group: 'Modes' },
  { id: 'locrian', name: 'Locrian', intervals: [0, 1, 3, 5, 6, 8, 10], group: 'Modes' },
  { id: 'harmonic-minor', name: 'Harmonic minor', intervals: [0, 2, 3, 5, 7, 8, 11], group: 'Scales' },
  { id: 'melodic-minor', name: 'Melodic minor', intervals: [0, 2, 3, 5, 7, 9, 11], group: 'Scales' },
  { id: 'major-pent', name: 'Major pentatonic', intervals: [0, 2, 4, 7, 9], group: 'Scales' },
  { id: 'minor-pent', name: 'Minor pentatonic', intervals: [0, 3, 5, 7, 10], group: 'Scales' },
  { id: 'blues', name: 'Blues', intervals: [0, 3, 5, 6, 7, 10], group: 'Scales' },
];

export function getScale(id: string): ScaleDef {
  return SCALES.find((s) => s.id === id) ?? SCALES[0];
}

export function scalePitchClasses(root: number, scaleId: string): Set<number> {
  return new Set(getScale(scaleId).intervals.map((i) => (root + i) % 12));
}

// ---------------------------------------------------------------------------
// Fretboard

export interface FretPosition {
  /** 0 = lowest-pitched (thickest) string. */
  string: number;
  fret: number;
  midi: number;
}

export interface RangeFilter {
  tuning: number[];
  minFret: number;
  maxFret: number;
  enabledStrings: boolean[];
  keyRoot: number;
  scaleId: string;
}

export function allPositions(tuning: number[], fretCount: number): FretPosition[] {
  const out: FretPosition[] = [];
  tuning.forEach((open, s) => {
    for (let f = 0; f <= fretCount; f++) out.push({ string: s, fret: f, midi: open + f });
  });
  return out;
}

/** Every fretboard position allowed by the current range / key / scale settings. */
export function candidatePositions(filter: RangeFilter): FretPosition[] {
  const pcs = scalePitchClasses(filter.keyRoot, filter.scaleId);
  return allPositions(filter.tuning, filter.maxFret).filter(
    (p) => p.fret >= filter.minFret && filter.enabledStrings[p.string] !== false && pcs.has(pitchClass(p.midi)),
  );
}

/**
 * Pick a random position. The string is chosen first (evenly across strings, and
 * not the same string twice in a row) so practice is spread over the whole neck;
 * an immediate repeat of the same pitch is avoided when possible.
 */
export function pickRandomPosition(
  candidates: FretPosition[],
  previous?: FretPosition | null,
  rand: () => number = Math.random,
): FretPosition | null {
  if (candidates.length === 0) return null;
  let pool = candidates;
  if (previous) {
    const differentPitch = pool.filter((c) => c.midi !== previous.midi);
    if (differentPitch.length) pool = differentPitch;
  }
  let strings = [...new Set(pool.map((c) => c.string))];
  if (previous && strings.length > 1) strings = strings.filter((s) => s !== previous.string);
  const string = strings[Math.floor(rand() * strings.length)];
  const onString = pool.filter((c) => c.string === string);
  return onString[Math.floor(rand() * onString.length)];
}

/** Fret where a pitch sits on a given string, or null if it isn't playable there. */
export function fretOnString(midi: number, openMidi: number, fretCount: number): number | null {
  const f = midi - openMidi;
  return f >= 0 && f <= fretCount ? f : null;
}

export function stringOrdinal(index: number, stringCount: number): number {
  return stringCount - index;
}

/** Signed semitone distance from target to played. In any-octave mode it wraps to -6..+6. */
export function semitoneDiff(playedMidi: number, targetMidi: number, anyOctave: boolean): number {
  const d = playedMidi - targetMidi;
  if (!anyOctave) return d;
  let w = ((d % 12) + 12) % 12;
  if (w > 6) w -= 12;
  return w;
}

export function describeDiff(semitones: number): string {
  const s = Math.round(semitones);
  if (s === 0) return 'Spot on';
  const abs = Math.abs(s);
  const dir = s > 0 ? 'sharp (too high)' : 'flat (too low)';
  if (abs % 12 === 0) return `${abs / 12} octave${abs > 12 ? 's' : ''} ${s > 0 ? 'too high' : 'too low'}`;
  return `${abs} semitone${abs > 1 ? 's' : ''} ${dir}`;
}
