import { TUNING_PRESETS, presetMidi } from './music';

export type PracticeMode = 'notes' | 'chords';

/** keyRoot value meaning "no fixed key — pick one at random". */
export const ANY_KEY = -1;

export interface Settings {
  mode: PracticeMode;
  tuning: number[];
  fretCount: number;
  minFret: number;
  maxFret: number;
  enabledStrings: boolean[];
  /** 0-11, or ANY_KEY for a random key that changes as you practise. */
  keyRoot: number;
  scaleId: string;
  /** With a random key: pick a new key after this many notes. */
  keyChangeEvery: number;
  /** Hide the target note name in the target box (pure ear training). */
  hideTarget: boolean;
  showNoteNames: boolean;
  showScaleNotes: boolean;
  /** How long the reference note is held, in seconds. */
  noteLength: number;
  /** Let the note ring until Space is pressed again. */
  infiniteSustain: boolean;
  a4: number;
  useFlats: boolean;
}

export const MIN_NOTE_LENGTH = 0.5;
export const MAX_NOTE_LENGTH = 30;

export const FRET_COUNT_OPTIONS = [19, 20, 21, 22, 24, 27];

export const DEFAULT_SETTINGS: Settings = {
  mode: 'notes',
  tuning: presetMidi(TUNING_PRESETS[0]),
  fretCount: 22,
  minFret: 0,
  maxFret: 22,
  enabledStrings: [true, true, true, true, true, true],
  keyRoot: ANY_KEY,
  scaleId: 'chromatic',
  keyChangeEvery: 8,
  hideTarget: false,
  showNoteNames: false,
  showScaleNotes: true,
  noteLength: 4,
  infiniteSustain: false,
  a4: 440,
  useFlats: false,
};

const KEY = 'guitar-helper:settings:v3';

/** Keep settings internally consistent (ranges inside the fretboard, one flag per string...). */
export function normalizeSettings(s: Settings): Settings {
  const fretCount = Math.max(1, s.fretCount);
  const maxFret = Math.min(Math.max(s.maxFret, 0), fretCount);
  const minFret = Math.min(Math.max(s.minFret, 0), maxFret);
  const enabledStrings = s.tuning.map((_, i) => s.enabledStrings[i] ?? true);
  const noteLength = Number.isFinite(s.noteLength) ? Math.min(MAX_NOTE_LENGTH, Math.max(MIN_NOTE_LENGTH, s.noteLength)) : 4;
  return { ...s, fretCount, maxFret, minFret, enabledStrings, noteLength };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalizeSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
  } catch {
    /* ignore */
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
