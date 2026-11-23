import { useEffect, useState, type ReactNode } from 'react';
import {
  SCALES,
  TUNING_PRESETS,
  findPresetId,
  midiToName,
  pcName,
  presetMidi,
} from '../lib/music';
import {
  ANY_KEY,
  DEFAULT_SETTINGS,
  FRET_COUNT_OPTIONS,
  MAX_NOTE_LENGTH,
  MIN_NOTE_LENGTH,
  normalizeSettings,
  type Settings,
} from '../lib/settings';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  candidateCount: number;
  onClose: () => void;
}

const NOTE_OPTIONS = Array.from({ length: 48 }, (_, i) => 23 + i); // B0 .. A#4

/** Number box that only applies its value once it's valid (on blur / Enter), so typing isn't fought. */
function SecondsInput({ value, disabled, onCommit }: { value: number; disabled?: boolean; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const v = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(v)) setDraft(String(value));
    else onCommit(Math.min(MAX_NOTE_LENGTH, Math.max(MIN_NOTE_LENGTH, v)));
  };
  return (
    <input
      type="number"
      min={MIN_NOTE_LENGTH}
      max={MAX_NOTE_LENGTH}
      step={0.5}
      value={draft}
      disabled={disabled}
      onChange={(e) => {
        setDraft(e.target.value);
        const v = Number(e.target.value);
        // Apply straight away when it's already a sensible number (e.g. spinner clicks).
        if (e.target.value !== '' && v >= MIN_NOTE_LENGTH && v <= MAX_NOTE_LENGTH) onCommit(v);
      }}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-section">
      <h4>{title}</h4>
      {children}
    </section>
  );
}

export function SettingsPanel({ settings: s, onChange, candidateCount, onClose }: Props) {
  const set = (patch: Partial<Settings>) => onChange(normalizeSettings({ ...s, ...patch }));
  const presetId = findPresetId(s.tuning);

  return (
    <aside className="settings" aria-label="Settings">
      <div className="settings-head">
        <h2>Settings</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close settings">
          ✕
        </button>
      </div>

      <Section title="Tuning">
        <label className="field">
          <span>Preset</span>
          <select
            value={presetId}
            onChange={(e) => {
              const p = TUNING_PRESETS.find((t) => t.id === e.target.value);
              if (p) set({ tuning: presetMidi(p), enabledStrings: p.notes.map(() => true) });
            }}
          >
            {TUNING_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            {presetId === 'custom' && <option value="custom">Custom</option>}
          </select>
        </label>
        <div className="string-grid" style={{ gridTemplateColumns: `repeat(${s.tuning.length}, 1fr)` }}>
          {s.tuning.map((midi, i) => (
            <div key={i} className="string-cell">
              <select
                aria-label={`String ${s.tuning.length - i} tuning`}
                value={midi}
                onChange={(e) => {
                  const tuning = [...s.tuning];
                  tuning[i] = Number(e.target.value);
                  set({ tuning });
                }}
              >
                {NOTE_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {midiToName(m, s.useFlats)}
                  </option>
                ))}
              </select>
              <label className="check small" title="Include this string in practice">
                <input
                  type="checkbox"
                  checked={s.enabledStrings[i] !== false}
                  onChange={(e) => {
                    const enabledStrings = [...s.enabledStrings];
                    enabledStrings[i] = e.target.checked;
                    set({ enabledStrings });
                  }}
                />
                <span>{s.tuning.length - i}</span>
              </label>
            </div>
          ))}
        </div>
        <p className="hint">Low string on the left. Untick a string to leave it out of practice.</p>
      </Section>

      <Section title="Fretboard range">
        <div className="row">
          <label className="field">
            <span>Frets on guitar</span>
            <select
              value={s.fretCount}
              onChange={(e) => {
                const fretCount = Number(e.target.value);
                // If the range covered the whole neck, keep it covering the whole neck.
                set({ fretCount, maxFret: s.maxFret === s.fretCount ? fretCount : s.maxFret });
              }}
            >
              {FRET_COUNT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>From fret</span>
            <input type="number" min={0} max={s.maxFret} value={s.minFret} onChange={(e) => set({ minFret: Number(e.target.value) })} />
          </label>
          <label className="field">
            <span>To fret</span>
            <input type="number" min={s.minFret} max={s.fretCount} value={s.maxFret} onChange={(e) => set({ maxFret: Number(e.target.value) })} />
          </label>
        </div>
      </Section>

      <Section title="Key & scale">
        <div className="row">
          <label className="field">
            <span>Key</span>
            <select value={s.keyRoot} onChange={(e) => set({ keyRoot: Number(e.target.value) })} disabled={s.scaleId === 'chromatic'}>
              <option value={ANY_KEY}>Any key</option>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i}>
                  {pcName(i, s.useFlats)}
                </option>
              ))}
            </select>
          </label>
          <label className="field grow">
            <span>Scale / mode</span>
            <select value={s.scaleId} onChange={(e) => set({ scaleId: e.target.value })}>
              {(['Any', 'Modes', 'Scales'] as const).map((g) => (
                <optgroup key={g} label={g}>
                  {SCALES.filter((sc) => sc.group === g).map((sc) => (
                    <option key={sc.id} value={sc.id}>
                      {sc.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>
        {s.scaleId !== 'chromatic' && s.keyRoot === ANY_KEY && (
          <label className="field">
            <span>
              Random key changes every <b>{s.keyChangeEvery} notes</b>
            </span>
            <input type="range" min={1} max={30} step={1} value={s.keyChangeEvery} onChange={(e) => set({ keyChangeEvery: Number(e.target.value) })} />
          </label>
        )}
        <p className="hint">
          {s.scaleId === 'chromatic'
            ? 'Any note can come up. Pick a scale or mode to stay inside a key.'
            : s.keyRoot === ANY_KEY
              ? 'A random key is chosen and shown at the top; it changes as you practise.'
              : 'Only notes from this key and scale will come up.'}
        </p>
        <p className={`hint ${candidateCount === 0 ? 'warn' : ''}`}>
          {candidateCount === 0
            ? 'No notes match these settings — widen the range or pick more strings.'
            : `${candidateCount} fretboard positions in the pool.`}
        </p>
      </Section>

      <Section title="Practice">
        <label className="check">
          <input type="checkbox" checked={s.hideTarget} onChange={(e) => set({ hideTarget: e.target.checked })} />
          <span>Hide the target note (find it by ear, press V to reveal)</span>
        </label>
      </Section>

      <Section title="Sound">
        <label className="field">
          <span>Note sustain (seconds)</span>
          <SecondsInput value={s.noteLength} disabled={s.infiniteSustain} onCommit={(noteLength) => set({ noteLength })} />
        </label>
        <label className="check">
          <input type="checkbox" checked={s.infiniteSustain} onChange={(e) => set({ infiniteSustain: e.target.checked })} />
          <span>Infinite sustain (rings until you press Space again)</span>
        </label>
        <p className="hint">How long the app holds each note it plays, with a clean electric tone. Loudness follows your system volume.</p>
        <label className="field">
          <span>
            Concert pitch A4 = <b>{s.a4} Hz</b>
          </span>
          <input type="range" min={430} max={450} step={1} value={s.a4} onChange={(e) => set({ a4: Number(e.target.value) })} />
        </label>
      </Section>

      <Section title="Display">
        <label className="check">
          <input type="checkbox" checked={s.showScaleNotes} onChange={(e) => set({ showScaleNotes: e.target.checked })} />
          <span>Mark notes in the practice pool</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={s.showNoteNames} onChange={(e) => set({ showNoteNames: e.target.checked })} />
          <span>Show note names on the fretboard</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={s.useFlats} onChange={(e) => set({ useFlats: e.target.checked })} />
          <span>Use flats (Bb) instead of sharps (A#)</span>
        </label>
      </Section>

      <button className="btn ghost full" onClick={() => onChange(DEFAULT_SETTINGS)}>
        Reset to defaults
      </button>
    </aside>
  );
}
