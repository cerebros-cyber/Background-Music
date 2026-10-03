// Oberfläche des Cerebros Soundboards
import { AudioEngine } from './engine.js';
import { Store, CATEGORIES, INTENSITY_LEVELS, newScene, uid } from './store.js';
import { Spotify, parseSpotifyLink, isSpotifyOwnedPlaylist } from './spotify.js';
import { ScenePlayer } from './player.js';

const store = new Store();
const engine = new AudioEngine();
const spotify = new Spotify(() => store.settings.spotifyClientId);
const player = new ScenePlayer(engine, store, spotify);

const state = {
  view: 'play',
  sceneId: null,
  libCat: 'oneshot',
  boardFilter: 'scene',
  previews: new Map(),
  playlists: null,
  devices: null,
};

const ICONS = ['🎭', '🍺', '🌲', '💀', '⚔️', '🌊', '🔥', '🏰', '🌙', '🕸️', '🐉', '⛪', '🏚️', '🗻', '🏜️', '❄️', '🌋', '🧙', '👑', '⚓', '🕯️', '🩸', '🌌', '🐺'];
const COLORS = ['#d39445', '#a33a34', '#7f9a5a', '#4f7a8a', '#6f8496', '#8a6a9e', '#b5652c', '#c9b48a', '#5d636c', '#3f6b52'];

const SPEAKER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9.5a3.5 3.5 0 0 1 0 5M18.5 7a7 7 0 0 1 0 10"/></svg>';

function svg(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup;
  return t.content.firstChild;
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

const PROPS = new Set(['value', 'checked', 'selected', 'disabled', 'multiple', 'min', 'max', 'step', 'type', 'accept', 'title']);

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (PROPS.has(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

function slider({ value, min = 0, max = 1, step = 0.01, oninput, label }) {
  return h('input', {
    type: 'range', class: 'slider', min, max, step, value, 'aria-label': label,
    onInput: (e) => oninput(parseFloat(e.target.value)),
  });
}

function seg(options, current, onpick, cls = '') {
  return h('div', { class: `seg ${cls}`, role: 'group' },
    options.map((o) => h('button', {
      class: o.id === current ? 'on' : '', 'aria-pressed': o.id === current ? 'true' : 'false',
      onClick: () => onpick(o.id),
    }, o.icon ? h('span', { class: 'ico' }, o.icon) : null, o.label)));
}

let toastTimer;
function toast(msg, kind = 'info', action = null) {
  const el = document.getElementById('toast');
  el.replaceChildren(...[h('span', {}, msg),
    action ? h('a', { class: 'btn small toast-action', href: action.href, target: '_blank', rel: 'noopener' }, action.label) : null,
    h('button', { class: 'toast-close', 'aria-label': 'Schließen', onClick: () => (el.className = 'toast') }, '✕')].filter(Boolean));
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), kind === 'error' ? (action ? 15000 : 8000) : 3000);
}

function showError(e) {
  console.error(e);
  toast(e?.message || String(e), 'error', e?.openUri ? { label: '🟢 In Spotify öffnen', href: e.openUri } : null);
}

const currentScene = () => store.scene(state.sceneId) || store.scenes[0] || null;

function changed(scene, { rerender = true } = {}) {
  store.save('scenes');
  if (player.sceneId === scene.id) player.sync(scene);
  if (rerender) render();
}

const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;

// ---------------------------------------------------------------------------
// Grundgerüst
// ---------------------------------------------------------------------------

function render() {
  const app = document.getElementById('app');
  const scrollers = [...app.querySelectorAll('[data-scroll]')].map((el) => [el.dataset.scroll, el.scrollTop]);
  app.replaceChildren(renderTopbar(), h('main', { class: `view view-${state.view}` },
    state.view === 'play' ? renderPlay() : state.view === 'library' ? renderLibrary() : renderSettings()));
  for (const [key, top] of scrollers) {
    const el = app.querySelector(`[data-scroll="${key}"]`);
    if (el) el.scrollTop = top;
  }
}

function renderTopbar() {
  const nav = [
    { id: 'play', label: 'Spielen' },
    { id: 'library', label: 'Bibliothek' },
    { id: 'settings', label: 'Einstellungen' },
  ];
  return h('header', { class: 'topbar' },
    h('div', { class: 'brand' }, h('img', { class: 'logo', src: 'img/cerebros-logo-96.png', alt: 'Cerebros' }),
      h('span', { class: 'brand-name' }, 'Cerebros', h('small', {}, 'Soundboard'))),
    seg(nav, state.view, (id) => {
      stopPreviews();
      state.view = id;
      render();
    }, 'nav'),
    h('div', { class: 'master' },
      svg(SPEAKER),
      slider({
        value: store.settings.volumes.master, label: 'Gesamtlautstärke',
        oninput: (v) => {
          store.settings.volumes.master = v;
          engine.setVolumes({ master: v });
          store.save('settings');
        },
      })),
    h('button', {
      class: 'btn danger stop-all', title: 'Alles stoppen',
      onClick: () => {
        player.stop();
        engine.stopOneShots();
        stopPreviews();
        render();
      },
    }, '■', h('span', { class: 'hide-sm' }, ' Alles stoppen')));
}

// ---------------------------------------------------------------------------
// Spielen
// ---------------------------------------------------------------------------

function renderPlay() {
  const scene = currentScene();
  return [
    h('aside', { class: 'scenes', 'data-scroll': 'scenes' },
      h('div', { class: 'section-title' }, 'Szenen'),
      store.scenes.map((s) => h('button', {
        class: `scene-card ${s.id === scene?.id ? 'selected' : ''} ${player.sceneId === s.id ? 'playing' : ''}`,
        style: `--c:${s.color}`,
        onClick: () => {
          // Nur auswählen; eine andere laufende Szene wird gestoppt, gestartet wird per „Starten“
          state.sceneId = s.id;
          if (player.playing && player.sceneId !== s.id) player.stop();
          render();
        },
      }, h('span', { class: 'scene-icon' }, s.icon), h('span', { class: 'scene-name' }, s.name),
      player.sceneId === s.id ? h('span', { class: 'eq', 'aria-label': 'läuft' }, h('i'), h('i'), h('i')) : null)),
      h('button', {
        class: 'scene-card add',
        onClick: async () => {
          const s = await store.addScene(newScene());
          state.sceneId = s.id;
          render();
          openSceneEditor(s);
        },
      }, h('span', { class: 'scene-icon' }, '＋'), h('span', { class: 'scene-name' }, 'Neue Szene'))),
    h('section', { class: 'panel', 'data-scroll': 'panel' }, scene ? renderScenePanel(scene) : h('p', { class: 'empty' }, 'Lege eine Szene an, um loszulegen.')),
    renderBoard(scene),
  ];
}

function renderScenePanel(scene) {
  const playing = player.sceneId === scene.id;
  return [
    h('div', { class: 'scene-head', style: `--c:${scene.color}` },
      h('span', { class: 'scene-head-icon' }, scene.icon),
      h('h1', {}, scene.name),
      h('div', { class: 'grow' }),
      h('button', { class: 'btn ghost', onClick: () => openSceneEditor(scene) }, '✎ Bearbeiten'),
      h('button', {
        class: `btn ${playing ? 'danger' : 'primary'} big`,
        onClick: () => {
          if (playing) player.stop();
          else player.start(scene).catch(showError);
          render();
        },
      }, playing ? '■ Stoppen' : '▶ Starten')),
    h('div', { class: 'card intensity' },
      h('h2', {}, 'Intensität'),
      seg(INTENSITY_LEVELS, scene.intensity, (id) => {
        scene.intensity = id;
        changed(scene);
      }, 'wide')),
    renderMusicCard(scene),
    renderLayersCard(scene),
    renderWeatherCard(scene),
    renderRandomCard(scene),
  ];
}

function renderMusicCard(scene) {
  const m = scene.music;
  const modes = [
    { id: 'none', label: 'Keine', icon: '🔇' },
    { id: 'creepy', label: 'Unheimlich', icon: '🕯️' },
    { id: 'action', label: 'Action', icon: '⚔️' },
  ];
  const slot = m.mode === 'none' ? null : m[m.mode];
  return h('div', { class: 'card' },
    h('h2', {}, 'Musik'),
    seg(modes, m.mode, (id) => {
      m.mode = id;
      changed(scene);
    }, 'wide'),
    slot ? h('div', { class: 'row' },
      h('label', { class: 'lbl' }, 'Quelle'),
      renderSourceSelect(scene, m.mode)) : null,
    slot?.kind === 'lib' ? h('div', { class: 'row' },
      h('label', { class: 'lbl' }, 'Lautstärke'),
      slider({
        value: m.volume, label: 'Musiklautstärke',
        oninput: (v) => {
          m.volume = v;
          changed(scene, { rerender: false });
        },
      })) : null,
    slot?.kind === 'spotify' ? renderSpotifyControls(slot) : null);
}

function renderSourceSelect(scene, mode) {
  const slot = scene.music[mode];
  const value = slot.kind === 'lib' ? `lib:${slot.soundId}` : `sp:${slot.uri}`;
  const spotifyOpts = [];
  if (slot.kind === 'spotify' && !state.playlists?.some((p) => p.uri === slot.uri)) {
    spotifyOpts.push(h('option', { value: `sp:${slot.uri}` }, `🟢 ${slot.name || slot.uri}`));
  }
  for (const p of state.playlists || []) {
    const blocked = isSpotifyOwnedPlaylist(p.uri);
    spotifyOpts.push(h('option', { value: `sp:${p.uri}` }, `${blocked ? '⚠️' : '🟢'} ${p.name}${blocked ? ' (von Spotify – nicht abspielbar)' : ''}`));
  }
  if (spotify.connected && !state.playlists) spotifyOpts.push(h('option', { value: 'act:load' }, 'Meine Playlists laden …'));
  spotifyOpts.push(h('option', { value: 'act:link' }, 'Spotify-Link einfügen …'));

  const sel = h('select', {
    class: 'select',
    onChange: async (e) => {
      const v = e.target.value;
      try {
        if (v === 'act:load') {
          await loadPlaylists();
        } else if (v === 'act:link') {
          const text = prompt('Spotify-Link zu Playlist, Album oder Titel einfügen\n(in Spotify: Teilen → Link kopieren)');
          const link = parseSpotifyLink(text);
          if (text && !link) toast('Das sieht nicht wie ein Spotify-Link aus.', 'error');
          if (link) {
            const name = spotify.connected ? await spotify.name(link.uri) : 'Spotify';
            scene.music[mode] = { kind: 'spotify', uri: link.uri, name };
            changed(scene);
            return;
          }
        } else if (v.startsWith('lib:')) {
          scene.music[mode] = { kind: 'lib', soundId: v.slice(4) };
          changed(scene);
          return;
        } else if (v.startsWith('sp:')) {
          const uri = v.slice(3);
          const name = state.playlists?.find((p) => p.uri === uri)?.name || slot.name;
          scene.music[mode] = { kind: 'spotify', uri, name };
          changed(scene);
          return;
        }
      } catch (err) {
        showError(err);
      }
      render();
    },
  },
  h('optgroup', { label: 'Bibliothek' }, store.soundsIn(mode).map((s) => h('option', { value: `lib:${s.id}` }, `${s.icon} ${s.name}`))),
  h('optgroup', { label: 'Spotify' }, spotifyOpts));
  sel.value = value;
  return sel;
}

async function loadPlaylists() {
  state.playlists = await spotify.playlists(true);
  toast(`${state.playlists.length} Playlists geladen`);
}

function renderSpotifyControls(slot) {
  if (!spotify.connected) {
    return h('p', { class: 'hint' }, 'Spotify ist nicht verbunden. ',
      h('a', { href: '#', onClick: (e) => { e.preventDefault(); state.view = 'settings'; render(); } }, 'Jetzt in den Einstellungen verbinden.'));
  }
  const now = h('div', { class: 'sp-now', id: 'sp-now' }, '…');
  const act = (fn) => async () => {
    try {
      await fn();
      setTimeout(refreshNowPlaying, 600);
    } catch (e) {
      showError(e);
    }
  };
  setTimeout(refreshNowPlaying, 0);
  return h('div', { class: 'spotify-ctl' },
    h('span', { class: 'sp-logo' }, '🟢'),
    now,
    h('div', { class: 'grow' }),
    h('button', { class: 'btn icon', title: 'Zurück', onClick: act(() => spotify.previous()) }, '⏮'),
    h('button', { class: 'btn icon', title: 'Pause', onClick: act(() => spotify.pause()) }, '⏸'),
    h('button', { class: 'btn icon', title: 'Playlist abspielen', onClick: act(() => spotify.play(slot.uri)) }, '▶'),
    h('button', { class: 'btn icon', title: 'Nächster Titel', onClick: act(() => spotify.next()) }, '⏭'));
}

async function refreshNowPlaying() {
  const el = document.getElementById('sp-now');
  if (!el || !spotify.connected) return;
  try {
    const np = await spotify.nowPlaying();
    el.textContent = np?.title ? `${np.playing ? '' : '⏸ '}${np.title} – ${np.artist}${np.device ? ` · ${np.device}` : ''}` : 'Gerade läuft nichts';
  } catch {
    el.textContent = 'Status nicht verfügbar';
  }
}

function soundLabel(s) {
  return [h('span', { class: 'ico' }, s.icon), h('span', { class: 'name' }, s.name)];
}

function renderLayersCard(scene) {
  const used = new Set(scene.layers.map((l) => l.soundId));
  const opts = (cat) => store.soundsIn(cat).filter((s) => !used.has(s.id)).map((s) => h('option', { value: s.id }, `${s.icon} ${s.name}`));
  return h('div', { class: 'card' },
    h('h2', {}, 'Hintergrundgeräusche'),
    scene.layers.length ? null : h('p', { class: 'hint' }, 'Noch keine Hintergrundgeräusche – füge unten welche hinzu.'),
    scene.layers.map((l) => {
      const s = store.sound(l.soundId);
      if (!s) return null;
      return h('div', { class: 'layer' },
        h('div', { class: 'layer-name' }, soundLabel(s)),
        slider({
          value: l.level, label: `Intensität ${s.name}`,
          oninput: (v) => {
            l.level = v;
            changed(scene, { rerender: false });
          },
        }),
        h('button', {
          class: 'btn icon ghost', title: 'Entfernen',
          onClick: () => {
            scene.layers = scene.layers.filter((x) => x !== l);
            changed(scene);
          },
        }, '✕'));
    }),
    h('select', {
      class: 'select add',
      onChange: (e) => {
        if (!e.target.value) return;
        scene.layers.push({ id: uid(), soundId: e.target.value, level: 0.5 });
        changed(scene);
      },
    },
    h('option', { value: '' }, '＋ Geräusch hinzufügen …'),
    h('optgroup', { label: 'Hintergrund' }, opts('ambience')),
    h('optgroup', { label: 'Wetter' }, opts('weather'))));
}

function renderWeatherCard(scene) {
  const active = new Map(scene.weather.map((w) => [w.soundId, w]));
  return h('div', { class: 'card' },
    h('h2', {}, 'Wetter ', h('small', {}, 'mehrere gleichzeitig möglich')),
    h('div', { class: 'chips' },
      h('button', {
        class: `chip ${scene.weather.length ? '' : 'on'}`,
        onClick: () => {
          scene.weather = [];
          changed(scene);
        },
      }, h('span', { class: 'ico' }, '☀️'), 'Kein'),
      store.soundsIn('weather').map((s) => h('button', {
        class: `chip ${active.has(s.id) ? 'on' : ''}`, 'aria-pressed': active.has(s.id) ? 'true' : 'false',
        onClick: () => {
          scene.weather = active.has(s.id)
            ? scene.weather.filter((w) => w.soundId !== s.id)
            : [...scene.weather, { id: uid(), soundId: s.id, level: 0.5 }];
          changed(scene);
        },
      }, h('span', { class: 'ico' }, s.icon), s.name))),
    scene.weather.map((w) => {
      const s = store.sound(w.soundId);
      if (!s) return null;
      return h('div', { class: 'layer' },
        h('div', { class: 'layer-name' }, soundLabel(s)),
        slider({
          value: w.level, label: `Stärke ${s.name}`,
          oninput: (v) => {
            w.level = v;
            changed(scene, { rerender: false });
          },
        }));
    }));
}

function renderRandomCard(scene) {
  const r = scene.random;
  return h('div', { class: 'card' },
    h('h2', {}, 'Nebengeräusche ', h('small', {}, 'erklingen zufällig aus der Ferne')),
    h('div', { class: 'chips small' }, store.soundsIn('oneshot').map((s) => h('button', {
      class: `chip ${r.soundIds.includes(s.id) ? 'on' : ''}`,
      onClick: () => {
        r.soundIds = r.soundIds.includes(s.id) ? r.soundIds.filter((x) => x !== s.id) : [...r.soundIds, s.id];
        changed(scene);
      },
    }, h('span', { class: 'ico' }, s.icon), s.name))),
    r.soundIds.length ? h('div', { class: 'row' },
      h('label', { class: 'lbl' }, 'Häufigkeit'),
      h('span', { class: 'tiny' }, 'selten'),
      slider({
        value: r.frequency, label: 'Häufigkeit',
        oninput: (v) => {
          r.frequency = v;
          store.save('scenes');
          clearTimeout(renderRandomCard.t);
          renderRandomCard.t = setTimeout(() => player.rescheduleRandom(), 500);
        },
      }),
      h('span', { class: 'tiny' }, 'häufig')) : null);
}

function renderBoard(scene) {
  const all = store.soundsIn('oneshot');
  const favs = scene ? scene.favorites.map((id) => store.sound(id)).filter(Boolean) : [];
  const list = state.boardFilter === 'scene' && favs.length ? favs : all;
  const fileInput = h('input', {
    type: 'file', multiple: true, class: 'hidden',
    onChange: (e) => { importFiles(e.target.files, 'oneshot', scene); e.target.value = ''; },
  });
  return h('section', { class: 'board' },
    h('div', { class: 'board-head' },
      h('div', { class: 'section-title' }, 'Einzelgeräusche'),
      h('div', { class: 'grow' }),
      h('button', { class: 'btn icon ghost', title: 'Einzelgeräusche stoppen', onClick: () => engine.stopOneShots() }, '⏹')),
    seg([{ id: 'scene', label: 'Szene' }, { id: 'all', label: 'Alle' }], state.boardFilter, (id) => {
      state.boardFilter = id;
      render();
    }, 'wide small'),
    h('div', { class: 'row compact' },
      h('span', { class: 'tiny', style: 'display:flex;width:18px' }, svg(SPEAKER)),
      slider({
        value: store.settings.volumes.sfx, label: 'Lautstärke Einzelgeräusche',
        oninput: (v) => {
          store.settings.volumes.sfx = v;
          engine.setVolumes({ sfx: v });
          store.save('settings');
        },
      })),
    h('div', { class: 'pads', 'data-scroll': 'pads' },
      list.map((s) => h('button', {
        class: 'pad', 'data-sound': s.id,
        onClick: (e) => playPad(s, e.currentTarget),
      }, h('span', { class: 'pad-icon' }, s.icon), h('span', { class: 'pad-name' }, s.name))),
      h('label', { class: 'pad add' }, fileInput, h('span', { class: 'pad-icon' }, '＋'), h('span', { class: 'pad-name' }, 'Eigener Sound'))));
}

async function playPad(sound, el) {
  try {
    el.classList.add('hit');
    const handle = await engine.playOneShot(sound);
    handle.onended = () => el.classList.remove('hit');
  } catch (e) {
    el.classList.remove('hit');
    showError(e);
  }
}

async function importFiles(files, category, scene) {
  if (!files?.length) return;
  const list = [...files];
  let n = 0;
  let failed = null;
  for (const f of list) {
    toast(`Importiere „${f.name}“ …`);
    try {
      const s = await store.importFile(f, category);
      if (scene && category === 'oneshot') scene.favorites.push(s.id);
      n++;
    } catch (e) {
      console.error(e);
      failed = e;
    }
  }
  if (scene) store.save('scenes', 0);
  render();
  if (failed) showError(failed);
  else toast(`${n} ${n === 1 ? 'Datei' : 'Dateien'} importiert`);
}

// ---------------------------------------------------------------------------
// Szenen-Editor
// ---------------------------------------------------------------------------

function openSceneEditor(scene) {
  const dlg = h('dialog', { class: 'modal' });
  const close = () => {
    store.save('scenes', 0);
    dlg.close();
    dlg.remove();
    render();
  };
  const body = () => h('div', { class: 'modal-body' },
    h('div', { class: 'modal-head' }, h('h2', {}, 'Szene bearbeiten'), h('div', { class: 'grow' }), h('button', { class: 'btn primary', onClick: close }, 'Fertig')),
    h('label', { class: 'field' }, 'Name',
      h('input', { class: 'input', value: scene.name, onInput: (e) => (scene.name = e.target.value || 'Szene') })),
    h('div', { class: 'field' }, 'Symbol',
      h('div', { class: 'icon-pick' },
        h('input', { class: 'input icon-input', value: scene.icon, maxlength: 4, onInput: (e) => (scene.icon = e.target.value || '🎭') }),
        ICONS.map((i) => h('button', { class: `icon-opt ${scene.icon === i ? 'on' : ''}`, onClick: () => { scene.icon = i; refresh(); } }, i)))),
    h('div', { class: 'field' }, 'Farbe',
      h('div', { class: 'colors' }, COLORS.map((c) => h('button', {
        class: `swatch ${scene.color === c ? 'on' : ''}`, style: `--c:${c}`, 'aria-label': c,
        onClick: () => { scene.color = c; refresh(); },
      })))),
    h('div', { class: 'field' }, 'Einzelgeräusche dieser Szene (Soundboard „Szene“)',
      h('div', { class: 'chips small' }, store.soundsIn('oneshot').map((s) => h('button', {
        class: `chip ${scene.favorites.includes(s.id) ? 'on' : ''}`,
        onClick: () => {
          scene.favorites = scene.favorites.includes(s.id) ? scene.favorites.filter((x) => x !== s.id) : [...scene.favorites, s.id];
          refresh();
        },
      }, h('span', { class: 'ico' }, s.icon), s.name)))),
    h('p', { class: 'hint' }, 'Musik, Hintergrund, Wetter und Nebengeräusche stellst du direkt im Szenen-Bereich ein – alles wird automatisch gespeichert.'),
    h('div', { class: 'modal-foot' },
      h('button', {
        class: 'btn ghost',
        onClick: async () => {
          const copy = structuredClone(scene);
          copy.id = uid();
          copy.name = `${scene.name} (Kopie)`;
          [...copy.layers, ...copy.weather].forEach((l) => (l.id = uid()));
          await store.addScene(copy);
          state.sceneId = copy.id;
          close();
        },
      }, '⧉ Duplizieren'),
      h('div', { class: 'grow' }),
      h('button', {
        class: 'btn danger',
        onClick: async () => {
          if (!confirm(`Szene „${scene.name}“ wirklich löschen?`)) return;
          if (player.sceneId === scene.id) player.stop();
          await store.deleteScene(scene.id);
          state.sceneId = null;
          close();
        },
      }, '🗑 Löschen')));
  const refresh = () => dlg.replaceChildren(body());
  refresh();
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  document.body.append(dlg);
  dlg.showModal();
}

// ---------------------------------------------------------------------------
// Bibliothek
// ---------------------------------------------------------------------------

function stopPreviews() {
  for (const p of state.previews.values()) p.stop(0.3);
  state.previews.clear();
}

function renderLibrary() {
  const cat = state.libCat;
  const sounds = store.soundsIn(cat);
  const loop = CATEGORIES[cat].loop;
  const fileInput = h('input', {
    type: 'file', multiple: true, class: 'hidden',
    onChange: (e) => { importFiles(e.target.files, cat); e.target.value = ''; },
  });
  return h('div', { class: 'library', 'data-scroll': 'library' },
    seg(Object.entries(CATEGORIES).map(([id, c]) => ({ id, label: c.label, icon: c.icon })), cat, (id) => {
      stopPreviews();
      state.libCat = id;
      render();
    }, 'wide tabs'),
    h('div', { class: 'lib-toolbar' },
      h('label', { class: 'btn primary' }, fileInput, '＋ Audiodateien importieren'),
      h('span', { class: 'hint' }, loop ? 'Wird nahtlos in Schleife abgespielt.' : 'Wird einmal abgespielt.')),
    h('div', { class: 'lib-list' }, sounds.map((s) => {
      const previewing = state.previews.has(s.id);
      return h('div', { class: 'lib-row' },
        h('span', { class: 'lib-icon' }, s.icon),
        h('div', { class: 'lib-name' }, s.name, h('small', {}, soundOrigin(s))),
        h('button', {
          class: `btn icon ${previewing ? 'danger' : ''}`, title: 'Vorhören',
          onClick: async () => {
            try {
              if (!loop) {
                await engine.playOneShot(s);
              } else if (previewing) {
                state.previews.get(s.id).stop(0.5);
                state.previews.delete(s.id);
                render();
              } else {
                const bus = cat === 'creepy' || cat === 'action' ? 'music' : cat === 'weather' ? 'weather' : 'ambience';
                const handle = engine.startLoop(s, bus, { level: 0.6, fade: 0.5 });
                state.previews.set(s.id, handle);
                handle.ready.catch(showError);
                render();
              }
            } catch (e) {
              showError(e);
            }
          },
        }, previewing ? '■' : '▶'),
        h('button', { class: 'btn icon ghost', title: 'Bearbeiten', onClick: () => openSoundEditor(s) }, '✎'),
        h('button', { class: 'btn icon ghost', title: 'Löschen', onClick: () => deleteSound(s) }, '🗑'));
    })),
    renderHiddenBuiltins(cat),
    h('div', { class: 'card tip' },
      h('h2', {}, 'Wo bekomme ich passende Sounds?'),
      h('p', {}, 'Kostenlose Geräusche und Musik findest du z. B. bei ',
        h('a', { href: 'https://freesound.org', target: '_blank', rel: 'noopener' }, 'freesound.org'), ', ',
        h('a', { href: 'https://tabletopaudio.com', target: '_blank', rel: 'noopener' }, 'tabletopaudio.com'), ' oder ',
        h('a', { href: 'https://pixabay.com/sound-effects/', target: '_blank', rel: 'noopener' }, 'pixabay.com'),
        '. Lade die Datei in die Dateien-App deines iPads und importiere sie hier. Unterstützt werden u. a. MP3, M4A, AAC, WAV, OGG und OPUS (OGG wird beim Import einmalig umgewandelt). Achte auf die jeweilige Lizenz.'),
      h('p', {}, 'Tipp: Für Hintergrund- und Musikschleifen eignen sich Dateien von 1–5 Minuten am besten; sehr lange Dateien brauchen viel Arbeitsspeicher.')));
}

function soundOrigin(s) {
  if (!s.builtin) return 'Eigene Datei';
  if (s.fileId) return 'Grundsound · durch eigene Datei ersetzt';
  return s.modified ? 'Grundsound (synthetisch) · bearbeitet' : 'Grundsound (synthetisch)';
}

function renderHiddenBuiltins(cat) {
  const hidden = store.hiddenBuiltins.filter((b) => b.category === cat);
  if (!hidden.length) return null;
  return h('div', { class: 'card' },
    h('h2', {}, 'Gelöschte Grundsounds'),
    h('div', { class: 'chips small' }, hidden.map((b) => h('button', {
      class: 'chip', title: 'Wiederherstellen',
      onClick: async () => {
        await store.unhideBuiltins([b.id]);
        toast(`„${b.name}“ wiederhergestellt`);
        render();
      },
    }, h('span', { class: 'ico' }, b.icon), b.name, ' ↺'))),
    h('p', { class: 'hint' }, 'Antippen, um einen Grundsound zurückzuholen.'));
}

// Nach Änderungen an der Audioquelle laufende Wiedergaben neu aufbauen
function soundChanged(id) {
  state.previews.get(id)?.stop(0.2);
  state.previews.delete(id);
  engine.forget(id);
  player.refresh();
}

async function deleteSound(s) {
  const what = s.builtin ? 'Grundsound' : 'Sound';
  if (!confirm(`${what} „${s.name}“ löschen? Er wird auch aus allen Szenen entfernt.${s.builtin ? ' Gelöschte Grundsounds lassen sich in der Bibliothek wiederherstellen.' : ''}`)) return;
  await store.deleteSound(s.id);
  soundChanged(s.id);
  render();
}

const SOUND_ICONS = ['🐺', '😱', '😈', '🤭', '🪶', '👻', '👹', '🚪', '✊', '🗡️', '💥', '⚡', '✨', '💓', '🔔', '🐉', '🦇', '🕷️', '💀', '🔥', '🌧️', '🌊', '🌲', '🍺', '⛓️', '🕯️', '⚔️', '🏹', '🐎', '👣', '🗝️', '📜', '🎻', '🥁', '🎺', '🪦'];

function openSoundEditor(sound) {
  const dlg = h('dialog', { class: 'modal' });
  const draft = { name: sound.name, icon: sound.icon };
  const close = () => {
    dlg.close();
    dlg.remove();
    render();
  };
  const save = async () => {
    const patch = { name: draft.name.trim() || sound.name, icon: draft.icon.trim() || sound.icon };
    if (patch.name !== sound.name || patch.icon !== sound.icon) await store.updateSound(sound.id, patch);
    close();
  };
  const fileInput = h('input', {
    type: 'file', class: 'hidden',
    onChange: async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try {
        toast(`Importiere „${f.name}“ …`);
        await store.replaceAudio(sound.id, f);
        soundChanged(sound.id);
        toast('Audio ersetzt – alle Szenen nutzen jetzt die neue Datei.');
        await save();
      } catch (err) {
        showError(err);
      }
    },
  });
  const current = () => store.sound(sound.id) || sound;
  const body = () => h('div', { class: 'modal-body' },
    h('div', { class: 'modal-head' }, h('h2', {}, 'Sound bearbeiten'), h('div', { class: 'grow' }), h('button', { class: 'btn primary', onClick: save }, 'Fertig')),
    h('label', { class: 'field' }, 'Name',
      h('input', { class: 'input', value: draft.name, onInput: (e) => (draft.name = e.target.value) })),
    h('div', { class: 'field' }, 'Symbol',
      h('div', { class: 'icon-pick' },
        h('input', { class: 'input icon-input', value: draft.icon, maxlength: 4, onInput: (e) => (draft.icon = e.target.value) }),
        SOUND_ICONS.map((i) => h('button', { class: `icon-opt ${draft.icon === i ? 'on' : ''}`, onClick: () => { draft.icon = i; refresh(); } }, i)))),
    h('div', { class: 'field' }, 'Audio',
      h('p', { class: 'hint' }, soundOrigin(current()), '. Beim Ersetzen bleiben alle Szenen, die diesen Sound nutzen, unverändert verknüpft.'),
      h('div', { class: 'btn-row' },
        h('label', { class: 'btn' }, fileInput, '⇪ Durch Datei ersetzen'),
        sound.builtin && current().modified ? h('button', {
          class: 'btn',
          onClick: async () => {
            if (!confirm('Name, Symbol und Klang auf den ursprünglichen Grundsound zurücksetzen?')) return;
            await store.restoreBuiltin(sound.id);
            soundChanged(sound.id);
            toast('Original wiederhergestellt');
            close();
          },
        }, '↺ Original wiederherstellen') : null)),
    h('div', { class: 'modal-foot' },
      h('div', { class: 'grow' }),
      h('button', {
        class: 'btn danger',
        onClick: async () => {
          close();
          await deleteSound(sound);
        },
      }, '🗑 Löschen')));
  const refresh = () => dlg.replaceChildren(body());
  refresh();
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); save(); });
  document.body.append(dlg);
  dlg.showModal();
}

// ---------------------------------------------------------------------------
// Einstellungen
// ---------------------------------------------------------------------------

function renderSettings() {
  const st = store.settings;
  const vol = (key, label) => h('div', { class: 'row' }, h('label', { class: 'lbl' }, label), slider({
    value: st.volumes[key], label,
    oninput: (v) => {
      st.volumes[key] = v;
      engine.setVolumes({ [key]: v });
      store.save('settings');
    },
  }));
  const toggle = (key, label, onchange) => h('label', { class: 'toggle' },
    h('input', {
      type: 'checkbox', checked: !!st[key],
      onChange: (e) => {
        st[key] = e.target.checked;
        store.save('settings', 0);
        onchange?.(st[key]);
      },
    }), h('span', { class: 'track' }), label);

  return h('div', { class: 'settings', 'data-scroll': 'settings' },
    h('div', { class: 'card' },
      h('h2', {}, 'Lautstärken'),
      vol('master', 'Gesamt'), vol('music', 'Musik'), vol('ambience', 'Hintergrund'), vol('weather', 'Wetter'), vol('sfx', 'Einzelgeräusche')),
    h('div', { class: 'card' },
      h('h2', {}, 'Wiedergabe'),
      h('div', { class: 'row' }, h('label', { class: 'lbl' }, 'Überblenden'),
        slider({
          value: st.crossfade, min: 0.5, max: 8, step: 0.5, label: 'Überblendzeit',
          oninput: (v) => {
            st.crossfade = v;
            document.getElementById('xf').textContent = `${v} s`;
            store.save('settings');
          },
        }), h('span', { class: 'tiny', id: 'xf' }, `${st.crossfade} s`)),
      toggle('mixWithOthers', 'Mit anderen Apps mischen (nötig, damit Spotify parallel laufen kann)', (v) => engine.setMixWithOthers(v)),
      h('p', { class: 'hint' }, 'Hinweis: Beim Mischen beachtet das iPad den Stummschalter bzw. „Stumm“ im Kontrollzentrum.'),
      toggle('keepAwake', 'Bildschirm während der Wiedergabe wach halten')),
    renderSpotifySettings(),
    h('div', { class: 'card' },
      h('h2', {}, 'Datensicherung'),
      h('p', { class: 'hint' }, 'Szenen, eigene Sounds und Einstellungen werden auf diesem Gerät gespeichert. Mit einer Sicherung kannst du sie auf ein anderes Gerät übertragen.'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', onClick: () => exportBackup().catch(showError) }, '⬇ Sicherung exportieren'),
        h('label', { class: 'btn' }, h('input', {
          type: 'file', accept: '.json,application/json', class: 'hidden',
          onChange: async (e) => {
            const f = e.target.files[0];
            if (!f || !confirm('Alle aktuellen Szenen und eigenen Sounds durch die Sicherung ersetzen?')) return;
            try {
              player.stop();
              await store.importBackup(await f.text());
              engine.cache.clear();
              engine.setVolumes(store.settings.volumes);
              toast('Sicherung geladen');
              render();
            } catch (err) {
              showError(err);
            }
          },
        }), '⬆ Sicherung laden'),
        h('button', {
          class: 'btn danger',
          onClick: async () => {
            if (!confirm('Alle Szenen auf die Beispielszenen zurücksetzen? Eigene Sounds bleiben erhalten.')) return;
            player.stop();
            await store.resetScenes();
            state.sceneId = null;
            render();
          },
        }, '↺ Beispielszenen wiederherstellen'))),
    h('div', { class: 'card' },
      h('h2', {}, 'Als App installieren'),
      h('p', {}, isStandalone()
        ? '✅ Das Cerebros Soundboard läuft als installierte App.'
        : 'Öffne diese Seite in Safari, tippe auf „Teilen“ und dann auf „Zum Home-Bildschirm“. Danach startet das Cerebros Soundboard im Vollbild wie eine normale App – auch offline.')));
}

function renderSpotifySettings() {
  const st = store.settings;
  const card = h('div', { class: 'card' }, h('h2', {}, '🟢 Spotify'));
  if (!spotify.connected) {
    card.append(
      h('p', {}, 'Spiele Musik aus deinem Spotify-Konto (Premium nötig). Einmalige Einrichtung:'),
      h('ol', { class: 'steps' },
        h('li', {}, 'Öffne ', h('a', { href: 'https://developer.spotify.com/dashboard', target: '_blank', rel: 'noopener' }, 'developer.spotify.com/dashboard'), ' und melde dich an.'),
        h('li', {}, '„Create app“ – Name beliebig, bei „Which API/SDKs“ „Web API“ auswählen.'),
        h('li', {}, 'Als Redirect URI genau diese Adresse eintragen:', h('div', { class: 'copy-row' },
          h('code', {}, spotify.redirectUri),
          h('button', { class: 'btn small', onClick: () => copy(spotify.redirectUri) }, 'Kopieren'))),
        h('li', {}, 'Die „Client ID“ der App hier eintragen und auf „Verbinden“ tippen.')),
      h('div', { class: 'row' },
        h('input', {
          class: 'input', placeholder: 'Client ID', value: st.spotifyClientId, autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false',
          onInput: (e) => {
            st.spotifyClientId = e.target.value.trim();
            store.save('settings', 0);
          },
        }),
        h('button', { class: 'btn primary', onClick: () => spotify.login().catch(showError) }, 'Verbinden')),
      h('details', {},
        h('summary', {}, 'Verbindungscode einfügen'),
        h('p', { class: 'hint' }, 'Falls die Anmeldung in der installierten App nicht klappt: Verbinde Spotify in Safari, kopiere dort den Verbindungscode und füge ihn hier ein.'),
        h('div', { class: 'row' },
          h('input', { class: 'input', id: 'sp-code', placeholder: 'Verbindungscode', autocapitalize: 'off', autocomplete: 'off' }),
          h('button', {
            class: 'btn',
            onClick: () => {
              try {
                const clientId = spotify.importCode(document.getElementById('sp-code').value);
                if (clientId) st.spotifyClientId = clientId;
                store.save('settings', 0);
                toast('Spotify verbunden');
                render();
              } catch (e) {
                showError(e);
              }
            },
          }, 'Übernehmen'))));
    return card;
  }
  const devSel = h('select', {
    class: 'select',
    onChange: (e) => spotify.setDevice(e.target.value),
  }, h('option', { value: '' }, 'Automatisch (aktives Gerät)'),
  (state.devices || []).map((d) => h('option', { value: d.id }, `${d.name} (${d.type})`)));
  devSel.value = (state.devices || []).some((d) => d.id === spotify.deviceId) ? spotify.deviceId : '';
  card.append(
    h('p', {}, '✅ Verbunden. Wähle in einer Szene bei „Unheimlich“ oder „Action“ als Quelle eine Spotify-Playlist.'),
    h('div', { class: 'row' }, h('label', { class: 'lbl' }, 'Gerät'), devSel,
      h('button', {
        class: 'btn', onClick: async () => {
          try {
            state.devices = await spotify.devices();
            if (!state.devices.length) toast('Kein Gerät gefunden – öffne die Spotify-App und spiele kurz etwas ab.', 'error');
            render();
          } catch (e) {
            showError(e);
          }
        },
      }, '↻ Suchen')),
    h('p', { class: 'hint' }, 'Die Musik läuft in der Spotify-App (auf dem iPad oder einem anderen Gerät wie einem Lautsprecher). Ist die Spotify-App länger im Hintergrund, verschwindet sie aus der Geräteliste – dann einmal kurz öffnen.'),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', onClick: () => loadPlaylists().then(render).catch(showError) }, '↻ Playlists neu laden'),
      h('button', {
        class: 'btn', onClick: () => {
          copy(spotify.exportCode());
          toast('Verbindungscode kopiert – in der installierten App unter Einstellungen → Spotify einfügen.');
        },
      }, 'Verbindungscode kopieren'),
      h('button', { class: 'btn danger', onClick: () => { spotify.logout(); state.playlists = null; render(); } }, 'Trennen')));
  return card;
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Kopiert');
  } catch {
    prompt('Bitte kopieren:', text);
  }
}

async function exportBackup() {
  toast('Sicherung wird erstellt …');
  const json = await store.exportBackup();
  const name = `cerebros-soundboard-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([json], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'Cerebros-Soundboard-Sicherung' }).catch(() => {});
    return;
  }
  const a = h('a', { href: URL.createObjectURL(file), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  await store.load();
  engine.setVolumes(store.settings.volumes);
  engine.setMixWithOthers(store.settings.mixWithOthers);
  state.sceneId = store.scenes[0]?.id || null;

  // Audio auf iOS bei der ersten Berührung freischalten
  const unlock = () => engine.ensure();
  document.addEventListener('pointerdown', unlock, { once: true, capture: true });

  player.addEventListener('error', (e) => showError(e.detail));
  player.addEventListener('change', () => {
    if (state.view === 'play') render();
  });
  spotify.addEventListener('change', () => {
    if (state.view === 'settings') render();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && player.playing) player.keepAwake();
  });

  const res = await spotify.handleRedirect();
  if (res?.ok) {
    state.view = 'settings';
    toast(isStandalone() ? 'Spotify verbunden 🎉' : 'Spotify verbunden 🎉 – nutzt du die installierte App, kopiere den Verbindungscode.');
  } else if (res?.error) {
    state.view = 'settings';
    setTimeout(() => toast(res.error, 'error'), 100);
  }
  render();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

main().catch(showError);
