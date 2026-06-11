require('dotenv').config();
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');

// ─── KANAL LİSTESİ (WC2026 gerçek 4K yayıncıları) ────────────────
const ALL_CHANNELS = require('./channels.json');
console.log(`📋 ${ALL_CHANNELS.length} WC2026 4K kanal yüklendi.`);

// ─── MANIFEST ─────────────────────────────────────────────────────
const manifest = {
  id:          'community.wc2026.live',
  version:     '1.0.4',
  name:        '⚽ WorldCup 2026 4K',
  description: '2026 Dünya Kupasındaki Maçları 4K Kalitede Sunan Stremio/Nuvio Eklentisi.',
  logo:        'https://i.pinimg.com/736x/f8/08/31/f80831dc0605cd3b553f7e2cd18e2631.jpg',
  resources:   ['catalog', 'stream'],
  types:       ['tv'],
  catalogs: [
    {
      type: 'tv',
      id:   'wc2026_live',
      name: '⚽ WC 2026 — 4K Yayıncılar',
      extra: [{ name: 'search', isRequired: false }],
    },
  ],
  behaviorHints: { adult: false, configurable: false },
};

const builder = new addonBuilder(manifest);

// ─── CATALOG HANDLER ──────────────────────────────────────────────
builder.defineCatalogHandler(({ type, id, extra }) => {
  if (type !== 'tv' || id !== 'wc2026_live')
    return Promise.resolve({ metas: [] });

  const query = (extra?.search || '').toLowerCase().trim();
  const list  = query
    ? ALL_CHANNELS.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.group.toLowerCase().includes(query))
    : ALL_CHANNELS;

  const fallback =
    'https://upload.wikimedia.org/wikipedia/en/thumb/4/4c/2026_FIFA_World_Cup_emblem.svg/200px-2026_FIFA_World_Cup_emblem.svg.png';

  const metas = list.map((ch, i) => ({
    id:          `wc2026:${ALL_CHANNELS.indexOf(ch)}`,
    type:        'tv',
    name:        ch.name,
    poster:      ch.logo || fallback,
    background:  ch.logo || fallback,
    logo:        ch.logo || fallback,
    genres:      [ch.group],
    description: `${ch.group} • 🔴 CANLI • 4K/HDR`,
  }));

  console.log(`📂 Catalog → ${metas.length} kanal (search="${query}")`);
  return Promise.resolve({ metas });
});

// ─── STREAM HANDLER ───────────────────────────────────────────────
builder.defineStreamHandler(({ type, id }) => {
  if (type !== 'tv' || !id.startsWith('wc2026:'))
    return Promise.resolve({ streams: [] });

  const idx = parseInt(id.split(':')[1], 10);
  const ch  = ALL_CHANNELS[idx];

  if (!ch?.url) return Promise.resolve({ streams: [] });

  console.log(`▶️  Stream: ${ch.name}`);
  return Promise.resolve({
    streams: [{
      url:  ch.url,
      name: ch.name,
      description: `🔴 CANLI • 4K/HDR\n${ch.group}`,
      behaviorHints: { notWebReady: false },
    }],
  });
});

// ─── SUNUCU ───────────────────────────────────────────────────────
const PORT = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: PORT });
console.log(`🚀 WC 2026 Addon → http://localhost:${PORT}/manifest.json`);

// ─── KEEP-ALIVE (Render Free Plan) ────────────────────────────────
if (process.env.RENDER_EXTERNAL_URL) {
  const https = require('https');
  const pingUrl = process.env.RENDER_EXTERNAL_URL + '/manifest.json';
  setInterval(() => {
    https.get(pingUrl, res =>
      console.log(`💓 Keep-alive: ${res.statusCode}`)
    ).on('error', e => console.warn(`💓 Ping hata: ${e.message}`));
  }, 14 * 60 * 1000);
  console.log(`💓 Keep-alive aktif: ${pingUrl}`);
}
