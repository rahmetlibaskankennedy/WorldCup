require('dotenv').config();
const { getRouter } = require('stremio-addon-sdk');
const { addonBuilder } = require('stremio-addon-sdk');
const express = require('express');
const http    = require('http');
const https   = require('https');
const urlMod  = require('url');

const ALL_CHANNELS = require('./channels.json');
console.log(`📋 ${ALL_CHANNELS.length} WC2026 kanal yüklendi.`);

// ─── IPTV SUNUCU BİLGİLERİ ────────────────────────────────────────
const IPTV_HOST    = 'sport-birutv.my.id';
const IPTV_PORT    = 80;
const IPTV_MAC     = '00:1A:79:65:FA:D4';
const TOKEN_TTL_MS = 4 * 60 * 1000; // 4 dakika

// Keep-Alive desteği ile bağlantıların kopmasını önleyen kalıcı HTTP Agent'ları
const httpKeepAliveAgent = new http.Agent({ keepAlive: true, maxSockets: 100, keepAliveMsecs: 1000 });
const httpsKeepAliveAgent = new https.Agent({ keepAlive: true, maxSockets: 100, keepAliveMsecs: 1000 });

// Token cache: streamId → { url, expiresAt }
const tokenCache = new Map();

// ─── TOKEN YENİLEME ───────────────────────────────────────────────
async function fetchFreshUrl(ch) {
  if (!ch.url.includes(IPTV_HOST)) return ch.url;

  const parsed   = new urlMod.URL(ch.url);
  const streamId = parsed.searchParams.get('stream');
  if (!streamId) return ch.url;

  const cached = tokenCache.get(streamId);
  if (cached && Date.now() < cached.expiresAt) {
    console.log(`🔑 Cache hit: stream=${streamId}`);
    return cached.url;
  }

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
          agent:    httpKeepAliveAgent,
          headers: {
            'User-Agent':   'Mozilla/5.0 (QtEmbedded; U; Linux; C)',
            'Cookie':       `mac=${IPTV_MAC}; stb_lang=en; timezone=Europe%2FIstanbul`,
            'Referer':      `http://${IPTV_HOST}/c/`,
            'X-User-Agent': 'Model: MAG254; Link: WiFi',
          },
          timeout: 5000,
        },
        (res) => {
          let data = '';
          res.on('data', chunk => (data += chunk));
          res.on('end', () => {
            try {
              const json   = JSON.parse(data);
              const cmd    = json?.js?.cmd || '';
              const newUrl = cmd.replace(/^(ffmpeg|ffrt|vlc)\s+/i, '').trim();
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
    return ch.url;
  }
}

// ─── MANIFEST ─────────────────────────────────────────────────────
const BASE_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 10000}`;

const fallback =
  'https://upload.wikimedia.org/wikipedia/en/thumb/4/4c/2026_FIFA_World_Cup_emblem.svg/200px-2026_FIFA_World_Cup_emblem.svg.png';

const manifest = {
  id:          'community.wc2026.live',
  version:     '1.2.0',
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
      id, type: 'tv',
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

  const streamUrl = await fetchFreshUrl(ch);
  const isHls = streamUrl.includes('.m3u8');
  const needsProxy = streamUrl.includes(IPTV_HOST);
  const finalUrl = needsProxy ? `${BASE_URL}/proxy/${idx}` : streamUrl;

  console.log(`▶️  Stream: ${ch.name} | proxy=${needsProxy} → ${finalUrl.slice(0, 70)}`);

  return {
    streams: [{
      url:  finalUrl,
      name: ch.name,
      description: `🔴 CANLI • ${ch.group}`,
      behaviorHints: {
        notWebReady: !isHls,
        bingGroup:  'wc2026-4k',
      },
    }],
  };
});

// ─── EXPRESS + PROXY ──────────────────────────────────────────────
const app = express();

app.use('/', getRouter(builder.getInterface()));

app.get('/proxy/:idx', async (req, res) => {
  const idx = parseInt(req.params.idx, 10);
  const ch  = ALL_CHANNELS[idx];
  if (!ch) return res.status(404).send('Kanal bulunamadı');

  let targetUrl;
  try {
    // Çakışmayı önlemek için burada doğrudan önbelleğe (cache) güveniyoruz
    targetUrl = await fetchFreshUrl(ch);
  } catch (e) {
    return res.status(502).send('Token alınamadı');
  }

  console.log(`🔀 Proxy: [${idx}] ${ch.name} → ${targetUrl.slice(0, 60)}...`);

  const parsed  = new urlMod.URL(targetUrl);
  const isHttps = parsed.protocol === 'https:';
  const lib     = isHttps ? https : http;
  const currentAgent = isHttps ? httpsKeepAliveAgent : httpKeepAliveAgent;

  const proxyReq = lib.get(
    {
      hostname: parsed.hostname,
      port:     parsed.port || (isHttps ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      agent:    currentAgent, // Kalıcı TCP bağlantısı kurarak paket düşmesini önler
      headers: {
        'User-Agent':   'Mozilla/5.0 (QtEmbedded; U; Linux; C)',
        'Referer':      `http://${IPTV_HOST}/c/`,
        'X-User-Agent': 'Model: MAG254; Link: WiFi',
        ...(req.headers.range ? { 'Range': req.headers.range } : {}),
      },
      timeout: 15000, // 4K yayınların ilk yüklenme süresi için süre 15 saniyeye uzatıldı
    },
    (upRes) => {
      // 4K yayınlardaki kısmi veri akışları (200 veya 206) dışındaki hataları yakala
      if (upRes.statusCode >= 400) {
        console.error(`⚠️ Upstream hata kodu döndürdü: ${upRes.statusCode}`);
        if (!res.headersSent) res.status(upRes.statusCode).send('Yayın bulunamadı veya kapalı');
        return;
      }

      res.writeHead(upRes.statusCode, {
        'Content-Type':  upRes.headers['content-type']  || 'video/mp2t',
        'Content-Length': upRes.headers['content-length'] || '',
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
      });

      // Kesintisiz yüksek veri akışı aktarımı
      upRes.pipe(res);

      upRes.on('error', (e) => {
        console.warn(`🔀 Proxy upstream hata: ${e.message}`);
        res.destroy();
      });
    }
  );

  proxyReq.on('error', (e) => {
    console.warn(`🔀 Proxy bağlantı hatası: ${e.message}`);
    if (!res.headersSent) res.status(502).send('Upstream bağlantı hatası');
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    if (!res.headersSent) res.status(504).send('Upstream timeout');
  });

  // Oynatıcı kapatıldığında ya da kanal değiştirildiğinde eski bağlantıyı hemen imha et
  req.on('close', () => proxyReq.destroy());
});

// ─── SUNUCU BAŞLAT ────────────────────────────────────────────────
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 WC 2026 Addon → ${BASE_URL}/manifest.json`);
  console.log(`🔀 Proxy aktif → ${BASE_URL}/proxy/:idx`);
});

// ─── KEEP-ALIVE ───────────────────────────────────────────────────
if (process.env.RENDER_EXTERNAL_URL) {
  const pingUrl = process.env.RENDER_EXTERNAL_URL + '/manifest.json';
  setInterval(() => {
    https.get(pingUrl, res =>
      console.log(`💓 Keep-alive: ${res.statusCode}`)
    ).on('error', e => console.warn(`💓 Ping hata: ${e.message}`));
  }, 14 * 60 * 1000);
  console.log(`💓 Keep-alive aktif: ${pingUrl}`);
}
