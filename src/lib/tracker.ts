// Turns a stream of raw pitch frames into stable "notes" with onset events
// and a sustain measurement (how long the note keeps ringing above the gate).

import { freqToMidi } from './music';

export interface Frame {
  /** Time in milliseconds. */
  t: number;
  freq: number | null;
  clarity: number;
  levelDb: number;
}

export interface TrackedNote {
  midi: number;
  /** Smoothed deviation from equal temperament, in cents (-50..+50). */
  cents: number;
  startedAt: number;
  lastSeen: number;
  peakDb: number;
}

export interface TrackerState {
  levelDb: number;
  /** Estimated background noise level (dB). */
  noiseFloorDb: number;
  /** The level a sound must exceed to be treated as a note (dB). */
  effectiveGateDb: number;
  /** Raw detector output for the input monitor. */
  freq: number | null;
  clarity: number;
  /** Instantaneous fractional MIDI, if the current frame is voiced. */
  rawMidi: number | null;
  note: TrackedNote | null;
  /** Seconds the current note has been ringing, or the final value of the last note. */
  sustainSec: number;
  ringing: boolean;
}

export interface TrackerOptions {
  gateDb: number;
  /** Follow the background noise level and set the gate just above it. */
  autoGate?: boolean;
  a4: number;
  minClarity?: number;
  /** A new pitch must hold this long before it counts as a note. */
  stableMs?: number;
  /** Silence / unvoiced time before a ringing note is considered finished. */
  releaseMs?: number;
  /** A level jump this large (dB, frame to frame) counts as a re-pluck. */
  onsetJumpDb?: number;
}

export type NoteListener = (note: TrackedNote) => void;
export type ReleaseListener = (note: TrackedNote, sustainSec: number) => void;

export class NoteTracker {
  opts: Required<TrackerOptions>;
  private note: TrackedNote | null = null;
  private candidate: { midi: number; since: number } | null = null;
  private centsHistory: number[] = [];
  private prevDb = -Infinity;
  private noiseFloor = -70;
  private lastSustain = 0;
  onNote: NoteListener | null = null;
  onRelease: ReleaseListener | null = null;

  constructor(opts: TrackerOptions) {
    this.opts = { autoGate: false, minClarity: 0.7, stableMs: 90, releaseMs: 200, onsetJumpDb: 10, ...opts };
  }

  setOptions(opts: Partial<TrackerOptions>) {
    this.opts = { ...this.opts, ...opts };
  }

  reset() {
    this.note = null;
    this.candidate = null;
    this.centsHistory = [];
    this.lastSustain = 0;
  }

  update(frame: Frame): TrackerState {
    const { t, freq, clarity, levelDb } = frame;
    const o = this.opts;
    // Noise floor: drops quickly to quiet levels, creeps up slowly (~1.5 dB/s at 60 fps).
    if (Number.isFinite(levelDb)) {
      if (levelDb < this.noiseFloor) this.noiseFloor = levelDb;
      else this.noiseFloor += 0.025;
    }
    const gate = o.autoGate ? Math.max(-90, Math.min(-35, this.noiseFloor + 8)) : o.gateDb;
    const voiced = freq !== null && clarity >= o.minClarity && levelDb >= gate;
    const rawMidi = voiced ? freqToMidi(freq!, o.a4) : null;
    const jumped = levelDb - this.prevDb >= o.onsetJumpDb && levelDb >= gate;
    this.prevDb = levelDb;

    // A sharp level jump means the string was picked again: end the current note.
    if (jumped && this.note) this.release(t);

    if (rawMidi !== null) {
      const n = this.note;
      if (n && this.sameNote(rawMidi, n.midi)) {
        n.lastSeen = t;
        n.peakDb = Math.max(n.peakDb, levelDb);
        // Only update cents from frames in the note's own octave (decaying notes can octave-jump).
        if (Math.abs(rawMidi - n.midi) < 0.6) this.pushCents((rawMidi - n.midi) * 100);
        n.cents = this.medianCents();
        this.candidate = null;
      } else {
        const nearest = Math.round(rawMidi);
        if (this.candidate && this.candidate.midi === nearest) {
          if (t - this.candidate.since >= o.stableMs) {
            if (this.note) this.release(t);
            this.centsHistory = [];
            this.pushCents((rawMidi - nearest) * 100);
            this.note = {
              midi: nearest,
              cents: this.medianCents(),
              startedAt: this.candidate.since,
              lastSeen: t,
              peakDb: levelDb,
            };
            this.candidate = null;
            this.onNote?.({ ...this.note });
          }
        } else {
          this.candidate = { midi: nearest, since: t };
        }
      }
    } else {
      this.candidate = null;
    }

    if (this.note && t - this.note.lastSeen > o.releaseMs) this.release(t);

    const ringing = this.note !== null;
    return {
      levelDb,
      noiseFloorDb: this.noiseFloor,
      effectiveGateDb: gate,
      freq,
      clarity,
      rawMidi,
      note: this.note ? { ...this.note } : null,
      sustainSec: ringing ? (t - this.note!.startedAt) / 1000 : this.lastSustain,
      ringing,
    };
  }

  private sameNote(raw: number, midi: number): boolean {
    // Allow bends/vibrato within ~half a semitone, and transient octave errors.
    for (const k of [0, 12, -12]) if (Math.abs(raw - (midi + k)) < 0.6) return true;
    return false;
  }

  private release(_t: number) {
    if (!this.note) return;
    const sustain = (this.note.lastSeen - this.note.startedAt) / 1000;
    this.lastSustain = sustain;
    const n = this.note;
    this.note = null;
    this.onRelease?.(n, sustain);
  }

  private pushCents(c: number) {
    this.centsHistory.push(c);
    if (this.centsHistory.length > 9) this.centsHistory.shift();
  }

  private medianCents(): number {
    if (this.centsHistory.length === 0) return 0;
    const s = [...this.centsHistory].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }
}
