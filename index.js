require('dotenv').config();
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');

const ALL_CHANNELS = require('./channels.json');
console.log(`📋 ${ALL_CHANNELS.length} WC2026 kanal yüklendi.`);

const fallback =
  'https://upload.wikimedia.org/wikipedia/en/thumb/4/4c/2026_FIFA_World_Cup_emblem.svg/200px-2026_FIFA_World_Cup_emblem.svg.png';

const manifest = {
  id:          'community.wc2026.live',
  version:     '1.0.6',
  name:        '⚽ WorldCup 2026 FHD',
  description: 'FIFA World Cup 2026 — FHD yayıncı kanalları.',
  logo:        'https://i.pinimg.com/736x/f8/08/31/f80831dc0605cd3b553f7e2cd18e2631.jpg',
  resources:   ['catalog', 'meta', 'stream'],   // meta EKLENDİ
  types:       ['tv'],
  catalogs: [
    {
      type: 'tv',
      id:   'wc2026_live',
      name: '⚽ WC 2026 — FHD Yayıncılar',
      extra: [{ name: 'search', isRequired: false }],
    },
  ],
  idPrefixes: ['wc2026:'],
  behaviorHints: { adult: false, configurable: false },
};

const builder = new addonBuilder(manifest);

// ─── CATALOG ──────────────────────────────────────────────────────
builder.defineCatalogHandler(({ type, id, extra }) => {
  if (type !== 'tv' || id !== 'wc2026_live')
    return Promise.resolve({ metas: [] });

  const query = (extra?.search || '').toLowerCase().trim();
  const list  = query
    ? ALL_CHANNELS.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.group.toLowerCase().includes(query))
    : ALL_CHANNELS;

  const metas = list.map((ch) => ({
    id:          `wc2026:${ALL_CHANNELS.indexOf(ch)}`,
    type:        'tv',
    name:        ch.name,
    poster:      ch.logo || fallback,
    background:  ch.logo || fallback,
    logo:        ch.logo || fallback,
    genres:      [ch.group],
    description: `${ch.group} • 🔴 CANLI`,
  }));

  console.log(`📂 Catalog → ${metas.length} kanal`);
  return Promise.resolve({ metas });
});

// ─── META ─────────────────────────────────────────────────────────
builder.defineMetaHandler(({ type, id }) => {
  console.log(`📄 Meta isteği: type=${type} id=${id}`);

  if (type !== 'tv' || !id.startsWith('wc2026:'))
    return Promise.resolve({ meta: null });

  const idx = parseInt(id.split(':')[1], 10);
  const ch  = ALL_CHANNELS[idx];
  if (!ch) return Promise.resolve({ meta: null });

  return Promise.resolve({
    meta: {
      id:          id,
      type:        'tv',
      name:        ch.name,
      poster:      ch.logo || fallback,
      background:  ch.logo || fallback,
      logo:        ch.logo || fallback,
      genres:      [ch.group],
      description: `${ch.group} • 🔴 CANLI`,
    },
  });
});

// ─── STREAM ───────────────────────────────────────────────────────
builder.defineStreamHandler(({ type, id }) => {
  console.log(`🎬 Stream isteği: type=${type} id=${id}`);

  if (type !== 'tv') return Promise.resolve({ streams: [] });

  const cleanId = decodeURIComponent(id);
  if (!cleanId.startsWith('wc2026:')) return Promise.resolve({ streams: [] });

  const idx = parseInt(cleanId.split(':')[1], 10);
  const ch  = ALL_CHANNELS[idx];

  if (!ch?.url) {
    console.warn(`⚠️  Kanal bulunamadı: idx=${idx}`);
    return Promise.resolve({ streams: [] });
  }

  console.log(`▶️  Stream: ${ch.name}`);
  return Promise.resolve({
    streams: [{
      url:  ch.url,
      name: ch.name,
      description: `🔴 CANLI • ${ch.group}`,
      behaviorHints: { notWebReady: false },
    }],
  });
});

// ─── SUNUCU ───────────────────────────────────────────────────────
const PORT = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: PORT });
console.log(`🚀 WC 2026 Addon → http://localhost:${PORT}/manifest.json`);

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
