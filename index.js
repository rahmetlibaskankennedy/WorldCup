require('dotenv').config();
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const http  = require('http');
const https = require('https');
const url   = require('url');

const ALL_CHANNELS = require('./channels.json');
console.log(`📋 ${ALL_CHANNELS.length} WC2026 kanal yüklendi.`);

// ─── IPTV SUNUCU BİLGİLERİ ────────────────────────────────────────
// sport-birutv.my.id tokenlarını yenilemek için Stalker Portal API kullanılır.
// MAC adresi channels.json URL'lerinden otomatik alınır.
const IPTV_HOST  = 'sport-birutv.my.id';
const IPTV_PORT  = 80;
const IPTV_MAC   = '00:1A:79:65:FA:D4';

// Token cache: { streamId -> { url, expiresAt } }
const tokenCache = new Map();
const TOKEN_TTL_MS = 4 * 60 * 1000; // 4 dakika (token ömrü genelde 5dk)

// ─── TOKEN YENİLEME ───────────────────────────────────────────────
async function fetchFreshUrl(ch) {
  // Sadece sport-birutv.my.id URL'leri için token yenile
  if (!ch.url.includes(IPTV_HOST)) return ch.url;

  const parsed   = new url.URL(ch.url);
  const streamId = parsed.searchParams.get('stream');
  if (!streamId) return ch.url;

  // Cache'de geçerli token var mı?
  const cached = tokenCache.get(streamId);
  if (cached && Date.now() < cached.expiresAt) {
    console.log(`🔑 Cache hit: stream=${streamId}`);
    return cached.url;
  }

  // Stalker Portal üzerinden yeni token iste
  // GET /portal.php?action=create_link&type=itv&cmd=ffrt%20http://localhost/ch/{streamId}&series=&forced_storage=undefined&disable_ad=0&download=0&JsHttpRequest=1-xml
  const portalPath =
    `/portal.php?action=create_link&type=itv` +
    `&cmd=${encodeURIComponent(`ffrt http://localhost/ch/${streamId}`)}` +
    `&series=&forced_storage=undefined&disable_ad=0&download=0&JsHttpRequest=1-xml`;

  try {
    const freshUrl = await new Promise((resolve, reject) => {
      const req = http.get(
        {
          hostname: IPTV_HOST,
          port:     IPTV_PORT,
          path:     portalPath,
          headers: {
            'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C)',
            'Cookie':     `mac=${IPTV_MAC}; stb_lang=en; timezone=Europe%2FIstanbul`,
            'Referer':    `http://${IPTV_HOST}/c/`,
            'X-User-Agent': 'Model: MAG254; Link: WiFi',
          },
          timeout: 5000,
        },
        (res) => {
          let data = '';
          res.on('data', chunk => (data += chunk));
          res.on('end', () => {
            try {
              // Yanıt: {"js":{"cmd":"http://...","streamer_id":...}}
              const json = JSON.parse(data);
              const cmd  = json?.js?.cmd || '';
              // "ffrt http://..." formatından URL çıkar
              const newUrl = cmd.replace(/^ffrt\s+/, '').trim();
              if (newUrl.startsWith('http')) resolve(newUrl);
              else reject(new Error('Geçersiz cmd: ' + cmd));
            } catch (e) {
              reject(new Error('JSON parse hatası: ' + data.slice(0, 100)));
            }
          });
        }
      );
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Portal timeout')); });
    });

    tokenCache.set(streamId, { url: freshUrl, expiresAt: Date.now() + TOKEN_TTL_MS });
    console.log(`🔑 Yeni token alındı: stream=${streamId}`);
    return freshUrl;

  } catch (err) {
    console.warn(`⚠️  Token yenileme başarısız (stream=${streamId}): ${err.message}`);
    // Hata durumunda eski URL'yi döndür
    return ch.url;
  }
}

// ─── MANIFEST ─────────────────────────────────────────────────────
const fallback =
  'https://upload.wikimedia.org/wikipedia/en/thumb/4/4c/2026_FIFA_World_Cup_emblem.svg/200px-2026_FIFA_World_Cup_emblem.svg.png';

const manifest = {
  id:          'community.wc2026.live',
  version:     '1.1.0',
  name:        '⚽ WorldCup 2026 4K',
  description: 'FIFA World Cup 2026 — 4K UHD yayıncı kanalları.',
  logo:        'https://i.pinimg.com/736x/f8/08/31/f80831dc0605cd3b553f7e2cd18e2631.jpg',
  resources:   ['catalog', 'meta', 'stream'],
  types:       ['tv'],
  catalogs: [
    {
      type: 'tv',
      id:   'wc2026_live',
      name: '⚽ WC 2026 — 4K UHD Yayıncılar',
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
builder.defineStreamHandler(async ({ type, id }) => {
  console.log(`🎬 Stream isteği: type=${type} id=${id}`);

  if (type !== 'tv') return { streams: [] };

  const cleanId = decodeURIComponent(id);
  if (!cleanId.startsWith('wc2026:')) return { streams: [] };

  const idx = parseInt(cleanId.split(':')[1], 10);
  const ch  = ALL_CHANNELS[idx];

  if (!ch?.url) {
    console.warn(`⚠️  Kanal bulunamadı: idx=${idx}`);
    return { streams: [] };
  }

  // Taze URL al (token yenileme veya direkt URL)
  const streamUrl = await fetchFreshUrl(ch);

  // URL tipine göre davranış ipucu belirle
  const isHls     = streamUrl.includes('.m3u8');
  const isMpegTs  = streamUrl.includes('extension=ts') || streamUrl.includes('/play/live.php');

  console.log(`▶️  Stream: ${ch.name} → ${streamUrl.slice(0, 60)}...`);

  return {
    streams: [
      {
        url:  streamUrl,
        name: ch.name,
        description: `🔴 CANLI • ${ch.group}`,
        behaviorHints: {
          // TS akışları web player'da çalışmaz, harici oynatıcıya gönder
          notWebReady: isMpegTs && !isHls,
          bingeGroup:  'wc2026-4k',
        },
        // Proxy geçişi için header ipuçları (Stremio bazı versiyonlarda destekler)
        ...(isMpegTs && {
          headers: {
            'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C)',
            'Referer':    `http://${IPTV_HOST}/c/`,
          },
        }),
      },
    ],
  };
});

// ─── SUNUCU ───────────────────────────────────────────────────────
const PORT = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: PORT });
console.log(`🚀 WC 2026 Addon → http://localhost:${PORT}/manifest.json`);

// ─── KEEP-ALIVE (Render free tier için) ───────────────────────────
if (process.env.RENDER_EXTERNAL_URL) {
  const pingUrl = process.env.RENDER_EXTERNAL_URL + '/manifest.json';
  setInterval(() => {
    https.get(pingUrl, res =>
      console.log(`💓 Keep-alive: ${res.statusCode}`)
    ).on('error', e => console.warn(`💓 Ping hata: ${e.message}`));
  }, 14 * 60 * 1000);
  console.log(`💓 Keep-alive aktif: ${pingUrl}`);
}
