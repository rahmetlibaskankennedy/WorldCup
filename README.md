# ⚽ WC 2026 Live 4K — Stremio / Nuvio Addon

FIFA World Cup 2026 4K/HDR canlı yayın kanalları — IPTV M3U tabanlı.

## Kurulum

### Lokal test

```bash
npm install
node index.js
# → http://localhost:7000/manifest.json
```

Stremio’da: `http://localhost:7000/manifest.json` adresini “Install from URL” ile ekle.

### Render.com deploy

1. GitHub’a push et
1. Render’da **New Web Service** → repo bağla
1. `render.yaml` otomatik algılanır
1. Deploy sonrası: `https://XXX.onrender.com/manifest.json`

## M3U Kaynakları güncelleme

`index.js` dosyasındaki `M3U_SOURCES` dizisini düzenle:

```js
const M3U_SOURCES = [
  'http://SUNUCU:8080/get.php?username=USER&password=PASS&type=m3u_plus',
];
```

## Kanal filtresi

`WC_CHANNEL_KEYWORDS` dizisine yeni anahtar kelime ekleyerek daha fazla kanal yakalayabilirsin.

## Özellikler

- ✅ Birden fazla M3U kaynağı desteği
- ✅ 30 dk cache (M3U her seferinde çekilmez)
- ✅ Arama desteği (catalog’da search)
- ✅ Tekrar kanal temizleme
- ✅ Render.com free tier uyumlu
