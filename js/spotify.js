// Spotify-Anbindung über die Web-API (Authorization Code mit PKCE, ohne Server).
// Die Wiedergabe läuft in der Spotify-App (Spotify Connect) – diese App steuert sie fern.
const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API = 'https://api.spotify.com/v1';
const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
].join(' ');
const LS_TOKENS = 'kk.spotify.tokens';
const LS_PKCE = 'kk.spotify.pkce';
const LS_DEVICE = 'kk.spotify.device';

export class SpotifyError extends Error {
  constructor(status, message, reason) {
    super(message || `Spotify-Fehler ${status}`);
    this.status = status;
    this.reason = reason;
  }
}

export function parseSpotifyLink(text) {
  const s = (text || '').trim();
  let m = s.match(/^spotify:(playlist|album|track|artist|show|episode):([A-Za-z0-9]+)$/);
  if (m) return { type: m[1], id: m[2], uri: s };
  m = s.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:user\/[^/]+\/)?(playlist|album|track|artist|show|episode)\/([A-Za-z0-9]+)/);
  if (m) return { type: m[1], id: m[2], uri: `spotify:${m[1]}:${m[2]}` };
  return null;
}

export class Spotify extends EventTarget {
  constructor(getClientId) {
    super();
    this.getClientId = getClientId;
    this.tokens = readJson(LS_TOKENS);
    this.deviceId = localStorage.getItem(LS_DEVICE) || '';
    this.playlistCache = null;
  }

  get redirectUri() {
    return location.origin + location.pathname.replace(/index\.html$/, '');
  }

  get connected() {
    return !!this.tokens?.refresh_token;
  }

  async login() {
    const clientId = this.getClientId();
    if (!clientId) throw new Error('Bitte zuerst die Spotify Client-ID eintragen.');
    const verifier = randomString(64);
    const state = randomString(16);
    localStorage.setItem(LS_PKCE, JSON.stringify({ verifier, state }));
    const challenge = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      scope: SCOPES,
      redirect_uri: this.redirectUri,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      state,
    });
    location.href = `${AUTH_URL}?${params}`;
  }

  // Nach der Rückkehr von Spotify: Code gegen Token tauschen
  async handleRedirect() {
    const p = new URLSearchParams(location.search);
    if (!p.has('code') && !p.has('error')) return null;
    history.replaceState(null, '', this.redirectUri + location.hash);
    if (p.has('error')) return { error: `Spotify-Anmeldung abgebrochen (${p.get('error')}).` };
    const saved = readJson(LS_PKCE);
    localStorage.removeItem(LS_PKCE);
    if (!saved || saved.state !== p.get('state')) {
      return {
        error:
          'Die Anmeldung wurde in einem anderen Fenster begonnen. Tipp: Öffne die App-Adresse in Safari, verbinde dort Spotify und übertrage den Verbindungscode (Einstellungen → Spotify).',
      };
    }
    try {
      const tokens = await this.tokenRequest({
        grant_type: 'authorization_code',
        code: p.get('code'),
        redirect_uri: this.redirectUri,
        client_id: this.getClientId(),
        code_verifier: saved.verifier,
      });
      this.saveTokens(tokens);
      return { ok: true };
    } catch (err) {
      return { error: err.message };
    }
  }

  async tokenRequest(body) {
    const r = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new SpotifyError(r.status, j.error_description || j.error || 'Token-Anfrage fehlgeschlagen');
    return j;
  }

  saveTokens(t) {
    this.tokens = {
      access_token: t.access_token,
      refresh_token: t.refresh_token || this.tokens?.refresh_token,
      expires_at: Date.now() + (t.expires_in || 3600) * 1000,
    };
    localStorage.setItem(LS_TOKENS, JSON.stringify(this.tokens));
    this.dispatchEvent(new Event('change'));
  }

  logout() {
    this.tokens = null;
    this.playlistCache = null;
    localStorage.removeItem(LS_TOKENS);
    this.dispatchEvent(new Event('change'));
  }

  // Verbindungscode zum Übertragen der Anmeldung (z. B. Safari → installierte App)
  exportCode() {
    if (!this.connected) return '';
    return btoa(JSON.stringify({ r: this.tokens.refresh_token, c: this.getClientId() }));
  }

  importCode(code) {
    const { r, c } = JSON.parse(atob(code.trim()));
    if (!r) throw new Error('Ungültiger Code');
    this.tokens = { refresh_token: r, access_token: '', expires_at: 0 };
    localStorage.setItem(LS_TOKENS, JSON.stringify(this.tokens));
    this.dispatchEvent(new Event('change'));
    return c;
  }

  async accessToken() {
    if (!this.connected) throw new Error('Spotify ist nicht verbunden.');
    if (this.tokens.access_token && Date.now() < this.tokens.expires_at - 60_000) return this.tokens.access_token;
    if (!this.refreshing) {
      this.refreshing = this.tokenRequest({
        grant_type: 'refresh_token',
        refresh_token: this.tokens.refresh_token,
        client_id: this.getClientId(),
      })
        .then((t) => this.saveTokens(t))
        .catch((err) => {
          if (err.status === 400) this.logout();
          throw err;
        })
        .finally(() => (this.refreshing = null));
    }
    await this.refreshing;
    return this.tokens.access_token;
  }

  async api(method, path, body) {
    const token = await this.accessToken();
    const r = await fetch(API + path, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 204 || r.status === 202) return null;
    const text = await r.text();
    let j = null;
    try { j = text ? JSON.parse(text) : null; } catch { /* kein JSON */ }
    if (!r.ok) throw new SpotifyError(r.status, j?.error?.message, j?.error?.reason);
    return j;
  }

  async devices() {
    const j = await this.api('GET', '/me/player/devices');
    return j?.devices || [];
  }

  setDevice(id) {
    this.deviceId = id;
    localStorage.setItem(LS_DEVICE, id);
  }

  async playlists(force = false) {
    if (this.playlistCache && !force) return this.playlistCache;
    const all = [];
    let url = '/me/playlists?limit=50';
    while (url && all.length < 300) {
      const j = await this.api('GET', url);
      all.push(...(j?.items || []).filter(Boolean).map((p) => ({ uri: p.uri, name: p.name })));
      url = j?.next ? j.next.replace(API, '') : null;
    }
    this.playlistCache = all;
    return all;
  }

  async name(uri) {
    const link = parseSpotifyLink(uri);
    if (!link) return uri;
    try {
      const j = await this.api('GET', `/${link.type}s/${link.id}`);
      return j?.name || uri;
    } catch {
      return uri;
    }
  }

  async resolveDevice() {
    const devices = await this.devices();
    const chosen = devices.find((d) => d.id === this.deviceId) || devices.find((d) => d.is_active) || devices[0];
    if (!chosen) {
      throw new Error('Kein Spotify-Gerät gefunden. Öffne die Spotify-App auf dem iPad, spiele kurz etwas ab und versuche es erneut.');
    }
    return chosen.id;
  }

  async play(uri) {
    const device = await this.resolveDevice();
    const body = uri.includes(':track:') || uri.includes(':episode:') ? { uris: [uri] } : { context_uri: uri };
    await this.api('PUT', `/me/player/play?device_id=${encodeURIComponent(device)}`, body);
  }

  async pause() {
    try {
      await this.api('PUT', '/me/player/pause');
    } catch (err) {
      // 403/404: es läuft gerade nichts – kein Problem
      if (err.status !== 403 && err.status !== 404) throw err;
    }
  }

  resume() {
    return this.api('PUT', '/me/player/play');
  }

  next() {
    return this.api('POST', '/me/player/next');
  }

  previous() {
    return this.api('POST', '/me/player/previous');
  }

  async nowPlaying() {
    const j = await this.api('GET', '/me/player');
    if (!j) return null;
    return {
      playing: j.is_playing,
      device: j.device?.name,
      title: j.item?.name,
      artist: j.item?.artists?.map((a) => a.name).join(', ') || j.item?.show?.name,
    };
  }
}

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function randomString(len) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const v = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(v, (x) => chars[x % chars.length]).join('');
}

function base64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}
