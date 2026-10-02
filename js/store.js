// Datenmodell: Klangbibliothek, Szenen, Einstellungen – dauerhaft in IndexedDB.
import { db } from './db.js';

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

export const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

export const INTENSITY_LEVELS = [
  { id: 'calm', label: 'Ruhig', factor: 0.6, music: 0.3 },
  { id: 'normal', label: 'Normal', factor: 1, music: 0.6 },
  { id: 'intense', label: 'Intensiv', factor: 1.4, music: 0.95 },
];

const lib = (soundId) => ({ kind: 'lib', soundId });
const layer = (soundId, level) => ({ id: uid(), soundId, level });

export function newScene(name = 'Neue Szene') {
  return {
    id: uid(),
    name,
    icon: '🎭',
    color: '#7c5cff',
    intensity: 'normal',
    music: { mode: 'none', volume: 0.8, creepy: lib('syn:creepy'), action: lib('syn:action') },
    layers: [],
    weather: { soundId: null, level: 0.5 },
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
    scene('Taverne', '🍺', '#d08a3c', {
      layers: [layer('syn:tavern', 0.6), layer('syn:fire', 0.3)],
      weather: { soundId: 'syn:rain', level: 0.25 },
      favorites: ['syn:laugh', 'syn:giggle', 'syn:sword', 'syn:knock', 'syn:creak'],
    }),
    scene('Nächtlicher Wald', '🌲', '#2f8f6a', {
      music: { mode: 'creepy' },
      layers: [layer('syn:nightforest', 0.6)],
      weather: { soundId: 'syn:wind', level: 0.3 },
      random: { soundIds: ['syn:wolf', 'syn:raven'], frequency: 0.25 },
      favorites: ['syn:wolf', 'syn:raven', 'syn:scream', 'syn:growl', 'syn:giggle'],
    }),
    scene('Verfluchte Krypta', '💀', '#7c5cff', {
      music: { mode: 'creepy', creepy: lib('syn:creepybox') },
      layers: [layer('syn:cave', 0.6), layer('syn:dungeon', 0.4)],
      random: { soundIds: ['syn:ghost', 'syn:creak', 'syn:knock'], frequency: 0.3 },
      favorites: ['syn:scream', 'syn:giggle', 'syn:ghost', 'syn:laugh', 'syn:heartbeat', 'syn:bell'],
    }),
    scene('Kampf', '⚔️', '#c84444', {
      intensity: 'intense',
      music: { mode: 'action' },
      layers: [layer('syn:fire', 0.2)],
      weather: { soundId: 'syn:wind', level: 0.3 },
      favorites: ['syn:sword', 'syn:explosion', 'syn:growl', 'syn:scream', 'syn:magic', 'syn:thunder'],
    }),
    scene('Sturm auf See', '🌊', '#3c7fd0', {
      layers: [layer('syn:ocean', 0.8)],
      weather: { soundId: 'syn:storm', level: 0.7 },
      favorites: ['syn:thunder', 'syn:scream', 'syn:bell'],
    }),
    scene('Friedliche Reise', '🌄', '#8fbf3c', {
      intensity: 'calm',
      layers: [layer('syn:dayforest', 0.6), layer('syn:stream', 0.4)],
      weather: { soundId: 'syn:wind', level: 0.15 },
      favorites: ['syn:raven', 'syn:wolf', 'syn:magic'],
    }),
    scene('Lagerfeuer bei Nacht', '🔥', '#e0662c', {
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
    this.settings = structuredClone(DEFAULT_SETTINGS);
    this.timers = {};
  }

  async load() {
    const [scenes, sounds, settings] = await Promise.all([
      db.get('meta', 'scenes'),
      db.get('meta', 'sounds'),
      db.get('meta', 'settings'),
    ]);
    this.scenes = scenes || defaultScenes();
    this.userSounds = sounds || [];
    this.settings = { ...structuredClone(DEFAULT_SETTINGS), ...(settings || {}) };
    this.settings.volumes = { ...DEFAULT_SETTINGS.volumes, ...this.settings.volumes };
    if (!scenes) await this.persist('scenes');
    navigator.storage?.persist?.().catch(() => {});
  }

  persist(key) {
    const value = { scenes: this.scenes, sounds: this.userSounds, settings: this.settings }[key];
    return db.put('meta', key, structuredClone(value));
  }

  // Verzögertes Speichern, z. B. während ein Schieberegler bewegt wird
  save(key, delay = 400) {
    clearTimeout(this.timers[key]);
    this.timers[key] = setTimeout(() => this.persist(key), delay);
  }

  get sounds() {
    return [...BUILTIN_SOUNDS, ...this.userSounds];
  }

  sound(id) {
    return this.sounds.find((s) => s.id === id);
  }

  soundsIn(category) {
    return this.sounds.filter((s) => s.category === category);
  }

  scene(id) {
    return this.scenes.find((s) => s.id === id);
  }

  async importFile(file, category) {
    const fileId = uid();
    const data = await file.arrayBuffer();
    await db.put('files', fileId, { name: file.name, type: file.type, data });
    const sound = {
      id: `usr:${fileId}`,
      fileId,
      category,
      name: file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Eigener Sound',
      icon: CATEGORIES[category].icon,
      builtin: false,
    };
    this.userSounds.push(sound);
    await this.persist('sounds');
    return sound;
  }

  async updateSound(id, patch) {
    const s = this.userSounds.find((x) => x.id === id);
    if (!s) return;
    Object.assign(s, patch);
    await this.persist('sounds');
  }

  async deleteSound(id) {
    const s = this.userSounds.find((x) => x.id === id);
    if (!s) return;
    this.userSounds = this.userSounds.filter((x) => x.id !== id);
    await db.del('files', s.fileId);
    for (const sc of this.scenes) {
      sc.layers = sc.layers.filter((l) => l.soundId !== id);
      if (sc.weather.soundId === id) sc.weather.soundId = null;
      sc.random.soundIds = sc.random.soundIds.filter((x) => x !== id);
      sc.favorites = sc.favorites.filter((x) => x !== id);
      for (const slot of ['creepy', 'action']) {
        if (sc.music[slot]?.soundId === id) sc.music[slot] = lib(`syn:${slot}`);
      }
    }
    await Promise.all([this.persist('sounds'), this.persist('scenes')]);
  }

  async addScene(sc) {
    this.scenes.push(sc);
    await this.persist('scenes');
    return sc;
  }

  async deleteScene(id) {
    this.scenes = this.scenes.filter((s) => s.id !== id);
    await this.persist('scenes');
  }

  async resetScenes() {
    this.scenes = defaultScenes();
    await this.persist('scenes');
  }

  async exportBackup() {
    const files = {};
    for (const s of this.userSounds) {
      const rec = await db.get('files', s.fileId);
      if (rec) files[s.fileId] = { name: rec.name, type: rec.type, data: bufToBase64(rec.data) };
    }
    const settings = { ...this.settings };
    return JSON.stringify({ app: 'klangkulisse', version: 1, scenes: this.scenes, sounds: this.userSounds, settings, files });
  }

  async importBackup(text) {
    const data = JSON.parse(text);
    if (data.app !== 'klangkulisse') throw new Error('Das ist keine Klangkulisse-Sicherung.');
    await db.clear('files');
    for (const [id, f] of Object.entries(data.files || {})) {
      await db.put('files', id, { name: f.name, type: f.type, data: base64ToBuf(f.data) });
    }
    this.scenes = data.scenes || defaultScenes();
    this.userSounds = data.sounds || [];
    this.settings = { ...structuredClone(DEFAULT_SETTINGS), ...(data.settings || {}) };
    await Promise.all([this.persist('scenes'), this.persist('sounds'), this.persist('settings')]);
  }
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
