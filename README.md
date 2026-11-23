# guitar-helper
App to help you practice guitar, specifically playing by ear and recognising chords/ notes.

## What it does (so far)

**Single-note ear training**

1. Press **Space** or **→**. The app plays a random note with a clean electric guitar tone and tells you which **string** to find it on. The string changes every note, so you learn the whole neck.
2. Find the fret by ear. You can click any fretboard position to hear it and compare.
3. Press **V** to reveal the note and its fret on the fretboard.
4. Press **→** for a new note, or **←** to go back through earlier notes. You can also click any note in "Notes so far".

**Settings** (saved in your browser)

- Tuning: presets (Standard, Drop D, Eb, D Standard, Drop C, DADGAD, Open G/D/E, 7-string) or set each string yourself.
- Number of frets (19 to 27, default 22), plus a from/to fret range and which strings to use.
- Scale/mode filter (major modes, harmonic/melodic minor, pentatonics, blues) with an optional key. With **Any key** a random key is chosen and changes every N notes. The default is any note.
- Note sustain (how long the app holds each note), volume, A4 reference pitch, and easy mode (reveal each note straight away).

Shortcuts: `Space` replay · `←` previous note · `→` next note · `V` reveal.

Chord mode is planned next.

## Running it

Requires Node 18+.

```
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests
npm run build
```

## How it works

- `src/lib/music.ts`: note maths, tunings, scales and picking fretboard positions.
- `src/lib/pitch.ts`, `src/lib/tracker.ts`: pitch detection and note tracking from the earlier listening feature. The app doesn't use them right now; the tests use them to check the synth is in tune.
- `src/lib/synth.ts`: electric-string synth (Karplus-Strong with pick and pickup position). 
- `src/lib/audio.ts`: Web Audio playback through a clean amp, cab and reverb chain.
- `src/components/`: fretboard SVG and the settings drawer.
