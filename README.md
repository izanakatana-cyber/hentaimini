# HentaiMini

Basit, kayıtsız video yükleme altyapısı.

## Gerekenler
- Node.js 18+

## Kurulum
1. Bu klasörde terminal aç.
2. `npm install`
3. `npm start`
4. Tarayıcıdan `http://localhost:3000` adresini aç.

## Video yükleme
Frontend'in mevcut "Video Yükle" butonu `/api/upload` endpoint'ine gönderim yapacak şekilde kullanılabilir.

API:
- `GET /api/videos` — videoları listeler
- `POST /api/upload` — `video`, `title`, `description`, `category`, `tags` alanlarını alır
- `DELETE /api/videos/:id` — videoyu ve kaydını siler

Videolar `uploads/`, metadata `videos.json` içinde tutulur.

## Önemli
Bu başlangıç sürümünde kimlik doğrulama, moderasyon, rate limit, CDN/object storage ve HTTPS yoktur. İnternete açık production sunucusuna koymadan önce bunları eklemek gerekir.
