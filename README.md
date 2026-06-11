# ⚽ WC 2026 Live 4K — Stremio / Nuvio Addon

FIFA World Cup 2026 4K/HDR canlı yayın kanalları — IPTV M3U tabanlı.

## Kurulum

### 1. Lokal test

bash
npm install
cp .env.example .env      # .env dosyasını düzenle, M3U URL'lerini gir
node index.js


Stremio/Nuvio’da: http://localhost:7000/manifest.json

### 2. Render.com deploy

1. GitHub’a push et (.env dosyası push edilmez — .gitignore’da)
1. Render → *New Web Service* → repo bağla
1. *Environment Variables* bölümüne ekle:
- M3U_URL_1 → http://SUNUCU:8080/get.php?username=...&type=m3u_plus
- M3U_URL_2 → (varsa ikinci URL)
1. Deploy sonrası Stremio/Nuvio’ya ekle:
   https://XXXXX.onrender.com/manifest.json

## Komutlar

|Alan         |Değer          |
|-------------|---------------|
|Build Command|npm install  |
|Start Command|node index.js|
|Environment  |Node           |
|Plan         |Free           |

## Güvenlik

- Şifreler *asla* kod içine yazılmaz
- .env dosyası .gitignore‘da — GitHub’a gitmez
- Render’da şifreler *Environment Variables* olarak şifreli saklanır

## Özellikler

- ✅ 4 adet M3U kaynağı desteği
- ✅ Credential’lar .env / Render env vars ile güvenli
- ✅ 30 dk cache
- ✅ Katalogda arama
- ✅ Tekrar kanal temizleme
