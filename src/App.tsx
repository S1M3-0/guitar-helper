import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Fretboard } from './components/Fretboard';
import { SettingsPanel } from './components/SettingsPanel';
import { isPlaying, onPlaybackChange, playFrequency, stopPlayback } from './lib/audio';
import {
  candidatePositions,
  findPresetId,
  getScale,
  midiToFreq,
  midiToName,
  pcName,
  pickRandomPosition,
  TUNING_PRESETS,
  type FretPosition,
} from './lib/music';
import { ANY_KEY, loadSettings, saveSettings, type Settings } from './lib/settings';

interface PracticeNote {
  target: FretPosition;
  /** Tuning the note was generated with (so going back still makes sense after a tuning change). */
  tuning: number[];
  /** Key root the note was drawn from, or null when any note was allowed. */
  keyRoot: number | null;
  scaleId: string;
  /** Fret position shown (on the fretboard and in the target box). */
  revealed: boolean;
}

const randomKey = (avoid?: number) => {
  let k = Math.floor(Math.random() * 12);
  if (k === avoid) k = (k + 1 + Math.floor(Math.random() * 11)) % 12;
  return k;
};

const MAX_HISTORY = 200;

export default function App() {
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const setSettings = useCallback((s: Settings) => {
    setSettingsState(s);
    saveSettings(s);
  }, []);

  const [notes, setNotes] = useState<PracticeNote[]>([]);
  const [index, setIndex] = useState(-1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  useEffect(() => onPlaybackChange(setPlaying), []);

  // Random-key rotation state (only used with a scale and "Any key").
  const keyState = useRef({ key: randomKey(), notesInKey: 0 });
  const [randomKeyRoot, setRandomKeyRoot] = useState(keyState.current.key);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const indexRef = useRef(index);
  indexRef.current = index;

  const current = index >= 0 ? notes[index] : null;
  const keyIsRandom = settings.keyRoot === ANY_KEY && settings.scaleId !== 'chromatic';
  const activeKey = settings.keyRoot === ANY_KEY ? randomKeyRoot : settings.keyRoot;

  const candidates = useMemo(
    () => candidatePositions({ ...settings, keyRoot: activeKey }),
    [settings.tuning, settings.minFret, settings.maxFret, settings.enabledStrings, activeKey, settings.scaleId],
  );

  // ---------------------------------------------------------------------------
  // Playback and navigation

  const play = useCallback((midi: number) => {
    const s = settingsRef.current;
    playFrequency(midiToFreq(midi, s.a4), { length: s.noteLength, infinite: s.infiniteSustain });
  }, []);

  const goTo = useCallback(
    (i: number) => {
      const n = notesRef.current[i];
      if (!n) return;
      setIndex(i);
      play(n.target.midi);
    },
    [play],
  );

  const next = useCallback(() => {
    const list = notesRef.current;
    const i = indexRef.current;
    // Moving forward through notes you went back to.
    if (i < list.length - 1) {
      goTo(i + 1);
      return;
    }

    const s = settingsRef.current;
    let keyRoot: number | null = null;
    if (s.scaleId !== 'chromatic') {
      if (s.keyRoot === ANY_KEY) {
        const k = keyState.current;
        if (k.notesInKey >= s.keyChangeEvery) {
          k.key = randomKey(k.key);
          k.notesInKey = 0;
          setRandomKeyRoot(k.key);
        }
        k.notesInKey += 1;
        keyRoot = k.key;
      } else keyRoot = s.keyRoot;
    }

    const previous = list[i]?.target ?? null;
    const pick = pickRandomPosition(candidatePositions({ ...s, keyRoot: keyRoot ?? 0 }), previous);
    if (!pick) return;
    const note: PracticeNote = { target: pick, tuning: s.tuning, keyRoot, scaleId: s.scaleId, revealed: false };
    const updated = [...list, note].slice(-MAX_HISTORY);
    notesRef.current = updated;
    setNotes(updated);
    setIndex(updated.length - 1);
    indexRef.current = updated.length - 1;
    play(pick.midi);
  }, [goTo, play]);

  const prev = useCallback(() => {
    if (indexRef.current > 0) goTo(indexRef.current - 1);
  }, [goTo]);

  const replay = useCallback(() => {
    const n = notesRef.current[indexRef.current];
    if (n) play(n.target.midi);
    else next();
  }, [play, next]);

  // Space: replay — or, with infinite sustain, stop the note that is ringing.
  const replayOrStop = useCallback(() => {
    if (settingsRef.current.infiniteSustain && isPlaying()) stopPlayback();
    else replay();
  }, [replay]);

  // Turning infinite sustain off shouldn't leave a note ringing forever.
  useEffect(() => {
    if (!settings.infiniteSustain) stopPlayback();
  }, [settings.infiniteSustain]);

  const reveal = useCallback(() => {
    const i = indexRef.current;
    if (i < 0) return;
    setNotes((list) => list.map((n, j) => (j === i ? { ...n, revealed: true } : n)));
  }, []);

  useEffect(() => () => stopPlayback(), []);

  // ---------------------------------------------------------------------------
  // Keyboard: Space = replay, ← / → = previous / next note, V = reveal

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'Space') {
        e.preventDefault();
        replayOrStop();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prev();
      } else if (e.key === 'v' || e.key === 'V') reveal();
      else if (e.key === 'Escape') setSettingsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [replayOrStop, next, prev, reveal]);

  // ---------------------------------------------------------------------------
  // Display

  const s = settings;
  const tuning = current?.tuning ?? s.tuning;
  const target = current?.target ?? null;
  const revealed = current?.revealed ?? false;
  // The note name is always shown unless the user hides it; revealing also shows it.
  const nameVisible = !s.hideTarget || revealed;
  const presetName = TUNING_PRESETS.find((p) => p.id === findPresetId(s.tuning))?.name.split(' (')[0] ?? 'Custom';
  const keyLabel =
    s.scaleId === 'chromatic' ? 'Any note' : `${pcName(activeKey, s.useFlats)} ${getScale(s.scaleId).name}`;
  const noteKeyLabel =
    current && current.keyRoot !== null ? `${pcName(current.keyRoot, s.useFlats)} ${getScale(current.scaleId).name}` : null;
  const stringNo = (i: number) => tuning.length - i;
  const tuningChanged = current !== null && current.tuning.join() !== s.tuning.join();

  let hint: string;
  if (!target) hint = 'Press Space or → to hear your first note.';
  else if (revealed)
    hint = `${midiToName(target.midi, s.useFlats)} is ${target.fret === 0 ? 'the open string' : `fret ${target.fret}`} on string ${stringNo(target.string)}. Press → for the next note.`;
  else if (s.hideTarget)
    hint = `Find it on string ${stringNo(target.string)} by ear. Click the fretboard to compare notes, then press V to check.`;
  else
    hint = `Find ${midiToName(target.midi, s.useFlats)} on string ${stringNo(target.string)}, then press V to check the fret.`;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            ♪
          </span>
          <h1>Guitar Helper</h1>
        </div>
        <nav className="mode-tabs" aria-label="Practice mode">
          <button className={s.mode === 'notes' ? 'active' : ''} onClick={() => setSettings({ ...s, mode: 'notes' })}>
            Single notes
          </button>
          <button disabled title="Chord practice is coming soon">
            Chords <span className="soon">soon</span>
          </button>
        </nav>
        <div className="topbar-right">
          <button className="btn ghost" onClick={() => setSettingsOpen((o) => !o)} aria-expanded={settingsOpen}>
            ⚙ Settings
          </button>
        </div>
      </header>

      <div className="summary-chips">
        <span className="chip">{presetName}</span>
        <span className="chip">
          Frets {s.minFret}–{s.maxFret} of {s.fretCount}
        </span>
        <span className={`chip ${keyIsRandom ? 'key' : ''}`}>
          {keyLabel}
          {keyIsRandom && ' (random key)'}
        </span>
        {s.enabledStrings.some((e) => !e) && (
          <span className="chip">
            Strings{' '}
            {s.tuning
              .map((_, i) => i)
              .filter((i) => s.enabledStrings[i])
              .map((i) => s.tuning.length - i)
              .join(', ')}
          </span>
        )}
      </div>

      <main className="layout">
        <section className="card practice-card">
          <div className="target-area">
            <div className="label">
              {target ? `Note ${index + 1}${index < notes.length - 1 ? ` of ${notes.length}` : ''}` : 'Target'}
              {noteKeyLabel && <span className="note-key"> · {noteKeyLabel}</span>}
            </div>
            {target ? (
              <div className="target-string">
                Play on <b>string {stringNo(target.string)}</b>
                <span className="string-badge">{pcName(tuning[target.string], s.useFlats)}</span>
              </div>
            ) : (
              <div className="target-string muted">—</div>
            )}
            <div className={`target-note ${target && nameVisible ? 'shown' : ''}`}>{target && nameVisible ? midiToName(target.midi, s.useFlats) : '?'}</div>
            <div className="target-pos">
              {target && revealed
                ? target.fret === 0
                  ? 'open string'
                  : `fret ${target.fret}`
                : target
                  ? s.hideTarget
                    ? 'Find the note by ear'
                    : 'Find the fret'
                  : ''}
            </div>
          </div>

          <div className="control-area">
            <p className="feedback" role="status">
              {hint}
            </p>
            {tuningChanged && <p className="hint warn">This note was played in your previous tuning.</p>}
            <div className="controls">
              <button className="btn" onClick={prev} disabled={index <= 0} title="Previous note">
                ← Prev <kbd>←</kbd>
              </button>
              <button className="btn" onClick={replayOrStop} disabled={candidates.length === 0 && !target} title="Replay the note">
                {s.infiniteSustain && playing ? '■ Stop' : '↻ Replay'} <kbd>Space</kbd>
              </button>
              <button className="btn" onClick={reveal} disabled={!target || revealed} title="Show the fret on the fretboard">
                👁 Reveal <kbd>V</kbd>
              </button>
              <button className="btn primary" onClick={next} disabled={candidates.length === 0} title="Next note">
                {target ? 'Next' : 'Start'} → <kbd>→</kbd>
              </button>
            </div>
            {candidates.length === 0 && <p className="hint warn">No notes match your settings — open Settings to widen the range.</p>}
          </div>
        </section>

        <section className="card fretboard-card">
          <div className="card-head">
            <h3>Fretboard</h3>
            <div className="legend">
              <span className="lg string">target string</span>
              <span className="lg target">target</span>
              {s.showScaleNotes && <span className="lg pool">practice pool</span>}
              <span className="muted">Click any position to hear it</span>
            </div>
          </div>
          <Fretboard
            tuning={s.tuning}
            fretCount={s.fretCount}
            minFret={s.minFret}
            maxFret={s.maxFret}
            enabledStrings={s.enabledStrings}
            candidates={candidates}
            showScaleNotes={s.showScaleNotes}
            showNoteNames={s.showNoteNames}
            useFlats={s.useFlats}
            target={tuningChanged ? null : target}
            targetVisible={revealed}
            onPositionClick={(p) => play(p.midi)}
          />
        </section>

        {notes.length > 0 && (
          <section className="card history-card">
            <div className="card-head">
              <h3>Notes so far</h3>
              <button
                className="btn ghost small"
                onClick={() => {
                  stopPlayback();
                  setNotes([]);
                  setIndex(-1);
                }}
              >
                Clear
              </button>
            </div>
            <div className="history">
              {notes.map((n, i) => (
                <button key={i} className={`hist ${i === index ? 'current' : ''} ${n.revealed ? 'revealed' : ''}`} onClick={() => goTo(i)}>
                  <b>{n.revealed || !s.hideTarget ? midiToName(n.target.midi, s.useFlats) : '?'}</b>
                  <span>
                    str {n.tuning.length - n.target.string}
                    {n.revealed && ` · fr ${n.target.fret}`}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
      </main>

      {settingsOpen && (
        <>
          <div className="scrim" onClick={() => setSettingsOpen(false)} />
          <SettingsPanel settings={settings} onChange={setSettings} candidateCount={candidates.length} onClose={() => setSettingsOpen(false)} />
        </>
      )}

      <footer className="foot">
        Shortcuts: <kbd>Space</kbd> {s.infiniteSustain ? 'replay / stop' : 'replay'} · <kbd>←</kbd> previous note · <kbd>→</kbd> next note · <kbd>V</kbd> reveal fret
      </footer>
    </div>
  );
}
