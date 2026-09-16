# HentaiMini

Yerel depolama kapalıdır; sadece Mongo varsa çalışır. Bu proje boştaki katalog arayüzü olarak tasarlanmıştır.

## Gerekenler
- Node.js 18+

## Kurulum
1. Bu klasörde terminal aç.
2. `npm install`
3. `npm start`
4. Tarayıcıdan `http://localhost:3000` adresini aç.

## Durum
- Yerel depolama kapalıdır.
- Frontend video ekleme butonu kapatılmıştır.
- Remote sync kapalıdır.
- `MONGO_URI` kullanılmaz; gerekli ise harici Mongo bağlantısı kurulur.

## API
- `GET /api/videos` — boş liste döner

Bu yapı, kullanıcıların siteye videoyu doğrudan eklemesini engeller ve yalnızca boş, hazır arayüz sunar.
