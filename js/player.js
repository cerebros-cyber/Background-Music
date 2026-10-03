// Szenen-Player: gleicht laufende Klänge mit dem Zustand der aktiven Szene ab.
import { INTENSITY_LEVELS } from './store.js';
import { rand, pick } from './synth.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

export class ScenePlayer extends EventTarget {
  constructor(engine, store, spotify) {
    super();
    this.engine = engine;
    this.store = store;
    this.spotify = spotify;
    this.sceneId = null;
    this.music = null; // { key, handle?, spotify? }
    this.layers = new Map(); // layerId -> { soundId, handle }
    this.weather = null; // { soundId, handle }
    this.randomTimer = null;
    this.wakeLock = null;
  }

  get playing() {
    return !!this.sceneId;
  }

  get fade() {
    return this.store.settings.crossfade;
  }

  intensityOf(scene) {
    return INTENSITY_LEVELS.find((l) => l.id === scene.intensity) || INTENSITY_LEVELS[1];
  }

  async start(scene) {
    this.engine.ensure();
    if (this.sceneId !== scene.id) {
      // Überblenden: alles Alte ausblenden, Neues einblenden
      this.stopLayers(this.fade);
      this.sceneId = scene.id;
    }
    this.sync(scene);
    this.keepAwake();
    this.emit();
  }

  stop() {
    this.stopLayers(Math.min(1.5, this.fade));
    this.stopMusic(Math.min(1.5, this.fade));
    this.sceneId = null;
    this.releaseWake();
    this.emit();
  }

  // Alle Ebenen der laufenden Szene neu starten (z. B. nachdem ein Sound ersetzt wurde)
  refresh() {
    const scene = this.store.scene(this.sceneId);
    if (!scene) return;
    this.stopLayers(0.4);
    if (!this.music?.spotify) this.stopMusic(0.4);
    this.sync(scene);
  }

  stopLayers(fade) {
    for (const l of this.layers.values()) l.handle.stop(fade);
    this.layers.clear();
    this.weather?.handle.stop(fade);
    this.weather = null;
    clearTimeout(this.randomTimer);
    this.randomTimer = null;
  }

  // Wird nach jeder Änderung an der aktiven Szene aufgerufen
  sync(scene) {
    if (scene.id !== this.sceneId) return;
    const lvl = this.intensityOf(scene);
    const fade = this.fade;

    // Hintergrund-Ebenen
    const wanted = new Map(scene.layers.map((l) => [l.id, l]));
    for (const [id, cur] of this.layers) {
      const w = wanted.get(id);
      if (!w || w.soundId !== cur.soundId) {
        cur.handle.stop(fade);
        this.layers.delete(id);
      }
    }
    for (const l of scene.layers) {
      const level = clamp01(l.level * lvl.factor);
      const cur = this.layers.get(l.id);
      if (cur) {
        cur.handle.setLevel(level);
        continue;
      }
      const sound = this.store.sound(l.soundId);
      if (!sound) continue;
      const handle = this.engine.startLoop(sound, 'ambience', { level, fade });
      handle.ready.catch((e) => this.error(e));
      this.layers.set(l.id, { soundId: l.soundId, handle });
    }

    // Wetter
    const wid = scene.weather.soundId;
    const wLevel = clamp01(scene.weather.level * lvl.factor);
    if (this.weather && this.weather.soundId !== wid) {
      this.weather.handle.stop(fade);
      this.weather = null;
    }
    if (wid && !this.weather) {
      const sound = this.store.sound(wid);
      if (sound) {
        const handle = this.engine.startLoop(sound, 'weather', { level: wLevel, fade });
        handle.ready.catch((e) => this.error(e));
        this.weather = { soundId: wid, handle };
      }
    } else if (this.weather) {
      this.weather.handle.setLevel(wLevel);
    }

    this.syncMusic(scene, lvl);

    if (!this.randomTimer) this.scheduleRandom(true);
  }

  syncMusic(scene, lvl) {
    const m = scene.music;
    const slot = m.mode === 'none' ? null : m[m.mode];
    const key = slot ? `${m.mode}|${slot.kind}|${slot.soundId || slot.uri}` : 'none';
    if (this.music?.key !== key) {
      this.stopMusic(this.fade, slot?.kind === 'spotify');
      if (slot?.kind === 'lib') {
        const sound = this.store.sound(slot.soundId);
        if (sound) {
          const handle = this.engine.startLoop(sound, 'music', { level: lvl.music, volume: m.volume, fade: this.fade });
          handle.ready.catch((e) => this.error(e));
          this.music = { key, handle };
        } else {
          this.music = { key };
        }
      } else if (slot?.kind === 'spotify') {
        this.music = { key, spotify: true };
        this.spotify.play(slot.uri).catch((e) => this.error(e));
      } else {
        this.music = { key };
      }
    } else if (this.music?.handle) {
      this.music.handle.setLevel(lvl.music);
      this.music.handle.setVolume(m.volume);
    }
  }

  stopMusic(fade, keepSpotify = false) {
    if (!this.music) return;
    this.music.handle?.stop(fade);
    if (this.music.spotify && !keepSpotify) this.spotify.pause().catch(() => {});
    this.music = null;
  }

  // Nebengeräusche in zufälligen Abständen
  scheduleRandom(first = false) {
    clearTimeout(this.randomTimer);
    const scene = this.store.scene(this.sceneId);
    if (!scene) return;
    const freq = clamp01(scene.random.frequency * this.intensityOf(scene).factor);
    const base = 90 - 80 * freq; // 90 s (selten) … 10 s (häufig)
    const delay = (first ? rand(0.2, 0.6) : rand(0.6, 1.4)) * base;
    this.randomTimer = setTimeout(() => {
      const sc = this.store.scene(this.sceneId);
      const ids = sc?.random.soundIds.filter((id) => this.store.sound(id)) || [];
      if (ids.length && this.engine.running) {
        this.engine
          .playOneShot(this.store.sound(pick(ids)), {
            bus: 'ambience',
            volume: rand(0.35, 0.75),
            pan: rand(-0.85, 0.85),
            distance: rand(0.2, 0.8),
          })
          .catch((e) => this.error(e));
      }
      this.scheduleRandom();
    }, delay * 1000);
  }

  // Nach Änderung der Häufigkeit neu planen
  rescheduleRandom() {
    if (this.playing) this.scheduleRandom(true);
  }

  async keepAwake() {
    if (!this.store.settings.keepAwake || this.wakeLock || !navigator.wakeLock) return;
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLock.addEventListener('release', () => (this.wakeLock = null));
    } catch { /* nicht erlaubt */ }
  }

  releaseWake() {
    this.wakeLock?.release().catch(() => {});
    this.wakeLock = null;
  }

  error(e) {
    this.dispatchEvent(new CustomEvent('error', { detail: e }));
  }

  emit() {
    this.dispatchEvent(new Event('change'));
  }
}
