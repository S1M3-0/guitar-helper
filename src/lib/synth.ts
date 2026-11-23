// Electric-guitar string synthesis: Karplus-Strong with a fractional delay
// (so high notes stay in tune), a pick-position comb on the excitation and a
// bridge-pickup comb on the output. The amp/cab colouring is applied later in
// the Web Audio graph (see audio.ts). Rendered offline into a Float32Array.

export interface PluckOptions {
  /** Total length in seconds (the note is held this long, then faded). */
  duration?: number;
  /** 0..1, higher = brighter pick attack. */
  brightness?: number;
  /** Seconds for the low E to decay by 60 dB (higher notes decay a bit faster). */
  decay?: number;
  /** Where the string is picked, as a fraction of its length from the bridge. */
  pickPosition?: number;
  /** Where the pickup sits, as a fraction of the string length from the bridge. */
  pickupPosition?: number;
  /** Seconds of fade-out at the end, so playback never stops with a click. */
  fadeOut?: number;
  rand?: () => number;
}

export function renderPluck(freq: number, sampleRate: number, opts: PluckOptions = {}): Float32Array {
  const duration = opts.duration ?? 2;
  const brightness = opts.brightness ?? 0.85;
  const pickPos = opts.pickPosition ?? 0.18;
  const pickupPos = opts.pickupPosition ?? 0.12;
  const fadeOut = Math.min(opts.fadeOut ?? 0.25, duration / 3);
  const rand = opts.rand ?? Math.random;
  // Solid-body electrics sustain far longer than acoustics; high notes still die sooner.
  const t60 = (opts.decay ?? 9) * Math.min(1, Math.pow(82 / freq, 0.3));

  const len = Math.floor(duration * sampleRate);
  const out = new Float32Array(len);

  // The 2-point averaging loop filter adds half a sample of delay.
  const period = sampleRate / freq;
  const delay = period - 0.5;
  const gain = Math.pow(10, -3 / (t60 * freq)); // per-period loop gain for the target T60
  // Lighter damping than plain Karplus-Strong keeps the upper harmonics alive (steel strings).
  const damp = 0.5 + 0.3 * brightness;

  // Excitation: one period of lightly filtered noise, combed at the pick position.
  const exLen = Math.max(2, Math.round(period));
  const alpha = 0.2 + 0.75 * brightness;
  const noise = new Float32Array(exLen);
  let lp = 0;
  for (let i = 0; i < exLen; i++) {
    lp += alpha * (rand() * 2 - 1 - lp);
    noise[i] = lp;
  }
  const pickOffset = Math.max(1, Math.round(pickPos * period));
  const excitation = new Float32Array(exLen);
  let mean = 0;
  for (let i = 0; i < exLen; i++) {
    excitation[i] = noise[i] - (i >= pickOffset ? noise[i - pickOffset] : 0);
    mean += excitation[i];
  }
  mean /= exLen;
  for (let i = 0; i < exLen; i++) excitation[i] -= mean; // remove DC

  const read = (n: number): number => {
    if (n < 0) return 0;
    const i = Math.floor(n);
    const frac = n - i;
    const a = out[i];
    const b = i + 1 < len ? out[i + 1] : 0;
    return a + (b - a) * frac;
  };

  // Loop filter: weighted 2-point average. Its group delay is (1 - damp) samples,
  // so correct the delay line length to keep the pitch exact.
  const loopDelay = delay + 0.5 - (1 - damp);
  for (let n = 0; n < len; n++) {
    const ex = n < exLen ? excitation[n] : 0;
    const back = n - loopDelay;
    const fb = back >= 1 ? (damp * read(back) + (1 - damp) * read(back - 1)) * gain : 0;
    out[n] = ex + fb;
  }

  // Bridge pickup: hears the string as a comb filter near the bridge (the "twang").
  const pickupOffset = pickupPos * period;
  const voiced = new Float32Array(len);
  for (let n = 0; n < len; n++) voiced[n] = out[n] - 0.7 * read(n - pickupOffset);

  // Normalise, soften the attack slightly and fade out.
  let peak = 0;
  for (let n = 0; n < len; n++) peak = Math.max(peak, Math.abs(voiced[n]));
  const norm = peak > 0 ? 0.8 / peak : 1;
  const attack = Math.floor(0.0015 * sampleRate);
  const fadeStart = len - Math.floor(fadeOut * sampleRate);
  for (let n = 0; n < len; n++) {
    let env = norm;
    if (n < attack) env *= n / attack;
    if (n > fadeStart) env *= Math.max(0, (len - n) / (len - fadeStart));
    voiced[n] *= env;
  }
  return voiced;
}
