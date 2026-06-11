require('dotenv').config();
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');

// ─── M3U KAYNAKLARI (.env'den okunur) ─────────────────────────────
const M3U_SOURCES = [
  process.env.M3U_URL_1,
  process.env.M3U_URL_2,
  process.env.M3U_URL_3,
  process.env.M3U_URL_4,
].filter(Boolean);

if (M3U_SOURCES.length === 0) {
  console.error('❌ Hiç M3U_URL tanımlanmamış! .env dosyasını veya Render Environment Variables bölümünü kontrol et.');
  process.exit(1);
}

// ─── 4K DÜNYA KUPASI KANAL ANAHTAR KELİMELERİ ─────────────────────
const WC_CHANNEL_KEYWORDS = [
  // Almanya / Avusturya
  'fussball.tv', 'fussball tv', 'magenta sport', 'magentasport',
  // Japonya
  'nhk', 'nhk bs4k', 'nhk bsp4k', 'nhk world', 'bs4k',
  // İtalya
  'rai 4k', 'rai4k', 'rai sport 4k',
  // İspanya
  'la1 uhd', 'rtve', 'la1 4k',
  // UK
  'bbc one', 'bbc iplayer', 'bbc 4k',
  // Fransa
  'm6 4k', 'm6+',
  // ABD
  'fox sports 4k', 'fox one', 'telemundo 4k',
  // Kanada
  'tsn 4k', 'tsn2 4k',
  // Bölgesel
  'bein sport 4k', 'beinsport 4k', 'bein 4k', 'bein sports 4k',
  // Genel
  'world cup', 'dünya kupası', 'fifa 2026', 'wc2026',
  // Dazn
  'dazn 4k',
];

// ─── MANIFEST ─────────────────────────────────────────────────────
const manifest = {
  id: 'community.wc2026.live',
  version: '1.0.1',
  name: '⚽ WorldCup 4K',
  description: '2026 Dünya Kupasındaki Maçları 4K Kalitede Sunan Stremio/Nuvio Eklentisi.',
  logo: 'https://i.pinimg.com/736x/f8/08/31/f80831dc0605cd3b553f7e2cd18e2631.jpg',
  resources: ['catalog', 'stream'],
  types: ['tv'],
  catalogs: [
    {
      type: 'tv',
      id: 'wc2026_live',
      name: '⚽ WC 2026 — 4K Kanallar',
      extra: [{ name: 'search', isRequired: false }],
    },
  ],
  behaviorHints: { adult: false, configurable: false },
};

const builder = new addonBuilder(manifest);

// ─── M3U PARSER ───────────────────────────────────────────────────
function parseM3U(text) {
  const channels = [];
  const lines = text.split('\n');
  let current = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('#EXTINF')) {
      const nameMatch  = line.match(/,(.+)$/);
      const logoMatch  = line.match(/tvg-logo="([^"]+)"/i);
      const groupMatch = line.match(/group-title="([^"]+)"/i);
      const idMatch    = line.match(/tvg-id="([^"]+)"/i);
      current = {
        name:  nameMatch  ? nameMatch[1].trim() : 'Unknown',
        logo:  logoMatch  ? logoMatch[1]  : '',
        group: groupMatch ? groupMatch[1] : '',
        tvgId: idMatch    ? idMatch[1]    : '',
      };
    } else if (line.startsWith('http') && current) {
      current.url = line;
      channels.push(current);
      current = null;
    }
  }
  return channels;
}

// ─── 4K WC FİLTRESİ ───────────────────────────────────────────────
function isWCChannel(ch) {
  const haystack = `${ch.name} ${ch.group} ${ch.tvgId}`.toLowerCase();
  return WC_CHANNEL_KEYWORDS.some(kw => haystack.includes(kw.toLowerCase()));
}

// ─── KANAL CACHE ──────────────────────────────────────────────────
let channelCache = null;
let cacheTime    = 0;
const CACHE_TTL  = 30 * 60 * 1000; // 30 dakika

async function getWCChannels() {
  if (channelCache && Date.now() - cacheTime < CACHE_TTL) return channelCache;

  const all = [];
  for (const url of M3U_SOURCES) {
    try {
      const label = new URL(url).hostname;
      console.log(`📡 M3U çekiliyor: ${label}`);
      const res = await axios.get(url, { timeout: 25000, responseType: 'text' });
      const parsed = parseM3U(res.data);
      console.log(`   ✔ ${parsed.length} kanal`);
      all.push(...parsed);
    } catch (e) {
      console.error(`   ✘ Hata: ${e.message}`);
    }
  }

  // WC filtresi + isim bazlı deduplicate
  const seen   = new Set();
  const unique = all.filter(isWCChannel).filter(ch => {
    const key = ch.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`✅ Toplam WC 4K kanal: ${unique.length}`);
  channelCache = unique;
  cacheTime    = Date.now();
  return unique;
}

// ─── CATALOG HANDLER ──────────────────────────────────────────────
builder.defineCatalogHandler(async ({ type, id, extra }) => {
  if (type !== 'tv' || id !== 'wc2026_live') return { metas: [] };

  const channels = await getWCChannels();
  const query    = extra?.search?.toLowerCase() || '';
  const list     = query
    ? channels.filter(ch => ch.name.toLowerCase().includes(query))
    : channels;

  const fallbackPoster = 'https://upload.wikimedia.org/wikipedia/en/thumb/4/4c/2026_FIFA_World_Cup_emblem.svg/200px-2026_FIFA_World_Cup_emblem.svg.png';

  const metas = list.map((ch, i) => ({
    id:          `wc2026:${i}`,
    type:        'tv',
    name:        ch.name,
    poster:      ch.logo || fallbackPoster,
    background:  ch.logo || fallbackPoster,
    logo:        ch.logo || fallbackPoster,
    genres:      [ch.group || 'WC 2026'],
    description: `${ch.group ? ch.group + ' • ' : ''}🔴 CANLI • 4K/HDR`,
  }));

  return { metas };
});

// ─── STREAM HANDLER ───────────────────────────────────────────────
builder.defineStreamHandler(async ({ type, id }) => {
  if (type !== 'tv' || !id.startsWith('wc2026:')) return { streams: [] };

  const channels = await getWCChannels();
  const idx      = parseInt(id.split(':')[1]);
  const ch       = channels[idx];

  if (!ch?.url) return { streams: [] };

  return {
    streams: [{
      url:         ch.url,
      name:        ch.name,
      description: `🔴 CANLI • 4K/HDR\n${ch.group || 'WC 2026'}`,
      behaviorHints: { notWebReady: false },
    }],
  };
});

// ─── SUNUCU ───────────────────────────────────────────────────────
const PORT = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: PORT });
console.log(`🚀 WC 2026 Live Addon → http://localhost:${PORT}/manifest.json`);
