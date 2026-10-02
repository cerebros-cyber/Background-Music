// Prozedurale Klangerzeugung mit der Web Audio API.
// Alle eingebauten Sounds entstehen hier live – es werden keine Audiodateien benötigt.

export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// ---------------------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------------------

const noiseCache = new WeakMap();

export function noiseBuffer(ctx, color = 'white') {
  let cache = noiseCache.get(ctx);
  if (!cache) noiseCache.set(ctx, (cache = {}));
  if (cache[color]) return cache[color];
  const len = ctx.sampleRate * 4;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (color === 'white') {
      d[i] = w;
    } else if (color === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    } else {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
  }
  cache[color] = buf;
  return buf;
}

export function impulseResponse(ctx, seconds = 3.2, decay = 2.6) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // leicht tiefpassgefiltertes Rauschen, das mit der Zeit dunkler wird
      const k = 0.15 + 0.8 * (1 - t);
      lp += k * ((Math.random() * 2 - 1) - lp);
      d[i] = lp * Math.pow(1 - t, decay);
    }
  }
  return buf;
}

function filter(ctx, type, freq, Q = 1) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = Q;
  return f;
}

function gain(ctx, v = 1) {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
}

function panner(ctx, v) {
  if (!ctx.createStereoPanner) return gain(ctx, 1);
  const p = ctx.createStereoPanner();
  p.pan.value = v;
  return p;
}

function shaper(ctx, amount) {
  const ws = ctx.createWaveShaper();
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  ws.curve = curve;
  return ws;
}

function noiseSrc(ctx, color) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx, color);
  s.loop = true;
  return s;
}

// Kurzer Rauschimpuls
function noiseHit(ctx, dest, t, o) {
  const s = noiseSrc(ctx, o.color || 'white');
  const f = filter(ctx, o.type || 'bandpass', o.freq || 1000, o.Q ?? 1);
  const e = gain(ctx, 0);
  s.connect(f).connect(e).connect(dest);
  const attack = o.attack ?? 0.002;
  const decay = o.decay ?? 0.1;
  e.gain.setValueAtTime(0, t);
  e.gain.linearRampToValueAtTime(o.peak ?? 0.3, t + attack);
  e.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t + attack + decay);
  s.start(t, Math.random() * 3);
  s.stop(t + attack + decay + 0.05);
}

// Einzelner Ton mit optionalem Glissando
function tone(ctx, dest, t, o) {
  const osc = ctx.createOscillator();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, t + (o.glide ?? o.decay ?? 0.1));
  if (o.detune) osc.detune.value = o.detune;
  const e = gain(ctx, 0);
  osc.connect(e).connect(dest);
  const attack = o.attack ?? 0.005;
  const decay = o.decay ?? 0.3;
  e.gain.setValueAtTime(0, t);
  e.gain.linearRampToValueAtTime(o.peak ?? 0.2, t + attack);
  if (o.hold) e.gain.setValueAtTime(o.peak ?? 0.2, t + attack + o.hold);
  e.gain.exponentialRampToValueAtTime(0.0001, t + attack + (o.hold || 0) + decay);
  osc.start(t);
  osc.stop(t + attack + (o.hold || 0) + decay + 0.05);
}

// Metallischer Klang (Schwert, Krug, Kette)
function metal(ctx, dest, t, f, peak = 0.2, decay = 1) {
  const ratios = [1, 2.32, 4.25, 6.63, 9.38];
  const gains = [1, 0.6, 0.4, 0.25, 0.15];
  ratios.forEach((r, i) => {
    tone(ctx, dest, t, { freq: f * r * rand(0.99, 1.01), peak: peak * gains[i], attack: 0.001, decay: decay / (1 + i * 0.4) });
  });
}

function thunder(ctx, dest, wet, t, strength = 1) {
  if (strength > 0.5) {
    noiseHit(ctx, dest, t, { type: 'highpass', freq: 1200, peak: 0.35 * strength, attack: 0.004, decay: 0.35 });
  }
  const s = noiseSrc(ctx, 'brown');
  const f = filter(ctx, 'lowpass', 500, 0.7);
  const e = gain(ctx, 0);
  s.connect(f).connect(e);
  e.connect(dest);
  if (wet) e.connect(wet);
  const len = rand(4, 7);
  f.frequency.setValueAtTime(600 * strength + 150, t);
  f.frequency.exponentialRampToValueAtTime(70, t + len);
  e.gain.setValueAtTime(0, t);
  e.gain.linearRampToValueAtTime(0.9 * strength, t + 0.08);
  for (let k = 0; k < 6; k++) e.gain.setTargetAtTime(rand(0.3, 1) * strength, t + 0.2 + k * rand(0.3, 0.7), 0.15);
  e.gain.setTargetAtTime(0, t + len * 0.6, len * 0.15);
  s.start(t, Math.random() * 3);
  s.stop(t + len + 1);
}

// Formant-Stimme: Grundlage für Wolf, Schrei, Lachen, Kichern …
function voice(ctx, dest, wet, t, o) {
  const dur = o.dur;
  const out = gain(ctx, 1);
  out.connect(dest);
  if (wet && o.wet) {
    const w = gain(ctx, o.wet);
    out.connect(w).connect(wet);
  }
  const osc = ctx.createOscillator();
  osc.type = o.wave || 'sawtooth';
  const f0 = o.f0;
  osc.frequency.setValueAtTime(f0[0][1], t + f0[0][0]);
  for (let i = 1; i < f0.length; i++) {
    const [tt, ff] = f0[i];
    if (f0[i][2] === 'step') osc.frequency.setValueAtTime(ff, t + tt);
    else osc.frequency.linearRampToValueAtTime(ff, t + tt);
  }
  const nodes = [osc];
  if (o.vibrato) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = o.vibrato[0];
    const lg = gain(ctx, o.vibrato[1]);
    lfo.connect(lg).connect(osc.frequency);
    nodes.push(lfo);
  }
  const src = gain(ctx, 1);
  osc.connect(src);
  if (o.noise) {
    const n = noiseSrc(ctx, 'pink');
    const ng = gain(ctx, o.noise * 3);
    n.connect(ng).connect(src);
    nodes.push(n);
  }
  let exc = src;
  if (o.am) {
    const amg = gain(ctx, 1 - o.am[1]);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = o.am[0];
    const d = gain(ctx, o.am[1]);
    lfo.connect(d).connect(amg.gain);
    exc.connect(amg);
    exc = amg;
    nodes.push(lfo);
  }
  if (o.distortion) {
    const ws = shaper(ctx, o.distortion);
    exc.connect(ws);
    exc = ws;
  }
  const env = gain(ctx, 0);
  for (const [fq, q, g] of o.formants) {
    const bp = filter(ctx, 'bandpass', fq, q);
    const fg = gain(ctx, g * Math.sqrt(q) * 1.4);
    exc.connect(bp).connect(fg).connect(env);
  }
  if (o.direct) {
    const lp = filter(ctx, 'lowpass', 1600, 0.7);
    const dg = gain(ctx, o.direct);
    exc.connect(lp).connect(dg).connect(env);
  }
  env.connect(out);
  const peak = o.peak ?? 0.4;
  if (o.env) {
    env.gain.setValueAtTime(0, t);
    for (const [tt, v] of o.env) env.gain.linearRampToValueAtTime(v * peak, t + tt);
  } else {
    const a = o.attack ?? 0.05;
    const r = o.release ?? 0.3;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + a);
    env.gain.setValueAtTime(peak, t + Math.max(a, dur - r));
    env.gain.linearRampToValueAtTime(0, t + dur);
  }
  for (const n of nodes) {
    n.start(t, n.buffer ? Math.random() * 3 : undefined);
    n.stop(t + dur + 0.1);
  }
}

const VOWELS = {
  a: [[800, 5, 1], [1200, 6, 0.6], [2600, 8, 0.25]],
  e: [[400, 5, 1], [2000, 7, 0.6], [2700, 8, 0.3]],
  i: [[300, 5, 0.6], [2300, 8, 1], [3000, 8, 0.5]],
  o: [[450, 5, 1], [800, 6, 0.6], [2600, 8, 0.15]],
  u: [[320, 6, 1], [750, 8, 0.4], [2400, 8, 0.1]],
};

// ---------------------------------------------------------------------------
// Endlos-Generatoren (Musik, Hintergrund, Wetter)
// ---------------------------------------------------------------------------

export class Loop {
  constructor(ctx) {
    this.ctx = ctx;
    this.out = gain(ctx, 1);
    this.wet = gain(ctx, 1);
    this.timers = new Set();
    this.sources = [];
    this.listeners = [];
    this.intensity = 0.5;
    this.stopped = false;
  }
  get now() {
    return this.ctx.currentTime;
  }
  src(node) {
    node.start(0, node.buffer ? Math.random() * 3 : undefined);
    this.sources.push(node);
    return node;
  }
  onIntensity(fn) {
    this.listeners.push(fn);
  }
  setIntensity(v) {
    this.intensity = clamp01(v);
    for (const fn of this.listeners) fn(this.intensity);
  }
  ramp(param, v, time = 0.5) {
    param.setTargetAtTime(v, this.ctx.currentTime, time / 3);
  }
  // fn plant ein Ereignis und gibt die Wartezeit bis zum nächsten in Sekunden zurück
  schedule(fn, firstDelay = 0) {
    const tick = () => {
      if (this.stopped) return;
      const next = fn();
      this.after(next, tick);
    };
    this.after(firstDelay, tick);
  }
  after(seconds, cb) {
    const id = setTimeout(() => {
      this.timers.delete(id);
      if (!this.stopped) cb();
    }, Math.max(0, seconds) * 1000);
    this.timers.add(id);
  }
  stop() {
    this.stopped = true;
    for (const id of this.timers) clearTimeout(id);
    this.timers.clear();
    for (const s of this.sources) {
      try { s.stop(); } catch { /* bereits gestoppt */ }
    }
    this.out.disconnect();
    this.wet.disconnect();
  }
}

function rainGen(L) {
  const { ctx } = L;
  const n = L.src(noiseSrc(ctx, 'pink'));
  const hp = filter(ctx, 'highpass', 300);
  const lp = filter(ctx, 'lowpass', 3000);
  const g = gain(ctx, 0);
  n.connect(hp).connect(lp).connect(g).connect(L.out);
  const n2 = L.src(noiseSrc(ctx, 'white'));
  const bp = filter(ctx, 'bandpass', 6000, 0.5);
  const g2 = gain(ctx, 0);
  n2.connect(bp).connect(g2).connect(L.out);
  L.onIntensity((v) => {
    L.ramp(g.gain, 0.12 + 0.6 * v);
    L.ramp(lp.frequency, 1500 + 6000 * v);
    L.ramp(g2.gain, 0.01 + 0.08 * v);
  });
  L.schedule(() => {
    const t = L.now + 0.02;
    noiseHit(ctx, L.out, t, { freq: rand(1500, 6000), Q: rand(2, 8), peak: rand(0.02, 0.12) * (0.4 + L.intensity), decay: rand(0.01, 0.04) });
    return rand(0.02, 0.25) / (0.3 + L.intensity * 2);
  });
}

function windGen(L, { blizzard = false } = {}) {
  const { ctx } = L;
  const n = L.src(noiseSrc(ctx, 'brown'));
  const bp = filter(ctx, 'bandpass', 500, 0.8);
  const g = gain(ctx, 0);
  n.connect(bp).connect(g).connect(L.out);
  const n2 = L.src(noiseSrc(ctx, 'pink'));
  const bp2 = filter(ctx, 'bandpass', 1200, blizzard ? 6 : 4);
  const g2 = gain(ctx, 0);
  n2.connect(bp2).connect(g2).connect(L.out);
  let hiss;
  if (blizzard) {
    const n3 = L.src(noiseSrc(ctx, 'white'));
    const hp = filter(ctx, 'highpass', 4000);
    hiss = gain(ctx, 0);
    n3.connect(hp).connect(hiss).connect(L.out);
  }
  L.schedule(() => {
    const t = L.now;
    const I = L.intensity;
    const base = blizzard ? 0.35 : 0.15;
    g.gain.setTargetAtTime((base + 0.7 * I) * rand(0.5, 1.2), t, rand(0.5, 1.5));
    bp.frequency.setTargetAtTime(rand(250, 550) + 700 * I * Math.random(), t, 1);
    g2.gain.setTargetAtTime((blizzard ? 0.1 : 0.04) * (0.2 + I) * rand(0, 1.5), t, 1);
    bp2.frequency.setTargetAtTime(rand(700, blizzard ? 2400 : 1600), t, 1.2);
    if (hiss) hiss.gain.setTargetAtTime(0.03 + 0.08 * I * rand(0.5, 1.2), t, 1);
    return rand(1.5, 4);
  });
}

function stormGen(L) {
  rainGen(L);
  windGen(L);
  L.schedule(() => {
    thunder(L.ctx, L.out, L.wet, L.now + 0.05, rand(0.35, 1) * (0.4 + 0.6 * L.intensity));
    return rand(25, 50) / (0.4 + L.intensity * 1.6);
  }, rand(3, 8));
}

function fireGen(L) {
  const { ctx } = L;
  const n = L.src(noiseSrc(ctx, 'brown'));
  const lp = filter(ctx, 'lowpass', 500);
  const g = gain(ctx, 0);
  n.connect(lp).connect(g).connect(L.out);
  const n2 = L.src(noiseSrc(ctx, 'pink'));
  const bp = filter(ctx, 'bandpass', 3000, 0.5);
  const g2 = gain(ctx, 0);
  n2.connect(bp).connect(g2).connect(L.out);
  L.onIntensity((v) => {
    L.ramp(g.gain, 0.12 + 0.3 * v);
    L.ramp(g2.gain, 0.01 + 0.03 * v);
  });
  L.schedule(() => {
    const t = L.now + 0.02;
    const I = L.intensity;
    noiseHit(ctx, L.out, t, { type: 'highpass', freq: rand(1000, 4000), peak: rand(0.05, 0.35) * (0.5 + I), attack: 0.001, decay: rand(0.003, 0.02) });
    if (Math.random() < 0.04) noiseHit(ctx, L.out, t, { type: 'lowpass', freq: 900, peak: 0.4 * (0.5 + I), attack: 0.001, decay: 0.06 });
    return rand(0.01, 0.2) / (0.4 + I * 1.5);
  });
}

function streamGen(L) {
  const { ctx } = L;
  const n = L.src(noiseSrc(ctx, 'white'));
  const bp = filter(ctx, 'bandpass', 1200, 0.8);
  const g = gain(ctx, 0);
  n.connect(bp).connect(g).connect(L.out);
  const n2 = L.src(noiseSrc(ctx, 'pink'));
  const bp2 = filter(ctx, 'bandpass', 600, 3);
  const g2 = gain(ctx, 0.08);
  n2.connect(bp2).connect(g2).connect(L.out);
  L.onIntensity((v) => L.ramp(g.gain, 0.1 + 0.2 * v));
  L.schedule(() => {
    bp2.frequency.setTargetAtTime(rand(300, 1400), L.now, 0.05);
    return 0.12;
  });
  L.schedule(() => {
    const f = rand(400, 1200);
    tone(ctx, L.out, L.now + 0.02, { freq: f, freqEnd: f * rand(1.3, 2), glide: 0.04, peak: 0.06 * (0.5 + L.intensity), attack: 0.005, decay: 0.06 });
    return rand(0.02, 0.15) / (0.5 + L.intensity);
  });
}

function oceanGen(L) {
  const { ctx } = L;
  const n = L.src(noiseSrc(ctx, 'pink'));
  const lp = filter(ctx, 'lowpass', 600);
  const g = gain(ctx, 0.05);
  n.connect(lp).connect(g).connect(L.out);
  const n2 = L.src(noiseSrc(ctx, 'brown'));
  const lp2 = filter(ctx, 'lowpass', 300);
  const g2 = gain(ctx, 0);
  n2.connect(lp2).connect(g2).connect(L.out);
  L.onIntensity((v) => L.ramp(g2.gain, 0.1 + 0.25 * v));
  L.schedule(() => {
    const I = L.intensity;
    const period = rand(6, 11) * (1.2 - I * 0.4);
    const t = L.now;
    g.gain.setTargetAtTime((0.2 + 0.55 * I) * rand(0.7, 1.1), t, period * 0.22);
    g.gain.setTargetAtTime(0.04 + 0.08 * I, t + period * 0.5, period * 0.2);
    lp.frequency.setTargetAtTime(1000 + 2000 * I, t, period * 0.25);
    lp.frequency.setTargetAtTime(500, t + period * 0.5, period * 0.2);
    return period;
  });
}

function caveGen(L) {
  const { ctx } = L;
  const n = L.src(noiseSrc(ctx, 'brown'));
  const lp = filter(ctx, 'lowpass', 150);
  const g = gain(ctx, 0);
  n.connect(lp).connect(g).connect(L.out);
  const n2 = L.src(noiseSrc(ctx, 'pink'));
  const bp = filter(ctx, 'bandpass', 400, 2);
  n2.connect(bp).connect(gain(ctx, 0.02)).connect(L.out);
  const drips = gain(ctx, 0.6);
  drips.connect(L.out);
  drips.connect(gain(ctx, 1.4)).connect(L.wet);
  L.onIntensity((v) => L.ramp(g.gain, 0.1 + 0.15 * v));
  L.schedule(() => {
    const f = rand(900, 2200);
    const p = new PannerLite(ctx, drips, rand(-0.8, 0.8));
    tone(ctx, p.in, L.now + 0.02, { freq: f * 0.6, freqEnd: f, glide: 0.03, peak: rand(0.08, 0.25), attack: 0.002, decay: 0.12 });
    return rand(0.4, 3.5) / (0.4 + L.intensity * 1.2);
  }, 0.5);
}

// Kleiner Helfer: Ereignis mit Stereo-Position
class PannerLite {
  constructor(ctx, dest, pan) {
    this.in = panner(ctx, pan);
    this.in.connect(dest);
    setTimeout(() => this.in.disconnect(), 4000);
  }
}

function dungeonGen(L) {
  const { ctx } = L;
  const lp = filter(ctx, 'lowpass', 220);
  const g = gain(ctx, 0);
  lp.connect(g).connect(L.out);
  for (const [f, type] of [[41.2, 'sine'], [43.6, 'sine'], [82.4, 'triangle']]) {
    const o = L.src(Object.assign(ctx.createOscillator(), { type }));
    o.frequency.value = f;
    o.connect(lp);
  }
  const n = L.src(noiseSrc(ctx, 'brown'));
  n.connect(filter(ctx, 'lowpass', 120)).connect(gain(ctx, 0.25)).connect(lp);
  const ev = gain(ctx, 0.5);
  ev.connect(L.out);
  ev.connect(L.wet);
  L.onIntensity((v) => L.ramp(g.gain, 0.04 + 0.06 * v));
  L.schedule(() => {
    const t = L.now + 0.05;
    const p = new PannerLite(ctx, ev, rand(-0.9, 0.9));
    if (Math.random() < 0.6) {
      // Kettenrasseln
      const n = Math.floor(rand(3, 8));
      for (let k = 0; k < n; k++) metal(ctx, p.in, t + k * rand(0.05, 0.12), rand(1500, 3000), 0.04, 0.25);
    } else {
      noiseHit(ctx, p.in, t, { type: 'lowpass', freq: 300, peak: 0.25, attack: 0.01, decay: 0.6, color: 'brown' });
    }
    return rand(6, 20) / (0.4 + L.intensity * 1.2);
  }, 3);
}

function nightForestGen(L) {
  const { ctx } = L;
  const n = L.src(noiseSrc(ctx, 'brown'));
  n.connect(filter(ctx, 'lowpass', 400)).connect(gain(ctx, 0.08)).connect(L.out);
  const crickets = gain(ctx, 0);
  crickets.connect(L.out);
  for (let c = 0; c < 2; c++) {
    const osc = L.src(Object.assign(ctx.createOscillator(), { type: 'sine' }));
    osc.frequency.value = rand(4200, 5200);
    const am = gain(ctx, 0.5);
    const lfo = L.src(Object.assign(ctx.createOscillator(), { type: 'square' }));
    lfo.frequency.value = rand(25, 40);
    lfo.connect(gain(ctx, 0.5)).connect(am.gain);
    const chirp = gain(ctx, 0);
    const p = panner(ctx, c ? 0.6 : -0.5);
    osc.connect(am).connect(chirp).connect(p).connect(crickets);
    L.schedule(() => {
      const t = L.now + 0.02;
      const reps = Math.floor(rand(2, 4));
      for (let k = 0; k < reps; k++) {
        chirp.gain.setTargetAtTime(1, t + k * 0.13, 0.005);
        chirp.gain.setTargetAtTime(0, t + k * 0.13 + 0.07, 0.01);
      }
      return rand(0.4, 1.3);
    }, rand(0, 1));
  }
  L.onIntensity((v) => L.ramp(crickets.gain, 0.04 + 0.06 * v));
  const owl = gain(ctx, 1);
  owl.connect(L.out);
  owl.connect(L.wet);
  L.schedule(() => {
    const t = L.now + 0.05;
    const p = new PannerLite(ctx, owl, rand(-0.8, 0.8));
    const f = rand(360, 420);
    tone(ctx, p.in, t, { freq: f, freqEnd: f * 0.95, glide: 0.4, peak: 0.12, attack: 0.08, decay: 0.35 });
    tone(ctx, p.in, t + 0.6, { freq: f * 1.02, freqEnd: f * 0.93, glide: 0.8, peak: 0.14, attack: 0.08, hold: 0.25, decay: 0.5 });
    return rand(12, 35) / (0.5 + L.intensity);
  }, rand(4, 10));
}

function dayForestGen(L) {
  const { ctx } = L;
  const n = L.src(noiseSrc(ctx, 'pink'));
  const leavesG = gain(ctx, 0.02);
  n.connect(filter(ctx, 'bandpass', 2500, 0.5)).connect(leavesG).connect(L.out);
  const birds = gain(ctx, 1);
  birds.connect(L.out);
  birds.connect(gain(ctx, 0.3)).connect(L.wet);
  L.schedule(() => {
    leavesG.gain.setTargetAtTime(rand(0.03, 0.08) * (0.5 + L.intensity), L.now, 1);
    return rand(2, 4);
  });
  L.schedule(() => {
    const p = new PannerLite(ctx, birds, rand(-0.9, 0.9));
    const count = Math.floor(rand(2, 7));
    const base = rand(2200, 4500);
    const up = Math.random() < 0.5;
    let t = L.now + 0.02;
    for (let k = 0; k < count; k++) {
      const f = base * rand(0.9, 1.1);
      const f2 = f * rand(1.2, 1.6);
      tone(ctx, p.in, t, { freq: up ? f : f2, freqEnd: up ? f2 : f, glide: 0.06, peak: rand(0.08, 0.2), attack: 0.005, decay: 0.08 });
      t += rand(0.08, 0.16);
    }
    return rand(0.6, 4) / (0.4 + L.intensity * 1.5);
  });
}

function tavernGen(L) {
  const { ctx } = L;
  const crowd = gain(ctx, 0);
  const lp = filter(ctx, 'lowpass', 2500);
  crowd.connect(lp).connect(L.out);
  lp.connect(gain(ctx, 0.3)).connect(L.wet);
  const vowelKeys = Object.keys(VOWELS);
  for (let v = 0; v < 8; v++) {
    const osc = L.src(Object.assign(ctx.createOscillator(), { type: 'sawtooth' }));
    const pitch = rand(95, 230);
    osc.frequency.value = pitch;
    const f1 = filter(ctx, 'bandpass', 600, 5);
    const f2 = filter(ctx, 'bandpass', 1500, 6);
    const vg = gain(ctx, 0);
    const p = panner(ctx, rand(-0.8, 0.8));
    osc.connect(f1).connect(vg);
    osc.connect(f2).connect(vg);
    vg.connect(p).connect(crowd);
    let talking = Math.random() < 0.5;
    let phraseEnd = L.now + rand(0.5, 3);
    L.schedule(() => {
      const t = L.now;
      if (t > phraseEnd) {
        talking = !talking;
        phraseEnd = t + (talking ? rand(1, 4) : rand(0.5, 3) / (0.5 + L.intensity));
      }
      const vow = VOWELS[pick(vowelKeys)];
      f1.frequency.setTargetAtTime(vow[0][0], t, 0.02);
      f2.frequency.setTargetAtTime(vow[1][0], t, 0.02);
      osc.frequency.setTargetAtTime(pitch * rand(0.85, 1.2), t, 0.05);
      vg.gain.setTargetAtTime(talking ? rand(0.2, 1) : 0, t, 0.03);
      return rand(0.08, 0.25);
    }, rand(0, 0.5));
  }
  L.onIntensity((v) => L.ramp(crowd.gain, 0.15 + 0.4 * v));
  L.schedule(() => {
    const p = new PannerLite(ctx, L.out, rand(-0.8, 0.8));
    metal(ctx, p.in, L.now + 0.02, rand(2000, 4000), 0.03, 0.3);
    return rand(1, 6) / (0.5 + L.intensity);
  }, 2);
}

// --- Musik ------------------------------------------------------------------

function creepyGen(L, { box = false } = {}) {
  const { ctx } = L;
  // Bordun
  const droneLp = filter(ctx, 'lowpass', 220, 2);
  const droneG = gain(ctx, box ? 0.05 : 0.12);
  droneLp.connect(droneG);
  droneG.connect(L.out);
  droneG.connect(L.wet);
  for (const f of [55, 55 * 1.007, 82.4 * 0.997]) {
    const o = L.src(Object.assign(ctx.createOscillator(), { type: 'sawtooth' }));
    o.frequency.value = f;
    o.connect(droneLp);
  }
  const lfo = L.src(Object.assign(ctx.createOscillator(), { type: 'sine' }));
  lfo.frequency.value = 0.05;
  lfo.connect(gain(ctx, 90)).connect(droneLp.frequency);

  // Hohe Dissonanz bei hoher Intensität
  const hi = gain(ctx, 0);
  hi.connect(L.wet);
  hi.connect(gain(ctx, 0.3)).connect(L.out);
  for (const m of [81, 82]) {
    const o = L.src(Object.assign(ctx.createOscillator(), { type: 'sine' }));
    o.frequency.value = mtof(m);
    o.connect(hi);
  }
  L.onIntensity((v) => L.ramp(hi.gain, Math.max(0, v - 0.5) * 0.05, 3));

  // Flächen
  const CHORDS = [[0, 3, 6], [0, 1, 7], [0, 3, 8], [0, 6, 11], [-1, 3, 6], [0, 4, 6]];
  const pad = gain(ctx, box ? 0.5 : 1);
  const padLp = filter(ctx, 'lowpass', 1200);
  pad.connect(padLp);
  padLp.connect(L.out);
  padLp.connect(L.wet);
  L.schedule(() => {
    const period = rand(8, 14);
    const t = L.now + 0.05;
    for (const n of pick(CHORDS)) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = mtof(57 + n);
      o.detune.value = rand(-8, 8);
      const e = gain(ctx, 0);
      o.connect(e).connect(pad);
      e.gain.setValueAtTime(0, t);
      e.gain.linearRampToValueAtTime(0.035, t + 3);
      e.gain.setValueAtTime(0.035, t + period - 1);
      e.gain.linearRampToValueAtTime(0, t + period + 3);
      o.start(t);
      o.stop(t + period + 3.1);
    }
    return period;
  });

  // Spieluhr / Glocken mit Echo
  const bells = gain(ctx, 1);
  const delay = ctx.createDelay(2);
  delay.delayTime.value = 0.45;
  const fb = gain(ctx, 0.38);
  bells.connect(L.out);
  bells.connect(gain(ctx, 1.2)).connect(L.wet);
  bells.connect(delay).connect(fb).connect(delay);
  fb.connect(L.wet);
  fb.connect(gain(ctx, 0.4)).connect(L.out);
  const SCALE = [69, 72, 74, 75, 76, 79, 81, 84, 87];
  let melodyIdx = 0;
  const MELODY = [81, 79, 76, 75, 76, 72, 74, 69];
  L.schedule(() => {
    const I = L.intensity;
    const t = L.now + 0.05;
    const count = box ? Math.floor(rand(2, 5)) : (I > 0.6 && Math.random() < 0.4 ? 3 : 1);
    for (let k = 0; k < count; k++) {
      const note = box ? MELODY[melodyIdx++ % MELODY.length] + (Math.random() < 0.15 ? 1 : 0) : pick(SCALE);
      const f = mtof(note);
      const tt = t + k * (box ? 0.45 : rand(0.3, 0.7));
      tone(ctx, bells, tt, { freq: f, peak: 0.06, attack: 0.002, decay: 2.5 });
      tone(ctx, bells, tt, { freq: f * 4.01, peak: 0.012, attack: 0.001, decay: 0.6 });
    }
    return (box ? rand(3, 5) : rand(2.5, 7)) / (0.5 + I);
  }, 2);

  // Anschwellen mit dumpfem Schlag
  L.schedule(() => {
    if (Math.random() < 0.3 + L.intensity * 0.5) {
      const t = L.now + 0.05;
      const n = noiseSrc(ctx, 'pink');
      const bp = filter(ctx, 'bandpass', 200, 4);
      const e = gain(ctx, 0);
      n.connect(bp).connect(e);
      e.connect(L.out);
      e.connect(L.wet);
      bp.frequency.setValueAtTime(200, t);
      bp.frequency.exponentialRampToValueAtTime(2000, t + 5);
      e.gain.setValueAtTime(0, t);
      e.gain.linearRampToValueAtTime(0.12 * (0.5 + L.intensity), t + 5);
      e.gain.linearRampToValueAtTime(0, t + 5.08);
      n.start(t, Math.random() * 3);
      n.stop(t + 5.2);
      tone(ctx, L.out, t + 5, { freq: 70, freqEnd: 32, glide: 0.8, peak: 0.45, attack: 0.005, decay: 1.6 });
    }
    return rand(15, 35);
  }, rand(8, 15));
}

function actionGen(L, { chase = false } = {}) {
  const { ctx } = L;
  const bus = gain(ctx, 1);
  bus.connect(L.out);
  const wetSend = gain(ctx, 0.25);
  bus.connect(wetSend).connect(L.wet);

  const PROG = chase
    ? [[40, [64, 67, 71]], [36, [60, 64, 67]], [38, [62, 66, 69]], [35, [59, 63, 66]]] // Em C D B
    : [[38, [62, 65, 69]], [34, [58, 62, 65]], [36, [60, 64, 67]], [33, [61, 64, 69]]]; // Dm Bb C A
  const KICK = [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0];
  let step = 0;
  let next = ctx.currentTime + 0.1;

  const kick = (t, p = 0.7) => {
    tone(ctx, bus, t, { freq: 150, freqEnd: 42, glide: 0.12, peak: p, attack: 0.002, decay: 0.45 });
    noiseHit(ctx, bus, t, { type: 'lowpass', freq: 800, peak: 0.12, decay: 0.05, color: 'brown' });
  };
  const snare = (t, p = 0.25) => {
    noiseHit(ctx, bus, t, { type: 'highpass', freq: 1200, peak: p, decay: 0.16 });
    tone(ctx, bus, t, { type: 'triangle', freq: 190, freqEnd: 150, peak: p * 0.6, decay: 0.08 });
  };
  const hat = (t, p = 0.05) => noiseHit(ctx, bus, t, { type: 'highpass', freq: 7000, peak: p, decay: 0.035 });

  const synthNote = (t, midi, dur, peak, cutoff, type = 'sawtooth') => {
    const lp = filter(ctx, 'lowpass', cutoff, 2);
    const e = gain(ctx, 0);
    lp.connect(e).connect(bus);
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = mtof(midi);
      o.detune.value = det;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(peak, t + 0.006);
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return lp;
  };

  const playStep = (t, s, I, stepDur) => {
    const bar = Math.floor(s / 16);
    const i = s % 16;
    const [root, chord] = PROG[bar % PROG.length];
    if (KICK[i] || (I > 0.75 && (i === 14 || i === 15)) || (chase && i === 10)) kick(t, 0.5 + 0.3 * I);
    if (I > 0.35 && (i === 4 || i === 12)) snare(t, 0.15 + 0.15 * I);
    if (I > 0.7 && bar % 4 === 3 && i >= 12) snare(t, 0.08 + 0.04 * (i - 12));
    if (I > 0.2 && (I > 0.75 || i % 2 === 0)) hat(t, i % 4 === 2 ? 0.06 : 0.03);
    if (i % 4 !== 1) synthNote(t, root + (i % 8 === 6 ? 12 : 0), stepDur * 0.9, 0.11, 500 + 500 * I);
    if (I > 0.3) synthNote(t, chord[i % 3] + (i % 6 < 3 ? 0 : 12), stepDur * 0.8, 0.028, 2600);
    if (I > 0.6 && i === 0) {
      for (const m of [root + 12, ...chord]) {
        const lp = synthNote(t, m, stepDur * 10, 0.045, 400);
        lp.frequency.setValueAtTime(400, t);
        lp.frequency.linearRampToValueAtTime(2500, t + 0.08);
        lp.frequency.exponentialRampToValueAtTime(700, t + stepDur * 8);
      }
    }
  };

  L.schedule(() => {
    const I = L.intensity;
    const bpm = (chase ? 150 : 124) + 30 * I;
    const stepDur = 60 / bpm / 4;
    if (next < ctx.currentTime) next = ctx.currentTime + 0.05;
    while (next < ctx.currentTime + 0.15) {
      playStep(next, step, I, stepDur);
      next += stepDur;
      step++;
    }
    return 0.025;
  });
}

// --- Registry -----------------------------------------------------------------

export const LOOP_GENERATORS = {
  rain: rainGen,
  wind: (L) => windGen(L),
  storm: stormGen,
  blizzard: (L) => windGen(L, { blizzard: true }),
  fire: fireGen,
  stream: streamGen,
  ocean: oceanGen,
  cave: caveGen,
  dungeon: dungeonGen,
  nightforest: nightForestGen,
  dayforest: dayForestGen,
  tavern: tavernGen,
  creepy: (L) => creepyGen(L),
  creepybox: (L) => creepyGen(L, { box: true }),
  action: (L) => actionGen(L),
  chase: (L) => actionGen(L, { chase: true }),
};

// ---------------------------------------------------------------------------
// Einzelgeräusche – (ctx, dest, wet, t) => Dauer in Sekunden
// ---------------------------------------------------------------------------

export const ONESHOT_GENERATORS = {
  wolf(ctx, dest, wet, t) {
    const base = rand(380, 460);
    const dur = rand(2.8, 3.8);
    voice(ctx, dest, wet, t, {
      dur, wave: 'triangle', peak: 0.55, attack: 0.4, release: 0.8, wet: 0.8, noise: 0.03, direct: 0.5,
      f0: [[0, base * 0.75], [0.5, base * 1.25], [dur * 0.7, base * 1.2], [dur, base * 0.85]],
      vibrato: [5.5, 6], formants: VOWELS.u,
    });
    return dur + 1.5;
  },
  scream(ctx, dest, wet, t) {
    const base = rand(800, 1100);
    const dur = rand(1.3, 1.8);
    voice(ctx, dest, wet, t, {
      dur, peak: 0.35, attack: 0.05, release: 0.4, wet: 0.4, noise: 0.25, distortion: 2,
      f0: [[0, base * 0.8], [0.15, base * 1.1], [dur * 0.8, base * 1.05], [dur, base * 0.7]],
      vibrato: [9, 25], formants: VOWELS.a,
    });
    return dur + 1;
  },
  laugh(ctx, dest, wet, t) {
    const base = rand(120, 160);
    const n = 7;
    const f0 = [];
    const env = [];
    let tt = 0;
    for (let k = 0; k < n; k++) {
      const f = base * (1.3 - k * 0.05);
      const len = k === n - 1 ? 0.5 : 0.14;
      f0.push([tt, f, 'step'], [tt + len, f * 0.9]);
      env.push([tt, 0], [tt + 0.02, 1], [tt + len - 0.03, 0.6], [tt + len, 0]);
      tt += len + 0.07;
    }
    voice(ctx, dest, wet, t, { dur: tt, peak: 0.6, wet: 0.6, noise: 0.35, f0, env, formants: VOWELS.a, distortion: 1.5 });
    return tt + 1.5;
  },
  giggle(ctx, dest, wet, t) {
    const base = rand(450, 600);
    const n = Math.floor(rand(8, 12));
    const f0 = [];
    const env = [];
    let tt = 0;
    for (let k = 0; k < n; k++) {
      const f = base * rand(0.9, 1.25);
      f0.push([tt, f, 'step'], [tt + 0.08, f * 0.92]);
      env.push([tt, 0], [tt + 0.015, 1], [tt + 0.06, 0.5], [tt + 0.08, 0]);
      tt += 0.08 + rand(0.04, 0.07);
    }
    voice(ctx, dest, wet, t, { dur: tt, peak: 0.45, wet: 0.8, noise: 0.4, f0, env, formants: VOWELS.i });
    return tt + 2;
  },
  raven(ctx, dest, wet, t) {
    let tt = 0;
    for (let k = 0; k < 3; k++) {
      const f = rand(500, 600);
      voice(ctx, dest, wet, t + tt, {
        dur: 0.28, peak: 0.4, attack: 0.02, release: 0.1, wet: 0.4, noise: 0.3, distortion: 5,
        f0: [[0, f], [0.28, f * 0.82]], formants: [[1000, 3, 1], [1800, 4, 0.6]],
      });
      tt += 0.28 + rand(0.15, 0.3);
    }
    return tt + 1;
  },
  ghost(ctx, dest, wet, t) {
    const dur = 3.5;
    voice(ctx, dest, wet, t, {
      dur, wave: 'triangle', peak: 0.15, attack: 0.8, release: 1.2, wet: 1, noise: 0.15, direct: 0.4,
      f0: [[0, 200], [1.2, 320], [2.2, 260], [dur, 180]], vibrato: [4, 8], formants: VOWELS.u,
    });
    return dur + 2;
  },
  growl(ctx, dest, wet, t) {
    const dur = 2;
    voice(ctx, dest, wet, t, {
      dur, peak: 0.4, attack: 0.15, release: 0.4, wet: 0.3, noise: 0.4, distortion: 4,
      f0: [[0, 60], [0.5, 85], [dur, 55]], am: [28, 0.6], formants: [[300, 2, 1], [700, 3, 0.6]],
    });
    return dur + 1;
  },
  creak(ctx, dest, wet, t) {
    const dur = rand(1.5, 2.5);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(30, t);
    for (let tt = 0; tt < dur; tt += 0.03) osc.frequency.setValueAtTime(rand(15, 25) + 40 * Math.sin((tt / dur) * Math.PI), t + tt);
    const env = gain(ctx, 0);
    env.connect(dest);
    env.connect(gain(ctx, 0.3)).connect(wet);
    for (const [f, g] of [[620, 1], [1150, 0.7], [1850, 0.4]]) {
      osc.connect(filter(ctx, 'bandpass', f * rand(0.95, 1.05), 15)).connect(gain(ctx, g * 3)).connect(env);
    }
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.5, t + 0.2);
    env.gain.setValueAtTime(0.5, t + dur - 0.3);
    env.gain.linearRampToValueAtTime(0, t + dur);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    return dur + 0.5;
  },
  knock(ctx, dest, wet, t) {
    const w = gain(ctx, 0.3);
    w.connect(wet);
    for (let k = 0; k < 3; k++) {
      const tt = t + k * 0.24;
      for (const d of [dest, w]) {
        noiseHit(ctx, d, tt, { type: 'lowpass', freq: 700, peak: 0.6, decay: 0.07, color: 'brown' });
        tone(ctx, d, tt, { freq: 150, freqEnd: 90, glide: 0.1, peak: 0.5, attack: 0.002, decay: 0.12 });
      }
    }
    return 1.5;
  },
  sword(ctx, dest, wet, t) {
    const w = gain(ctx, 0.4);
    w.connect(wet);
    for (const d of [dest, w]) {
      metal(ctx, d, t, rand(1800, 2600), 0.3, 1.2);
      noiseHit(ctx, d, t, { type: 'highpass', freq: 3000, peak: 0.4, decay: 0.05 });
    }
    return 1.5;
  },
  explosion(ctx, dest, wet, t) {
    const n = noiseSrc(ctx, 'brown');
    const lp = filter(ctx, 'lowpass', 4000);
    const e = gain(ctx, 0);
    const ws = shaper(ctx, 2);
    n.connect(lp).connect(ws).connect(e);
    e.connect(dest);
    e.connect(gain(ctx, 0.4)).connect(wet);
    lp.frequency.setValueAtTime(4000, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + 2.5);
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(0.9, t + 0.01);
    e.gain.exponentialRampToValueAtTime(0.0001, t + 3);
    n.start(t, Math.random() * 3);
    n.stop(t + 3.1);
    tone(ctx, dest, t, { freq: 70, freqEnd: 30, glide: 0.6, peak: 0.8, attack: 0.003, decay: 0.8 });
    return 3.5;
  },
  thunder(ctx, dest, wet, t) {
    thunder(ctx, dest, wet, t, 1);
    return 7.5;
  },
  magic(ctx, dest, wet, t) {
    const notes = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96, 98];
    const w = gain(ctx, 1);
    w.connect(wet);
    notes.forEach((m, k) => {
      for (const d of [dest, w]) tone(ctx, d, t + k * 0.05, { freq: mtof(m), peak: 0.07, attack: 0.01, decay: 1.5 });
    });
    const n = noiseSrc(ctx, 'white');
    const bp = filter(ctx, 'bandpass', 2000, 3);
    const e = gain(ctx, 0);
    n.connect(bp).connect(e);
    e.connect(dest);
    e.connect(w);
    bp.frequency.setValueAtTime(2000, t);
    bp.frequency.exponentialRampToValueAtTime(9000, t + 1.2);
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(0.15, t + 0.8);
    e.gain.linearRampToValueAtTime(0, t + 1.4);
    n.start(t, Math.random() * 3);
    n.stop(t + 1.5);
    return 3.5;
  },
  heartbeat(ctx, dest, wet, t) {
    const lp = filter(ctx, 'lowpass', 160);
    lp.connect(dest);
    for (let k = 0; k < 4; k++) {
      const tt = t + k * 0.8;
      tone(ctx, lp, tt, { freq: 60, freqEnd: 35, glide: 0.15, peak: 0.9, attack: 0.005, decay: 0.15 });
      tone(ctx, lp, tt + 0.25, { freq: 55, freqEnd: 35, glide: 0.12, peak: 0.65, attack: 0.005, decay: 0.12 });
    }
    return 3.4;
  },
  bell(ctx, dest, wet, t) {
    const f0 = rand(180, 240);
    const w = gain(ctx, 0.6);
    w.connect(wet);
    const partials = [[0.5, 0.5, 6], [1, 0.4, 5], [1.19, 0.3, 4], [1.5, 0.2, 3.5], [2, 0.25, 3], [2.5, 0.12, 2.5], [2.66, 0.1, 2], [3, 0.08, 1.5]];
    for (const [r, g, d] of partials) {
      for (const dst of [dest, w]) tone(ctx, dst, t, { freq: f0 * r, peak: g * 0.35, attack: 0.002, decay: d });
    }
    return 6;
  },
};
