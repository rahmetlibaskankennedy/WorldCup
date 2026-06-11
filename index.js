require('dotenv').config();
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');

// ─── M3U KAYNAKLARI ───────────────────────────────────────────────
const M3U_SOURCES = [
  process.env.M3U_URL_1,
  process.env.M3U_URL_2,
  process.env.M3U_URL_3,
  process.env.M3U_URL_4,
].filter(Boolean);

if (M3U_SOURCES.length === 0) {
  console.error('❌ Hiç M3U_URL tanımlanmamış! .env veya Render Environment Variables kontrol et.');
  process.exit(1);
}

console.log(`📋 ${M3U_SOURCES.length} adet M3U kaynağı yüklendi.`);

// ─── ANAHTAR KELİMELER ────────────────────────────────────────────
// Boş bırakırsan TÜM kanallar gösterilir (filtre yok).
// Sadece belirli kanalları göstermek istersen buraya ekle.
const FILTER_KEYWORDS = [
  // Dünya Kupası
  'world cup', 'dünya kupası', 'fifa', 'wc2026', 'wc 2026',
  // Spor kanalları (geniş)
  'sport', 'sports', 'spor',
  'bein', 'dazn', 'espn', 'eurosport',
  'sky sport', 'fox sport', 'nbc sport',
  // Türkiye
  'trt', 'a spor', 'aspor', 'tivibu',
  // Avrupa yayıncıları
  'rai', 'rtve', 'bbc', 'itv', 'zdf', 'das erste', 'nhk',
  'magenta', 'fussball', 'canal+', 'canal plus',
  // 4K / UHD
  '4k', 'uhd', 'hdr',
];

// FILTER_KEYWORDS tamamen boşsa filtre devre dışı → tüm kanallar gelir
const FILTER_ENABLED = FILTER_KEYWORDS.length > 0;

// ─── MANIFEST ─────────────────────────────────────────────────────
const manifest = {
  id: 'community.wc2026.live',
  version: '1.0.2',
  name: '⚽ WorldCup 4K',
  description: '2026 Dünya Kupası maçlarını 4K kalitede izle.',
  logo: 'https://i.pinimg.com/736x/f8/08/31/f80831dc0605cd3b553f7e2cd18e2631.jpg',
  resources: ['catalog', 'stream'],
  types: ['tv'],
  catalogs: [
    {
      type: 'tv',
      id: 'wc2026_live',
      name: '⚽ WC 2026 — Canlı Kanallar',
      extra: [{ name: 'search', isRequired: false }],
    },
  ],
  behaviorHints: { adult: false, configurable: false },
};

const builder = new addonBuilder(manifest);

// ─── M3U PARSER ───────────────────────────────────────────────────
function parseM3U(text) {
  const channels = [];
  const lines = text.split(/\r?\n/);
  let current = null;

  for (const raw of lines) {
    const line = raw.trim();

    if (line.startsWith('#EXTINF')) {
      const nameMatch  = line.match(/,(.+)$/);
      const logoMatch  = line.match(/tvg-logo="([^"]*?)"/i);
      const groupMatch = line.match(/group-title="([^"]*?)"/i);
      const idMatch    = line.match(/tvg-id="([^"]*?)"/i);

      current = {
        name:  nameMatch  ? nameMatch[1].trim()  : 'Kanal',
        logo:  logoMatch  ? logoMatch[1].trim()  : '',
        group: groupMatch ? groupMatch[1].trim() : '',
        tvgId: idMatch    ? idMatch[1].trim()    : '',
      };
    } else if (line.startsWith('http') && current) {
      current.url = line;
      channels.push(current);
      current = null;
    } else if (!line.startsWith('#') && line.length > 0 && current) {
      // http yerine direkt URL gelen bazı M3U'lar için
      current.url = line;
      channels.push(current);
      current = null;
    }
  }

  return channels;
}

// ─── FİLTRE ───────────────────────────────────────────────────────
function matchesFilter(ch) {
  if (!FILTER_ENABLED) return true;
  const haystack = `${ch.name} ${ch.group} ${ch.tvgId}`.toLowerCase();
  return FILTER_KEYWORDS.some(kw => haystack.includes(kw.toLowerCase()));
}

// ─── CACHE ────────────────────────────────────────────────────────
let channelCache = null;
let cacheTime    = 0;
const CACHE_TTL  = 30 * 60 * 1000; // 30 dakika

async function getAllChannels() {
  if (channelCache && Date.now() - cacheTime < CACHE_TTL) {
    console.log(`📦 Cache'den döndürüldü: ${channelCache.length} kanal`);
    return channelCache;
  }

  const all = [];

  for (const url of M3U_SOURCES) {
    let label = url;
    try {
      label = new URL(url).hostname;
    } catch (_) {}

    console.log(`📡 M3U çekiliyor: ${label}`);

    try {
      const res = await axios.get(url, {
        timeout: 30000,
        responseType: 'text',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; StremioAddon/1.0)',
        },
        // HTTP redirect'lere izin ver
        maxRedirects: 5,
        // SSL hatalarını tolere et (bazı IPTV sunucularında self-signed cert)
        httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
      });

      const parsed = parseM3U(res.data);
      console.log(`   ✔ ${parsed.length} kanal alındı (${label})`);
      all.push(...parsed);
    } catch (e) {
      console.error(`   ✘ ${label} — HATA: ${e.message}`);
    }
  }

  if (all.length === 0) {
    console.warn('⚠️  Hiç kanal çekilemedi! M3U URL\'leri ve ağ erişimini kontrol et.');
    return [];
  }

  // Filtrele
  const filtered = FILTER_ENABLED ? all.filter(matchesFilter) : all;
  console.log(`🔍 Filtre sonrası: ${filtered.length} / ${all.length} kanal`);

  // İsim bazlı deduplicate
  const seen   = new Set();
  const unique = filtered.filter(ch => {
    const key = ch.name.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`✅ Benzersiz kanal: ${unique.length}`);

  channelCache = unique;
  cacheTime    = Date.now();
  return unique;
}

// ─── CATALOG HANDLER ──────────────────────────────────────────────
builder.defineCatalogHandler(async ({ type, id, extra }) => {
  if (type !== 'tv' || id !== 'wc2026_live') return { metas: [] };

  console.log(`📂 Catalog isteği: type=${type} id=${id} search=${extra?.search || '-'}`);

  const channels = await getAllChannels();

  const query = (extra?.search || '').toLowerCase().trim();
  const list  = query
    ? channels.filter(ch => ch.name.toLowerCase().includes(query))
    : channels;

  const fallbackPoster =
    'https://upload.wikimedia.org/wikipedia/en/thumb/4/4c/2026_FIFA_World_Cup_emblem.svg/200px-2026_FIFA_World_Cup_emblem.svg.png';

  const metas = list.map((ch, i) => ({
    id:          `wc2026:${i}`,
    type:        'tv',
    name:        ch.name,
    poster:      ch.logo || fallbackPoster,
    background:  ch.logo || fallbackPoster,
    logo:        ch.logo || fallbackPoster,
    genres:      [ch.group || 'WC 2026'],
    description: `${ch.group ? ch.group + ' • ' : ''}🔴 CANLI`,
  }));

  console.log(`📤 ${metas.length} meta döndürüldü`);
  return { metas };
});

// ─── STREAM HANDLER ───────────────────────────────────────────────
builder.defineStreamHandler(async ({ type, id }) => {
  if (type !== 'tv' || !id.startsWith('wc2026:')) return { streams: [] };

  const channels = await getAllChannels();
  const idx      = parseInt(id.split(':')[1], 10);
  const ch       = channels[idx];

  if (!ch?.url) {
    console.warn(`⚠️  Stream bulunamadı: id=${id}`);
    return { streams: [] };
  }

  console.log(`▶️  Stream: ${ch.name} → ${ch.url.substring(0, 60)}...`);

  return {
    streams: [{
      url:  ch.url,
      name: ch.name,
      description: `🔴 CANLI • ${ch.group || 'WC 2026'}`,
      behaviorHints: { notWebReady: false },
    }],
  };
});

// ─── SUNUCU ───────────────────────────────────────────────────────
const PORT = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: PORT });
console.log(`🚀 WC 2026 Addon → http://localhost:${PORT}/manifest.json`);

// Startup'ta M3U'yu hemen çek (cache'i ısıt)
getAllChannels().then(chs => {
  console.log(`🎯 Startup tamamlandı: ${chs.length} kanal cache'de hazır`);
}).catch(e => {
  console.error(`💥 Startup M3U hatası: ${e.message}`);
});

// ─── KEEP-ALIVE (Render Free Plan için) ───────────────────────────
if (process.env.RENDER_EXTERNAL_URL) {
  const https = require('https');
  const pingUrl = process.env.RENDER_EXTERNAL_URL + '/manifest.json';
  setInterval(() => {
    https.get(pingUrl, (res) => {
      console.log(`💓 Keep-alive ping: ${res.statusCode}`);
    }).on('error', (e) => {
      console.warn(`💓 Keep-alive hata: ${e.message}`);
    });
  }, 14 * 60 * 1000); // 14 dakikada bir
  console.log(`💓 Keep-alive aktif: ${pingUrl}`);
}
