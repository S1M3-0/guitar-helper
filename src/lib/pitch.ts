// Monophonic pitch detection using the YIN algorithm
// (de Cheveigné & Kawahara, 2002), tuned for the guitar's range.

export interface PitchResult {
  /** Detected fundamental in Hz, or null when no clear pitch is present. */
  freq: number | null;
  /** 0..1, how periodic the signal is (1 = perfectly periodic). */
  clarity: number;
}

export interface YinOptions {
  minFreq?: number;
  maxFreq?: number;
  threshold?: number;
}

export function rmsDb(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  const rms = Math.sqrt(sum / buf.length);
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
}

let diffScratch = new Float32Array(0);

export function detectPitch(buf: Float32Array, sampleRate: number, opts: YinOptions = {}): PitchResult {
  const minFreq = opts.minFreq ?? 55; // below drop-A on a 7 string
  const maxFreq = opts.maxFreq ?? 1600; // above 24th fret on high E
  const threshold = opts.threshold ?? 0.12;

  const tauMin = Math.max(2, Math.floor(sampleRate / maxFreq));
  const tauMax = Math.min(Math.floor(sampleRate / minFreq), Math.floor(buf.length / 2));
  const W = buf.length - tauMax;
  if (tauMax <= tauMin || W <= 0) return { freq: null, clarity: 0 };

  if (diffScratch.length < tauMax + 1) diffScratch = new Float32Array(tauMax + 1);
  const d = diffScratch;

  // Difference function
  d[0] = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let j = 0; j < W; j++) {
      const delta = buf[j] - buf[j + tau];
      sum += delta * delta;
    }
    d[tau] = sum;
  }

  // Cumulative mean normalised difference
  d[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += d[tau];
    d[tau] = running > 0 ? (d[tau] * tau) / running : 1;
  }

  // Absolute threshold: first dip below threshold, then walk to its local minimum
  let tauEst = -1;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (d[tau] < threshold) {
      while (tau + 1 <= tauMax && d[tau + 1] < d[tau]) tau++;
      tauEst = tau;
      break;
    }
  }

  // Fallback: global minimum if it's reasonably periodic
  if (tauEst === -1) {
    let best = tauMin;
    for (let tau = tauMin + 1; tau <= tauMax; tau++) if (d[tau] < d[best]) best = tau;
    if (d[best] < 0.35) tauEst = best;
    else return { freq: null, clarity: Math.max(0, 1 - d[best]) };
  }

  // Parabolic interpolation for sub-sample accuracy
  let betterTau = tauEst;
  if (tauEst > 1 && tauEst < tauMax) {
    const s0 = d[tauEst - 1];
    const s1 = d[tauEst];
    const s2 = d[tauEst + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) betterTau = tauEst + (s2 - s0) / denom;
  }

  return { freq: sampleRate / betterTau, clarity: Math.max(0, Math.min(1, 1 - d[tauEst])) };
}
