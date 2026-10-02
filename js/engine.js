// Audio-Engine: Mischpult, Kanäle, Ebenen mit Überblendung, Einzelgeräusche.
import { Loop, LOOP_GENERATORS, ONESHOT_GENERATORS, impulseResponse, rand } from './synth.js';
import { db } from './db.js';

const BUSES = ['music', 'ambience', 'weather', 'sfx'];
const MAX_CACHE_SAMPLES = 50_000_000; // ≈ 200 MB dekodiertes Audio

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.buses = {};
    this.cache = new Map(); // soundId -> AudioBuffer (LRU)
    this.pending = new Map();
    this.volumes = { master: 0.9, music: 0.8, ambience: 0.8, weather: 0.8, sfx: 1 };
    this.activeOneShots = new Set();
  }

  // Muss aus einer Nutzeraktion heraus aufgerufen werden (iOS).
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = (this.ctx = new AC({ latencyHint: 'playback' }));
      this.master = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 10;
      comp.ratio.value = 4;
      comp.attack.value = 0.01;
      comp.release.value = 0.25;
      this.master.connect(comp).connect(ctx.destination);
      for (const b of BUSES) {
        this.buses[b] = ctx.createGain();
        this.buses[b].connect(this.master);
      }
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = impulseResponse(ctx);
      const rg = ctx.createGain();
      rg.gain.value = 0.55;
      this.reverb.connect(rg).connect(this.master);
      this.applyVolumes();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.resume();
      });
    }
    this.resume();
    return this.ctx;
  }

  resume() {
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  }

  get running() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  setVolumes(v) {
    Object.assign(this.volumes, v);
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.05);
    for (const b of BUSES) this.buses[b].gain.setTargetAtTime(this.volumes[b], t, 0.05);
  }

  // Erlaubt Mischen mit anderen Apps (z. B. Spotify) – Safari ab iOS 17.
  setMixWithOthers(mix) {
    try {
      if (navigator.audioSession) navigator.audioSession.type = mix ? 'ambient' : 'playback';
    } catch { /* nicht unterstützt */ }
  }

  async buffer(sound) {
    const key = sound.id;
    if (this.cache.has(key)) {
      const b = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, b);
      return b;
    }
    if (this.pending.has(key)) return this.pending.get(key);
    const p = (async () => {
      const rec = await db.get('files', sound.fileId);
      if (!rec) throw new Error(`Audiodatei für „${sound.name}“ fehlt.`);
      const data = rec.data.slice(0);
      const buf = await this.ctx.decodeAudioData(data);
      this.cache.set(key, buf);
      this.trimCache();
      return buf;
    })();
    this.pending.set(key, p);
    try {
      return await p;
    } finally {
      this.pending.delete(key);
    }
  }

  trimCache() {
    let total = 0;
    for (const b of this.cache.values()) total += b.length * b.numberOfChannels;
    for (const [k, b] of this.cache) {
      if (total <= MAX_CACHE_SAMPLES) break;
      this.cache.delete(k);
      total -= b.length * b.numberOfChannels;
    }
  }

  forget(soundId) {
    this.cache.delete(soundId);
  }

  // Startet einen Endlos-Sound und blendet ihn ein.
  startLoop(sound, bus, { level = 0.5, volume = 1, fade = 2 } = {}) {
    this.ensure();
    return new LayerHandle(this, sound, this.buses[bus], { level, volume, fade });
  }

  async playOneShot(sound, { volume = 1, pan = 0, distance = 0, bus = 'sfx' } = {}) {
    const ctx = this.ensure();
    const out = ctx.createGain();
    out.gain.value = volume;
    let node = out;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      node.connect(p);
      node = p;
    }
    if (distance > 0) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 6000 - 5000 * distance;
      node.connect(lp);
      node = lp;
    }
    node.connect(this.buses[bus]);
    const wet = ctx.createGain();
    wet.gain.value = 1 + distance;
    out.connect(wet).connect(this.reverb);

    let duration;
    let src = null;
    const t = ctx.currentTime + 0.02;
    if (sound.synth) {
      duration = ONESHOT_GENERATORS[sound.synth](ctx, out, wet, t);
    } else {
      const buf = await this.buffer(sound);
      src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(out);
      src.start();
      duration = buf.duration;
    }
    const handle = {
      sound,
      ended: false,
      stop: () => {
        if (handle.ended) return;
        out.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        setTimeout(finish, 300);
      },
    };
    const finish = () => {
      if (handle.ended) return;
      handle.ended = true;
      try { src?.stop(); } catch { /* schon beendet */ }
      out.disconnect();
      wet.disconnect();
      this.activeOneShots.delete(handle);
      handle.onended?.();
    };
    setTimeout(finish, (duration + 0.3) * 1000);
    this.activeOneShots.add(handle);
    return handle;
  }

  stopOneShots() {
    for (const h of [...this.activeOneShots]) h.stop();
  }
}

class LayerHandle {
  constructor(engine, sound, bus, { level, volume, fade }) {
    const ctx = (this.ctx = engine.ctx);
    this.engine = engine;
    this.sound = sound;
    this.stopped = false;
    this.level = level;
    this.fadeNode = ctx.createGain();
    this.fadeNode.gain.value = 0;
    this.volNode = ctx.createGain();
    this.volNode.gain.value = volume;
    this.volNode.connect(this.fadeNode).connect(bus);
    this.wetFade = ctx.createGain();
    this.wetFade.gain.value = 0;
    this.wetFade.connect(engine.reverb);
    this.fadeTo(1, fade);
    this.ready = this.init().catch((err) => {
      this.error = err;
      this.stop(0);
      throw err;
    });
  }

  async init() {
    const { ctx, sound } = this;
    if (sound.synth) {
      const gen = LOOP_GENERATORS[sound.synth];
      if (!gen) throw new Error(`Unbekannter Klang: ${sound.synth}`);
      this.loop = new Loop(ctx);
      this.loop.out.connect(this.volNode);
      this.loop.wet.connect(this.wetFade);
      gen(this.loop);
      this.loop.setIntensity(this.level);
    } else {
      const buf = await this.engine.buffer(sound);
      if (this.stopped) return;
      this.levelNode = ctx.createGain();
      this.levelNode.gain.value = fileGain(this.level);
      this.src = ctx.createBufferSource();
      this.src.buffer = buf;
      this.src.loop = true;
      this.src.connect(this.levelNode).connect(this.volNode);
      this.src.start(0, buf.duration > 20 ? rand(0, buf.duration * 0.5) : 0);
    }
  }

  fadeTo(v, seconds) {
    const t = this.ctx.currentTime;
    for (const g of [this.fadeNode.gain, this.wetFade.gain]) {
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(v, t + Math.max(0.05, seconds));
    }
  }

  setLevel(v) {
    this.level = v;
    if (this.loop) this.loop.setIntensity(v);
    if (this.levelNode) this.levelNode.gain.setTargetAtTime(fileGain(v), this.ctx.currentTime, 0.1);
  }

  setVolume(v) {
    this.volNode.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }

  stop(fade = 2) {
    if (this.stopped) return;
    this.stopped = true;
    this.fadeTo(0, fade);
    setTimeout(() => {
      this.loop?.stop();
      try { this.src?.stop(); } catch { /* schon beendet */ }
      this.fadeNode.disconnect();
      this.wetFade.disconnect();
    }, Math.max(0.05, fade) * 1000 + 100);
  }
}

// Bei Audiodateien wirkt die Intensität als Lautstärke (leicht logarithmisch).
const fileGain = (v) => Math.pow(Math.max(0, Math.min(1, v)), 1.5) * 1.2;
