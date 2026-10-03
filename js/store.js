// Datenmodell: Klangbibliothek, Szenen, Einstellungen – dauerhaft in IndexedDB.
import { db } from './db.js';
import { prepareImport } from './decode.js';

export const CATEGORIES = {
  creepy: { label: 'Unheimliche Musik', short: 'Unheimlich', icon: '🕯️', loop: true },
  action: { label: 'Action-Musik', short: 'Action', icon: '⚔️', loop: true },
  ambience: { label: 'Hintergrund', short: 'Hintergrund', icon: '🌲', loop: true },
  weather: { label: 'Wetter', short: 'Wetter', icon: '🌧️', loop: true },
  oneshot: { label: 'Einzelgeräusche', short: 'Einzel', icon: '💥', loop: false },
};

const b = (synth, category, name, icon) => ({ id: `syn:${synth}`, synth, category, name, icon, builtin: true });

export const BUILTIN_SOUNDS = [
  b('creepy', 'creepy', 'Düstere Klänge', '🕯️'),
  b('creepybox', 'creepy', 'Verfluchte Spieluhr', '🎐'),
  b('action', 'action', 'Schlachtgetümmel', '⚔️'),
  b('chase', 'action', 'Verfolgungsjagd', '🏇'),
  b('tavern', 'ambience', 'Taverne', '🍺'),
  b('fire', 'ambience', 'Lagerfeuer', '🔥'),
  b('stream', 'ambience', 'Bach', '🏞️'),
  b('ocean', 'ambience', 'Meeresrauschen', '🌊'),
  b('cave', 'ambience', 'Höhle & Tropfen', '🦇'),
  b('dungeon', 'ambience', 'Verlies', '⛓️'),
  b('nightforest', 'ambience', 'Nachtwald', '🌙'),
  b('dayforest', 'ambience', 'Wald am Tag', '🐦'),
  b('rain', 'weather', 'Regen', '🌧️'),
  b('wind', 'weather', 'Wind', '💨'),
  b('storm', 'weather', 'Gewitter', '⛈️'),
  b('blizzard', 'weather', 'Schneesturm', '❄️'),
  b('wolf', 'oneshot', 'Wolfsgeheul', '🐺'),
  b('scream', 'oneshot', 'Schrei', '😱'),
  b('laugh', 'oneshot', 'Böses Lachen', '😈'),
  b('giggle', 'oneshot', 'Kichern', '🤭'),
  b('raven', 'oneshot', 'Rabe', '🪶'),
  b('ghost', 'oneshot', 'Geisterstöhnen', '👻'),
  b('growl', 'oneshot', 'Knurren', '👹'),
  b('creak', 'oneshot', 'Knarrende Tür', '🚪'),
  b('knock', 'oneshot', 'Klopfen', '✊'),
  b('sword', 'oneshot', 'Schwertklirren', '🗡️'),
  b('explosion', 'oneshot', 'Explosion', '💥'),
  b('thunder', 'oneshot', 'Donner', '⚡'),
  b('magic', 'oneshot', 'Zauber', '✨'),
  b('heartbeat', 'oneshot', 'Herzschlag', '💓'),
  b('bell', 'oneshot', 'Glockenschlag', '🔔'),
];

// Farben früherer Versionen auf die gedeckte Logtown-Palette abbilden
const OLD_COLORS = { '#7c5cff': '#8a6a9e', '#d08a3c': '#d39445', '#2f8f6a': '#3f6b52', '#c84444': '#a33a34', '#3c7fd0': '#4f7a8a', '#8fbf3c': '#7f9a5a', '#e0662c': '#b5652c', '#b0479b': '#8a6a9e', '#6b7280': '#5d636c', '#c9a227': '#c9b48a' };

export const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

export const INTENSITY_LEVELS = [
  { id: 'calm', label: 'Ruhig', factor: 0.6, music: 0.3 },
  { id: 'normal', label: 'Normal', factor: 1, music: 0.6 },
  { id: 'intense', label: 'Intensiv', factor: 1.4, music: 0.95 },
];

const lib = (soundId) => ({ kind: 'lib', soundId });
const layer = (soundId, level) => ({ id: uid(), soundId, level });

// Frühere Versionen kannten nur ein Wetter pro Szene: { soundId, level }
export function normalizeScene(sc) {
  if (!Array.isArray(sc.weather)) {
    const w = sc.weather || {};
    sc.weather = w.soundId ? [{ id: uid(), soundId: w.soundId, level: w.level ?? 0.5 }] : [];
    return true;
  }
  return false;
}

export function newScene(name = 'Neue Szene') {
  return {
    id: uid(),
    name,
    icon: '🎭',
    color: '#8a6a9e',
    intensity: 'normal',
    music: { mode: 'none', volume: 0.8, creepy: lib('syn:creepy'), action: lib('syn:action') },
    layers: [],
    weather: [],
    random: { soundIds: [], frequency: 0.3 },
    favorites: [],
  };
}

function scene(name, icon, color, patch) {
  const s = newScene(name);
  Object.assign(s, { icon, color }, patch);
  s.music = { ...newScene().music, ...(patch.music || {}) };
  return s;
}

export function defaultScenes() {
  return [
    scene('Taverne', '🍺', '#d39445', {
      layers: [layer('syn:tavern', 0.6), layer('syn:fire', 0.3)],
      weather: [layer('syn:rain', 0.25)],
      favorites: ['syn:laugh', 'syn:giggle', 'syn:sword', 'syn:knock', 'syn:creak'],
    }),
    scene('Nächtlicher Wald', '🌲', '#3f6b52', {
      music: { mode: 'creepy' },
      layers: [layer('syn:nightforest', 0.6)],
      weather: [layer('syn:wind', 0.3)],
      random: { soundIds: ['syn:wolf', 'syn:raven'], frequency: 0.25 },
      favorites: ['syn:wolf', 'syn:raven', 'syn:scream', 'syn:growl', 'syn:giggle'],
    }),
    scene('Verfluchte Krypta', '💀', '#8a6a9e', {
      music: { mode: 'creepy', creepy: lib('syn:creepybox') },
      layers: [layer('syn:cave', 0.6), layer('syn:dungeon', 0.4)],
      random: { soundIds: ['syn:ghost', 'syn:creak', 'syn:knock'], frequency: 0.3 },
      favorites: ['syn:scream', 'syn:giggle', 'syn:ghost', 'syn:laugh', 'syn:heartbeat', 'syn:bell'],
    }),
    scene('Kampf', '⚔️', '#a33a34', {
      intensity: 'intense',
      music: { mode: 'action' },
      layers: [layer('syn:fire', 0.2)],
      weather: [layer('syn:wind', 0.3)],
      favorites: ['syn:sword', 'syn:explosion', 'syn:growl', 'syn:scream', 'syn:magic', 'syn:thunder'],
    }),
    scene('Sturm auf See', '🌊', '#4f7a8a', {
      layers: [layer('syn:ocean', 0.8)],
      weather: [layer('syn:storm', 0.7)],
      favorites: ['syn:thunder', 'syn:scream', 'syn:bell'],
    }),
    scene('Friedliche Reise', '🌄', '#7f9a5a', {
      intensity: 'calm',
      layers: [layer('syn:dayforest', 0.6), layer('syn:stream', 0.4)],
      weather: [layer('syn:wind', 0.15)],
      favorites: ['syn:raven', 'syn:wolf', 'syn:magic'],
    }),
    scene('Lagerfeuer bei Nacht', '🔥', '#b5652c', {
      layers: [layer('syn:fire', 0.7), layer('syn:nightforest', 0.4)],
      random: { soundIds: ['syn:wolf'], frequency: 0.15 },
      favorites: ['syn:wolf', 'syn:growl', 'syn:raven', 'syn:laugh'],
    }),
  ];
}

export const DEFAULT_SETTINGS = {
  volumes: { master: 0.9, music: 0.8, ambience: 0.8, weather: 0.8, sfx: 1 },
  crossfade: 3,
  mixWithOthers: true,
  keepAwake: true,
  spotifyClientId: '',
};

export class Store {
  constructor() {
    this.scenes = [];
    this.userSounds = [];
    // Änderungen an Grundsounds: ausgeblendete IDs und Überschreibungen (Name, Symbol, eigene Audiodatei)
    this.builtins = { hidden: [], overrides: {} };
    this.settings = structuredClone(DEFAULT_SETTINGS);
    this.timers = {};
  }

  async load() {
    const [scenes, sounds, settings, builtins] = await Promise.all([
      db.get('meta', 'scenes'),
      db.get('meta', 'sounds'),
      db.get('meta', 'settings'),
      db.get('meta', 'builtins'),
    ]);
    this.builtins = { hidden: [], overrides: {}, ...(builtins || {}) };
    this.scenes = scenes || defaultScenes();
    let migrated = false;
    for (const sc of this.scenes) {
      if (normalizeScene(sc)) migrated = true;
      if (OLD_COLORS[sc.color]) {
        sc.color = OLD_COLORS[sc.color];
        migrated = true;
      }
    }
    if (migrated) this.persist('scenes');
    this.userSounds = sounds || [];
    this.settings = { ...structuredClone(DEFAULT_SETTINGS), ...(settings || {}) };
    this.settings.volumes = { ...DEFAULT_SETTINGS.volumes, ...this.settings.volumes };
    if (!scenes) await this.persist('scenes');
    navigator.storage?.persist?.().catch(() => {});
  }

  persist(key) {
    const value = { scenes: this.scenes, sounds: this.userSounds, settings: this.settings, builtins: this.builtins }[key];
    return db.put('meta', key, structuredClone(value));
  }

  // Verzögertes Speichern, z. B. während ein Schieberegler bewegt wird
  save(key, delay = 400) {
    clearTimeout(this.timers[key]);
    this.timers[key] = setTimeout(() => this.persist(key), delay);
  }

  get sounds() {
    const { hidden, overrides } = this.builtins;
    const builtins = BUILTIN_SOUNDS.filter((b) => !hidden.includes(b.id)).map((b) => {
      const o = overrides[b.id];
      if (!o) return b;
      const merged = { ...b, ...o, modified: true };
      if (o.fileId) delete merged.synth;
      return merged;
    });
    return [...builtins, ...this.userSounds];
  }

  get hiddenBuiltins() {
    return BUILTIN_SOUNDS.filter((b) => this.builtins.hidden.includes(b.id));
  }

  sound(id) {
    return this.sounds.find((s) => s.id === id);
  }

  // Bibliothek eines Sounds: Szenen-ID oder null (= Mutterbibliothek, für alle Szenen).
  // Sounds einer gelöschten Szene gelten als Mutterbibliothek.
  libraryOf(sound) {
    return sound.sceneId && this.scene(sound.sceneId) ? sound.sceneId : null;
  }

  // Sounds einer Kategorie. Mit sceneId: Mutterbibliothek + Bibliothek dieser Szene.
  soundsIn(category, sceneId) {
    return sortByName(this.sounds.filter((s) => s.category === category
      && (sceneId === undefined || [null, sceneId].includes(this.libraryOf(s)))));
  }

  // Nur die Sounds genau einer Bibliothek (null = Mutterbibliothek)
  librarySounds(category, libId) {
    return sortByName(this.sounds.filter((s) => s.category === category && this.libraryOf(s) === libId));
  }

  // Szenen, die einen Sound verwenden
  usage(id) {
    return this.scenes.filter((sc) => sc.layers.some((l) => l.soundId === id)
      || sc.weather.some((l) => l.soundId === id)
      || sc.random.soundIds.includes(id)
      || sc.favorites.includes(id)
      || ['creepy', 'action'].some((m) => sc.music[m]?.soundId === id));
  }

  // Sounds der Mutterbibliothek, die nur eine einzige Szene nutzt
  autoAssignCandidates() {
    return this.sounds
      .filter((s) => this.libraryOf(s) === null && !s.builtin)
      .map((s) => ({ sound: s, scenes: this.usage(s.id) }))
      .filter((x) => x.scenes.length === 1);
  }

  async autoAssign() {
    const list = this.autoAssignCandidates();
    for (const { sound, scenes } of list) await this.updateSound(sound.id, { sceneId: scenes[0].id });
    return list.length;
  }

  scene(id) {
    return this.scenes.find((s) => s.id === id);
  }

  async importFile(file, category, sceneId = null) {
    const fileId = uid();
    const { data, type, name } = await prepareImport(file);
    await db.put('files', fileId, { name, type, data });
    const sound = {
      id: `usr:${fileId}`,
      fileId,
      category,
      name: file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Eigener Sound',
      icon: CATEGORIES[category].icon,
      builtin: false,
      sceneId,
    };
    this.userSounds.push(sound);
    await this.persist('sounds');
    return sound;
  }

  isBuiltin(id) {
    return BUILTIN_SOUNDS.some((b) => b.id === id);
  }

  async updateSound(id, patch) {
    if (this.isBuiltin(id)) {
      this.builtins.overrides[id] = { ...this.builtins.overrides[id], ...patch };
      return this.persist('builtins');
    }
    const s = this.userSounds.find((x) => x.id === id);
    if (!s) return;
    Object.assign(s, patch);
    await this.persist('sounds');
  }

  // Audio eines Sounds durch eine Datei ersetzen – Szenen behalten ihre Verweise
  async replaceAudio(id, file) {
    const { data, type, name } = await prepareImport(file);
    const fileId = uid();
    await db.put('files', fileId, { name, type, data });
    const old = this.isBuiltin(id) ? this.builtins.overrides[id]?.fileId : this.userSounds.find((x) => x.id === id)?.fileId;
    if (old) await db.del('files', old);
    await this.updateSound(id, { fileId });
  }

  // Grundsound auf den Auslieferungszustand zurücksetzen
  async restoreBuiltin(id) {
    const o = this.builtins.overrides[id];
    if (o?.fileId) await db.del('files', o.fileId);
    delete this.builtins.overrides[id];
    await this.persist('builtins');
  }

  async unhideBuiltins(ids) {
    this.builtins.hidden = this.builtins.hidden.filter((x) => !ids.includes(x));
    await this.persist('builtins');
  }

  async deleteSound(id) {
    if (this.isBuiltin(id)) {
      await this.restoreBuiltin(id);
      this.builtins.hidden.push(id);
      await this.persist('builtins');
    } else {
      const s = this.userSounds.find((x) => x.id === id);
      if (!s) return;
      this.userSounds = this.userSounds.filter((x) => x.id !== id);
      await db.del('files', s.fileId);
      await this.persist('sounds');
    }
    for (const sc of this.scenes) {
      sc.layers = sc.layers.filter((l) => l.soundId !== id);
      sc.weather = sc.weather.filter((l) => l.soundId !== id);
      sc.random.soundIds = sc.random.soundIds.filter((x) => x !== id);
      sc.favorites = sc.favorites.filter((x) => x !== id);
      for (const slot of ['creepy', 'action']) {
        if (sc.music[slot]?.soundId === id) {
          const alt = this.soundsIn(slot)[0];
          sc.music[slot] = lib(alt ? alt.id : `syn:${slot}`);
          if (!alt && sc.music.mode === slot) sc.music.mode = 'none';
        }
      }
    }
    await this.persist('scenes');
  }

  async addScene(sc) {
    this.scenes.push(sc);
    await this.persist('scenes');
    return sc;
  }

  // Sounds aus der Bibliothek der Szene wandern in die Mutterbibliothek – es geht nichts verloren
  async deleteScene(id) {
    const owned = this.sounds.filter((s) => s.sceneId === id);
    for (const s of owned) await this.updateSound(s.id, { sceneId: null });
    this.scenes = this.scenes.filter((s) => s.id !== id);
    await this.persist('scenes');
    return owned.length;
  }

  async resetScenes() {
    this.scenes = defaultScenes();
    await this.persist('scenes');
  }

  async exportBackup() {
    const files = {};
    const fileIds = [...this.userSounds, ...Object.values(this.builtins.overrides)].map((x) => x.fileId).filter(Boolean);
    for (const fileId of fileIds) {
      const rec = await db.get('files', fileId);
      if (rec) files[fileId] = { name: rec.name, type: rec.type, data: bufToBase64(rec.data) };
    }
    const settings = { ...this.settings };
    // Kennung „klangkulisse“ bleibt, damit ältere Sicherungen weiter lesbar sind
    return JSON.stringify({ app: 'klangkulisse', version: 2, scenes: this.scenes, sounds: this.userSounds, builtins: this.builtins, settings, files });
  }

  async importBackup(text) {
    const data = JSON.parse(text);
    if (data.app !== 'klangkulisse') throw new Error('Das ist keine Sicherung des Cerebros Soundboards.');
    await db.clear('files');
    for (const [id, f] of Object.entries(data.files || {})) {
      await db.put('files', id, { name: f.name, type: f.type, data: base64ToBuf(f.data) });
    }
    this.scenes = data.scenes || defaultScenes();
    this.scenes.forEach(normalizeScene);
    this.userSounds = data.sounds || [];
    this.builtins = { hidden: [], overrides: {}, ...(data.builtins || {}) };
    this.settings = { ...structuredClone(DEFAULT_SETTINGS), ...(data.settings || {}) };
    await Promise.all([this.persist('scenes'), this.persist('sounds'), this.persist('builtins'), this.persist('settings')]);
  }
}

function sortByName(list) {
  return list.sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base', numeric: true }));
}

function bufToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function base64ToBuf(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes.buffer;
}
