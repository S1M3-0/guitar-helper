// Electric-guitar string synthesis: Karplus-Strong with a fractional delay
// (so high notes stay in tune), a pick-position comb on the excitation and a
// bridge-pickup comb on the output. The amp/cab colouring is applied later in
// the Web Audio graph (see audio.ts). Rendered offline into a Float32Array.
//
// After the pluck's bright attack has settled, the level is shaped to follow a
// slow exponential decay (or held steady for infinite sustain, where the end of
// the buffer is a seamless loop).

export interface PluckOptions {
  /** Total length in seconds (the note is held this long, then faded). Ignored when `loop` is set. */
  duration?: number;
  /** Render a sustaining note whose tail can be looped forever (see loopStart/loopEnd). */
  loop?: boolean;
  /** 0..1, higher = brighter pick attack. */
  brightness?: number;
  /** Seconds for the low E to decay by 60 dB once the attack has settled. */
  decay?: number;
  /** Where the string is picked, as a fraction of its length from the bridge. */
  pickPosition?: number;
  /** Where the pickup sits, as a fraction of the string length from the bridge. */
  pickupPosition?: number;
  /** Seconds of fade-out at the end, so playback never stops with a click. */
  fadeOut?: number;
  rand?: () => number;
}

export interface PluckResult {
  data: Float32Array;
  /** Loop region in samples (only when `loop` was requested). */
  loopStart?: number;
  loopEnd?: number;
}

/** Seconds after the pluck during which the natural attack is left untouched. */
const SETTLE = 0.5;
const LOOP_RENDER_SECONDS = 3.2;
const LOOP_LENGTH_SECONDS = 1.5;
const CROSSFADE_SECONDS = 0.08;

export function renderPluck(freq: number, sampleRate: number, opts: PluckOptions = {}): PluckResult {
  const loop = opts.loop ?? false;
  const duration = loop ? LOOP_RENDER_SECONDS : (opts.duration ?? 2);
  const brightness = opts.brightness ?? 0.85;
  const pickPos = opts.pickPosition ?? 0.18;
  const pickupPos = opts.pickupPosition ?? 0.12;
  const fadeOut = loop ? 0 : Math.min(opts.fadeOut ?? 0.25, duration / 3);
  const rand = opts.rand ?? Math.random;
  // Long, slow decay; high notes still fade a little sooner than low ones.
  const t60 = (opts.decay ?? 40) * Math.min(1, Math.pow(82 / freq, 0.15));

  const len = Math.floor(duration * sampleRate);
  const out = new Float32Array(len);
  const period = sampleRate / freq;
  const w = (2 * Math.PI * freq) / sampleRate;

  // Loop filter: weighted 2-point average. Plain Karplus-Strong (0.5/0.5) kills high
  // notes within a second, so the weighting is pushed towards 1 for high pitches to
  // cap the filter's loss at the fundamental.
  let damp = 0.5 + 0.3 * brightness;
  const maxLossPerSecond = 0.4; // nepers/s
  const lossFactor = (freq * w * w) / 2; // loss/s ≈ damp(1-damp) * lossFactor
  if (damp * (1 - damp) * lossFactor > maxLossPerSecond) {
    const p = maxLossPerSecond / lossFactor; // solve damp(1-damp) = p, damp > 0.5
    damp = 0.5 + Math.sqrt(Math.max(0, 0.25 - p));
  }

  // Loop delay = integer delay line + loop filter + first-order allpass for the
  // fractional part. The allpass is lossless (unlike linear interpolation, which
  // eats the fundamental of high notes) and is solved exactly so the pitch is true.
  const filterPhaseDelay = Math.atan2((1 - damp) * Math.sin(w), damp + (1 - damp) * Math.cos(w)) / w;
  const remaining = period - filterPhaseDelay;
  const intDelay = Math.max(2, Math.floor(remaining - 0.5));
  const apCoef = solveAllpass(remaining - intDelay, w);
  const filterMag = Math.hypot(damp + (1 - damp) * Math.cos(w), (1 - damp) * Math.sin(w));
  // Per-period loop gain for the target decay, compensating the filter's loss at the
  // fundamental. Never above 1, so the loop can't blow up.
  const gain = Math.min(1, Math.pow(10, -3 / (t60 * freq)) / filterMag);

  // Excitation: the string's shape when the pick lets go (a triangle peaking at the
  // pick point, which guarantees a solid fundamental), plus filtered noise combed at
  // the pick position for the bright, scratchy pick attack.
  const exLen = Math.max(2, Math.round(period));
  const pickOffset = Math.max(1, Math.round(pickPos * period));
  const alpha = 0.2 + 0.75 * brightness;
  const noise = new Float32Array(exLen);
  let lp = 0;
  for (let i = 0; i < exLen; i++) {
    lp += alpha * (rand() * 2 - 1 - lp);
    noise[i] = lp;
  }
  const shape = new Float32Array(exLen);
  const combed = new Float32Array(exLen);
  for (let i = 0; i < exLen; i++) {
    shape[i] = i < pickOffset ? i / pickOffset : (exLen - i) / (exLen - pickOffset);
    combed[i] = noise[i] - (i >= pickOffset ? noise[i - pickOffset] : 0);
  }
  const removeMean = (b: Float32Array) => {
    let m = 0;
    for (let i = 0; i < b.length; i++) m += b[i];
    m /= b.length;
    let e = 0;
    for (let i = 0; i < b.length; i++) {
      b[i] -= m;
      e += b[i] * b[i];
    }
    return Math.sqrt(e / b.length) || 1;
  };
  const shapeRms = removeMean(shape);
  const noiseRms = removeMean(combed);
  const noiseMix = 0.25 + 0.35 * brightness;
  const excitation = new Float32Array(exLen);
  for (let i = 0; i < exLen; i++) excitation[i] = shape[i] / shapeRms + (noiseMix * combed[i]) / noiseRms;

  const read = (buf: Float32Array, n: number): number => {
    if (n < 0) return 0;
    const i = Math.floor(n);
    const f = n - i;
    const a = buf[i];
    const b = i + 1 < buf.length ? buf[i + 1] : 0;
    return a + (b - a) * f;
  };

  let lfPrev = 0;
  let apPrev = 0;
  for (let n = 0; n < len; n++) {
    const v0 = n - intDelay >= 0 ? out[n - intDelay] : 0;
    const v1 = n - intDelay - 1 >= 0 ? out[n - intDelay - 1] : 0;
    const lf = damp * v0 + (1 - damp) * v1;
    const ap = apCoef * lf + lfPrev - apCoef * apPrev;
    lfPrev = lf;
    apPrev = ap;
    out[n] = (n < exLen ? excitation[n] : 0) + gain * ap;
  }

  // Bridge pickup: hears the string as a comb filter near the bridge (the "twang").
  const pickupOffset = pickupPos * period;
  const voiced = new Float32Array(len);
  for (let n = 0; n < len; n++) voiced[n] = out[n] - 0.7 * read(out, n - pickupOffset);

  shapeEnvelope(voiced, sampleRate, period, loop ? Infinity : t60);

  let loopStart: number | undefined;
  let loopEnd: number | undefined;
  if (loop) {
    // Loop a whole number of periods so the waveform lines up at the seam.
    const target = LOOP_LENGTH_SECONDS * freq;
    let best = Math.round(target);
    let bestErr = 1;
    for (let k = Math.round(target * 0.8); k <= Math.round(target * 1.2); k++) {
      const samples = k * period;
      const err = Math.abs(samples - Math.round(samples));
      if (err < bestErr) {
        bestErr = err;
        best = k;
      }
    }
    const loopLen = Math.round(best * period);
    loopEnd = len - Math.floor(0.05 * sampleRate);
    loopStart = loopEnd - loopLen;
    // Crossfade the end of the loop into the audio just before its start.
    const xf = Math.min(Math.floor(CROSSFADE_SECONDS * sampleRate), loopLen >> 1);
    for (let i = 0; i < xf; i++) {
      const t = i / xf;
      const idx = loopEnd - xf + i;
      voiced[idx] = voiced[idx] * (1 - t) + voiced[loopStart - xf + i] * t;
    }
  }

  // Normalise, soften the attack slightly and fade out.
  let peak = 0;
  for (let n = 0; n < len; n++) peak = Math.max(peak, Math.abs(voiced[n]));
  const norm = peak > 0 ? 0.8 / peak : 1;
  const attack = Math.floor(0.0015 * sampleRate);
  const fadeStart = len - Math.floor(fadeOut * sampleRate);
  for (let n = 0; n < len; n++) {
    let env = norm;
    if (n < attack) env *= n / attack;
    if (fadeOut > 0 && n > fadeStart) env *= Math.max(0, (len - n) / (len - fadeStart));
    voiced[n] *= env;
  }
  return { data: voiced, loopStart, loopEnd };
}

/**
 * Coefficient `a` of the allpass (a + z^-1) / (1 + a z^-1) whose phase delay at
 * angular frequency w equals `delay` samples (expected range ~0.5..1.5).
 */
function solveAllpass(delay: number, w: number): number {
  const phaseDelay = (a: number) => {
    // arg of (a + e^{-jw}) / (1 + a e^{-jw})
    const num = Math.atan2(-Math.sin(w), a + Math.cos(w));
    const den = Math.atan2(-a * Math.sin(w), 1 + a * Math.cos(w));
    return -(num - den) / w;
  };
  // Phase delay falls as a rises; bisect.
  let lo = -0.999;
  let hi = 0.999;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (phaseDelay(mid) > delay) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * After the attack, rescale the signal so its level follows exp decay with the
 * given T60 (Infinity = hold steady). The string's natural darkening over time is kept.
 */
function shapeEnvelope(buf: Float32Array, sampleRate: number, period: number, t60: number) {
  const len = buf.length;
  // Blocks of a whole number of periods (≥ 10 ms) give a ripple-free RMS envelope.
  const block = Math.max(1, Math.round(period * Math.ceil((0.01 * sampleRate) / period)));
  const nBlocks = Math.floor(len / block);
  if (nBlocks < 3) return;
  const env = new Float32Array(nBlocks);
  for (let b = 0; b < nBlocks; b++) {
    let sum = 0;
    for (let i = b * block; i < (b + 1) * block; i++) sum += buf[i] * buf[i];
    env[b] = Math.sqrt(sum / block);
  }
  const center = (b: number) => (b + 0.5) * block;
  const settleBlock = Math.min(nBlocks - 1, Math.floor((SETTLE * sampleRate) / block));
  const ref = env[settleBlock];
  if (!(ref > 0)) return;
  const rate = Number.isFinite(t60) ? 6.907755 / t60 : 0; // ln(1000) / T60

  const corr = new Float32Array(nBlocks);
  for (let b = 0; b < nBlocks; b++) {
    if (b <= settleBlock) {
      corr[b] = 1;
      continue;
    }
    const t = (center(b) - center(settleBlock)) / sampleRate;
    const desired = ref * Math.exp(-rate * t);
    corr[b] = env[b] > 1e-12 ? Math.min(1000, Math.max(0.05, desired / env[b])) : 1;
  }
  for (let n = 0; n < len; n++) {
    const pos = n / block - 0.5;
    const b0 = Math.max(0, Math.min(nBlocks - 1, Math.floor(pos)));
    const b1 = Math.min(nBlocks - 1, b0 + 1);
    const f = Math.max(0, Math.min(1, pos - b0));
    buf[n] *= corr[b0] + (corr[b1] - corr[b0]) * f;
  }
}
