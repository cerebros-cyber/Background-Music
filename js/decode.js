// Audiodateien prüfen und dekodieren. Formate, die der Browser nicht kennt
// (auf dem iPad z. B. Ogg Vorbis/Opus), werden per WebAssembly-Decoder umgewandelt.

const VENDOR = {
  vorbis: { src: 'js/vendor/ogg-vorbis-decoder.min.js', global: 'ogg-vorbis-decoder', cls: 'OggVorbisDecoder' },
  opus: { src: 'js/vendor/ogg-opus-decoder.min.js', global: 'ogg-opus-decoder', cls: 'OggOpusDecoder' },
};
const loaded = {};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Ogg-Decoder konnte nicht geladen werden.'));
    document.head.append(s);
  });
}

// „OggS“ am Dateianfang; Codec steht im ersten Datenblock
export function oggCodec(buf) {
  const b = new Uint8Array(buf, 0, Math.min(buf.byteLength, 128));
  if (String.fromCharCode(...b.subarray(0, 4)) !== 'OggS') return null;
  const head = String.fromCharCode(...b);
  if (head.includes('OpusHead')) return 'opus';
  if (head.includes('vorbis')) return 'vorbis';
  return null;
}

async function decodeOgg(buf, codec) {
  const v = VENDOR[codec];
  if (!loaded[codec]) loaded[codec] = loadScript(v.src);
  await loaded[codec];
  const decoder = new window[v.global][v.cls]();
  await decoder.ready;
  try {
    const res = await decoder.decodeFile(new Uint8Array(buf));
    if (!res.samplesDecoded) throw new Error('Die Ogg-Datei enthält keine lesbaren Audiodaten.');
    return { channelData: res.channelData, sampleRate: res.sampleRate, length: res.samplesDecoded };
  } finally {
    decoder.free();
  }
}

async function nativeDecode(ctx, buf) {
  return ctx.decodeAudioData(buf.slice(0));
}

// Für die Wiedergabe: ArrayBuffer -> AudioBuffer
export async function decodeAudio(ctx, buf) {
  try {
    return await nativeDecode(ctx, buf);
  } catch (err) {
    const codec = oggCodec(buf);
    if (!codec) throw err;
    const pcm = await decodeOgg(buf, codec);
    const out = ctx.createBuffer(pcm.channelData.length, pcm.length, pcm.sampleRate);
    pcm.channelData.forEach((d, i) => out.copyToChannel(d.subarray(0, pcm.length), i));
    return out;
  }
}

// Beim Import: Datei prüfen und bei Bedarf in WAV umwandeln, damit sie überall abspielbar ist
export async function prepareImport(file) {
  const data = await file.arrayBuffer();
  const probe = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, 44100);
  try {
    await nativeDecode(probe, data);
    return { data, type: file.type, name: file.name };
  } catch {
    const codec = oggCodec(data);
    if (!codec) {
      throw new Error(`„${file.name}“ ist keine unterstützte Audiodatei (möglich sind z. B. MP3, M4A, AAC, WAV, OGG, OPUS, FLAC).`);
    }
    const pcm = await decodeOgg(data, codec);
    return { data: encodeWav(pcm), type: 'audio/wav', name: file.name.replace(/\.[^.]+$/, '') + '.wav' };
  }
}

function encodeWav({ channelData, sampleRate, length }) {
  const channels = Math.min(2, channelData.length);
  const bytes = length * channels * 2;
  const buf = new ArrayBuffer(44 + bytes);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + bytes, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * channels * 2, true);
  v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, bytes, true);
  const pcm = new Int16Array(buf, 44);
  for (let i = 0, k = 0; i < length; i++) {
    for (let c = 0; c < channels; c++) {
      const s = Math.max(-1, Math.min(1, channelData[c][i]));
      pcm[k++] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
  }
  return buf;
}
