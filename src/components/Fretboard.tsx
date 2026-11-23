import { useMemo } from 'react';
import { midiToName, pcName, pitchClass, type FretPosition } from '../lib/music';

interface Props {
  tuning: number[];
  fretCount: number;
  minFret: number;
  maxFret: number;
  enabledStrings: boolean[];
  candidates: FretPosition[];
  showScaleNotes: boolean;
  showNoteNames: boolean;
  useFlats: boolean;
  target: FretPosition | null;
  /** Show the target's position (once revealed). */
  targetVisible: boolean;
  onPositionClick?: (p: FretPosition) => void;
}

const INLAYS = [3, 5, 7, 9, 15, 17, 19, 21, 27];
const DOUBLE_INLAYS = [12, 24];

const NUT_X = 64;
const RIGHT_PAD = 24;
const TOP = 26;
const STRING_GAP = 30;
const VIEW_W = 1200;

export function Fretboard(props: Props) {
  const { tuning, fretCount, minFret, maxFret, enabledStrings, useFlats } = props;
  const nStrings = tuning.length;
  const boardH = (nStrings - 1) * STRING_GAP;
  const viewH = TOP + boardH + 46;

  // Fret wire x positions: a blend of real (logarithmic) spacing and even spacing for readability.
  const fretX = useMemo(() => {
    const usable = VIEW_W - NUT_X - RIGHT_PAD;
    const realTotal = 1 - Math.pow(2, -fretCount / 12);
    return Array.from({ length: fretCount + 1 }, (_, f) => {
      const real = (1 - Math.pow(2, -f / 12)) / realTotal;
      const even = f / fretCount;
      return NUT_X + usable * (0.55 * real + 0.45 * even);
    });
  }, [fretCount]);

  const noteX = (fret: number) => (fret === 0 ? NUT_X - 24 : (fretX[fret - 1] + fretX[fret]) / 2);
  const stringY = (s: number) => TOP + (nStrings - 1 - s) * STRING_GAP;

  const candidateKeys = useMemo(
    () => new Set(props.candidates.map((p) => `${p.string}:${p.fret}`)),
    [props.candidates],
  );

  const target = props.targetVisible ? props.target : null;

  return (
    <div className="fretboard-scroll">
      <svg
        className="fretboard"
        viewBox={`0 0 ${VIEW_W} ${viewH}`}
        role="img"
        aria-label="Guitar fretboard"
        style={{ minWidth: 860 }}
      >
        <defs>
          <linearGradient id="wood" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--wood-1)" />
            <stop offset="1" stopColor="var(--wood-2)" />
          </linearGradient>
        </defs>

        {/* Board */}
        <rect x={NUT_X} y={TOP - 14} width={fretX[fretCount] - NUT_X} height={boardH + 28} fill="url(#wood)" rx="3" />

        {/* Out-of-range shading */}
        {minFret > 0 && (
          <rect className="out-of-range" x={NUT_X - 44} y={TOP - 14} width={fretX[minFret - 1] - NUT_X + 44} height={boardH + 28} />
        )}
        {maxFret < fretCount && (
          <rect className="out-of-range" x={fretX[maxFret]} y={TOP - 14} width={fretX[fretCount] - fretX[maxFret]} height={boardH + 28} />
        )}

        {/* Inlays */}
        {Array.from({ length: fretCount }, (_, i) => i + 1).map((f) => {
          const x = noteX(f);
          const mid = TOP + boardH / 2;
          if (DOUBLE_INLAYS.includes(f))
            return (
              <g key={`inlay${f}`} className="inlay">
                <circle cx={x} cy={mid - STRING_GAP} r="6" />
                <circle cx={x} cy={mid + STRING_GAP} r="6" />
              </g>
            );
          if (INLAYS.includes(f)) return <circle key={`inlay${f}`} className="inlay" cx={x} cy={mid} r="6" />;
          return null;
        })}

        {/* Frets */}
        {fretX.map((x, f) => (
          <line
            key={`fret${f}`}
            className={f === 0 ? 'nut' : 'fret'}
            x1={x}
            x2={x}
            y1={TOP - 14}
            y2={TOP + boardH + 14}
          />
        ))}

        {/* Fret numbers */}
        {Array.from({ length: fretCount + 1 }, (_, f) => (
          <text
            key={`num${f}`}
            className={`fret-num ${INLAYS.includes(f) || DOUBLE_INLAYS.includes(f) ? 'marked' : ''}`}
            x={noteX(f)}
            y={TOP + boardH + 36}
          >
            {f}
          </text>
        ))}

        {/* Target string highlight (shown even while the note itself is hidden) */}
        {props.target && (
          <rect
            className="string-highlight"
            x={NUT_X - 44}
            y={stringY(props.target.string) - STRING_GAP / 2 + 2}
            width={fretX[fretCount] - NUT_X + 44}
            height={STRING_GAP - 4}
            rx="6"
          />
        )}

        {/* Strings */}
        {tuning.map((open, s) => (
          <g
            key={`str${s}`}
            className={`${enabledStrings[s] === false ? 'string-off' : ''} ${props.target?.string === s ? 'string-target' : ''}`}
          >
            <line
              className="string"
              x1={NUT_X}
              x2={fretX[fretCount]}
              y1={stringY(s)}
              y2={stringY(s)}
              strokeWidth={0.8 + ((nStrings - 1 - s) / Math.max(1, nStrings - 1)) * 2.2}
            />
            <text className="string-label" x={6} y={stringY(s) + 4}>
              {nStrings - s} {pcName(open, useFlats)}
            </text>
          </g>
        ))}

        {/* Clickable hit areas + scale notes */}
        {tuning.map((open, s) =>
          Array.from({ length: fretCount + 1 }, (_, f) => {
            const key = `${s}:${f}`;
            const inScale = candidateKeys.has(key);
            const midi = open + f;
            return (
              <g
                key={`hit${key}`}
                className="hit"
                onClick={() => props.onPositionClick?.({ string: s, fret: f, midi })}
              >
                <title>{`${midiToName(midi, useFlats)} — string ${nStrings - s}, fret ${f}`}</title>
                <rect x={noteX(f) - 16} y={stringY(s) - STRING_GAP / 2} width={32} height={STRING_GAP} fill="transparent" />
                {props.showScaleNotes && inScale && <circle className="scale-dot" cx={noteX(f)} cy={stringY(s)} r="4" />}
                {props.showNoteNames && (
                  <text className={`note-name ${inScale ? '' : 'dim'}`} x={noteX(f)} y={stringY(s) - 7}>
                    {pcName(pitchClass(midi), useFlats)}
                  </text>
                )}
              </g>
            );
          }),
        )}

        {/* Target */}
        {target && (
          <g className="marker target">
            <circle className="pulse" cx={noteX(target.fret)} cy={stringY(target.string)} r="14" />
            <circle cx={noteX(target.fret)} cy={stringY(target.string)} r="12" />
            <text x={noteX(target.fret)} y={stringY(target.string) + 4}>
              {pcName(target.midi, useFlats)}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
