const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');

// ─── M3U KAYNAKLARI ────────────────────────────────────────────────
// Buraya kendi M3U URL'lerini ekle / çıkar
const M3U_SOURCES = [
  'http://hlmtv.shop:8080/get.php?username=yilmazkoc&password=jIKnx4pVSE&type=m3u_plus',
  'http://eurogold4k.xyz:8080/get.php?username=rXykmyKH&password=mrr4yR6&type=m3u_plus',
];

// ─── 4K DÜNYA KUPASI KANAL ANAHTAR KELİMELERİ ─────────────────────
// Görseldeki kanallar + yaygın IPTV adları
const WC_CHANNEL_KEYWORDS = [
  // Almanya / Avusturya
  'fussball.tv', 'fussball tv', 'magenta sport', 'magentasport',
  // Japonya
  'nhk', 'nhk bs4k', 'nhk bsp4k',
  // İtalya
  'rai 4k', 'rai4k', 'rai sport 4k',
  // İspanya
  'la1', 'rtve', 'dazn',
  // UK
  'bbc one', 'bbc iplayer', 'itv',
  // Fransa
  'm6', 'm6 4k', 'tf1',
  // ABD
  'fox sports', 'fox one', 'telemundo',
  // Kanada
  'tsn', 'tsn 4k', 'tsn2',
  // Bölgesel
  'bein sport', 'beinsport', 'bein 4k',
  // Genel WC/FIFA
  'world cup', 'dünya kupası', 'fifa', 'wc 2026', 'wc2026',
  // Japonya NHK varyantları
  'nhk world', 'bs4k',
];

// ─── MANIFEST ─────────────────────────────────────────────────────
const manifest = {
  id: 'community.wc2026.live',
  version: '1.0.0',
  name: '⚽ WC 2026 Live 4K',
  description: 'FIFA World Cup 2026 - 4K/HDR canlı yayın kanalları (IPTV M3U)',
  logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/4/4c/2026_FIFA_World_Cup_emblem.svg/200px-2026_FIFA_World_Cup_emblem.svg.png',
  resources: ['catalog', 'stream'],
  types: ['tv'],
  catalogs: [
    {
      type: 'tv',
      id: 'wc2026_live',
      name: '⚽ WC 2026 - 4K Kanallar',
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
      const nameMatch = line.match(/,(.+)$/);
      const logoMatch = line.match(/tvg-logo="([^"]+)"/i);
      const groupMatch = line.match(/group-title="([^"]+)"/i);
      const idMatch = line.match(/tvg-id="([^"]+)"/i);
      current = {
        name: nameMatch ? nameMatch[1].trim() : 'Unknown',
        logo: logoMatch ? logoMatch[1] : '',
        group: groupMatch ? groupMatch[1] : '',
        id: idMatch ? idMatch[1] : '',
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
  const haystack = `${ch.name} ${ch.group} ${ch.id}`.toLowerCase();
  return WC_CHANNEL_KEYWORDS.some(kw => haystack.includes(kw.toLowerCase()));
}

// ─── KANAL CACHE ──────────────────────────────────────────────────
let channelCache = null;
let cacheTime = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30 dk

async function getWCChannels() {
  if (channelCache && Date.now() - cacheTime < CACHE_TTL) return channelCache;

  const all = [];
  for (const url of M3U_SOURCES) {
    try {
      console.log(`M3U çekiliyor: ${url.split('?')[0]}`);
      const res = await axios.get(url, { timeout: 20000, responseType: 'text' });
      const parsed = parseM3U(res.data);
      console.log(`  → ${parsed.length} kanal bulundu`);
      all.push(...parsed);
    } catch (e) {
      console.error(`M3U hatası (${url.split('?')[0]}):`, e.message);
    }
  }

  // Filtrele + tekrarları kaldır (aynı isim)
  const filtered = all.filter(isWCChannel);
  const seen = new Set();
  const unique = filtered.filter(ch => {
    const key = ch.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`WC 4K kanal sayısı: ${unique.length}`);
  channelCache = unique;
  cacheTime = Date.now();
  return unique;
}

// ─── CATALOG HANDLER ──────────────────────────────────────────────
builder.defineCatalogHandler(async ({ type, id, extra }) => {
  if (type !== 'tv' || id !== 'wc2026_live') return { metas: [] };

  const channels = await getWCChannels();
  const query = extra && extra.search ? extra.search.toLowerCase() : '';

  const filtered = query
    ? channels.filter(ch => ch.name.toLowerCase().includes(query))
    : channels;

  const metas = filtered.map((ch, i) => ({
    id: `wc2026:${i}:${encodeURIComponent(ch.name)}`,
    type: 'tv',
    name: ch.name,
    poster: ch.logo || 'https://upload.wikimedia.org/wikipedia/en/thumb/4/4c/2026_FIFA_World_Cup_emblem.svg/200px-2026_FIFA_World_Cup_emblem.svg.png',
    background: ch.logo || '',
    logo: ch.logo || '',
    genres: [ch.group || 'WC 2026'],
    description: `${ch.group ? ch.group + ' | ' : ''}WC 2026 4K Live`,
  }));

  return { metas };
});

// ─── STREAM HANDLER ───────────────────────────────────────────────
builder.defineStreamHandler(async ({ type, id }) => {
  if (type !== 'tv' || !id.startsWith('wc2026:')) return { streams: [] };

  const channels = await getWCChannels();
  const parts = id.split(':');
  const idx = parseInt(parts[1]);
  const ch = channels[idx];

  if (!ch || !ch.url) return { streams: [] };

  return {
    streams: [
      {
        url: ch.url,
        name: ch.name,
        description: `🔴 CANLI • 4K/HDR\n${ch.group || 'WC 2026'}`,
        behaviorHints: { notWebReady: false },
      },
    ],
  };
});

// ─── SUNUCU ───────────────────────────────────────────────────────
const PORT = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: PORT });
console.log(`✅ WC 2026 Live Addon çalışıyor → http://localhost:${PORT}/manifest.json`);
