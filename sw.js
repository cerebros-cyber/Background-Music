// Service Worker: hält die App offline verfügbar.
// Bei Änderungen an den Dateien VERSION erhöhen, damit Geräte die neue Fassung laden.
const VERSION = 'cerebros-v6';
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/app.js',
  'js/db.js',
  'js/engine.js',
  'js/player.js',
  'js/spotify.js',
  'js/store.js',
  'js/synth.js',
  'js/decode.js',
  'js/vendor/ogg-vorbis-decoder.min.js',
  'js/vendor/ogg-opus-decoder.min.js',
  'fonts/Cinzel-normal.woff2',
  'fonts/EBGaramond-normal.woff2',
  'fonts/EBGaramond-italic.woff2',
  'img/backdrop.jpg',
  'img/cerebros-logo.webp',
  'img/cerebros-logo-96.png',
  'icons/favicon-64.png',
  'icons/icon-maskable-512.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Netzwerk zuerst (für Aktualisierungen), bei Offline-Betrieb aus dem Cache
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && !url.search) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./'))),
  );
});
