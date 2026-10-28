import json
import os
import time
import subprocess
import re
import sys

# Opsiyonel kütüphaneler (yoksa otomatik çekme devre dışı kalır)
try:
    import requests
    from bs4 import BeautifulSoup
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

# videos.js dosyasının konumu (script ile aynı klasörde olmalı)
FILE_PATH = "videos.js"


# ---------------------------------------------------------------------------
# YARDIMCI FONKSİYONLAR
# ---------------------------------------------------------------------------

def read_videos():
    """Mevcut videos.js dosyasını okur ve içindeki videoları listeye çevirir."""
    if not os.path.exists(FILE_PATH):
        return []

    with open(FILE_PATH, 'r', encoding='utf-8') as f:
        content = f.read()
        # JavaScript dosyasının içindeki JSON dizisini bulur
        match = re.search(r'window\.STATIC_VIDEOS\s*=\s*(\[.*\]);?', content, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except Exception as e:
                print(f"❌ Veri okuma hatası: {e}")
                return []
        return []


def write_videos(videos):
    """Güncellenmiş video listesini tekrar videos.js dosyasına yazar."""
    with open(FILE_PATH, 'w', encoding='utf-8') as f:
        # ensure_ascii=False ile Türkçe karakterlerin bozulmasını engelliyoruz
        json_str = json.dumps(videos, indent=2, ensure_ascii=False)
        f.write(f"window.STATIC_VIDEOS = {json_str};\n")


def extract_embed_src(raw_input):
    """
    Kullanıcı ister direkt link, ister <iframe ...> kodu yapıştırsın,
    her iki durumda da geçerli embed URL'sini döndürür.
    """
    if not raw_input:
        return ""

    # Eğer iframe kodu yapıştırıldıysa içinden sadece linki (src) alalım
    if "<iframe" in raw_input.lower():
        match = re.search(r'src=["\']([^"\']+)["\']', raw_input, re.IGNORECASE)
        if match:
            return match.group(1).strip()

    return raw_input.strip()


def fetch_voe_metadata(voe_url, timeout=15):
    """
    VOE.sx sayfasından og:title ve og:image meta etiketlerini çeker.

    Dönen değer: (title, thumbnail) — bulunamayan alanlar None olur.
    """
    if not HAS_REQUESTS:
        print("⚠️ 'requests' veya 'beautifulsoup4' kurulu değil. "
              "Otomatik çekme devre dışı. (pip install requests beautifulsoup4)")
        return None, None

    if not voe_url:
        return None, None

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }

    try:
        response = requests.get(voe_url, headers=headers, timeout=timeout)
        response.raise_for_status()
    except requests.RequestException as e:
        print(f"⚠️ VOE sayfasına erişilemedi: {e}")
        return None, None

    soup = BeautifulSoup(response.text, "html.parser")

    def _meta_content(property_name):
        """Hem property= hem de name= özniteliğiyle meta etiketi arar."""
        tag = soup.find("meta", attrs={"property": property_name})
        if not tag:
            tag = soup.find("meta", attrs={"name": property_name})
        if tag and tag.get("content"):
            return tag["content"].strip()
        return None

    title = _meta_content("og:title") or _meta_content("twitter:title")
    thumbnail = _meta_content("og:image") or _meta_content("twitter:image")

    # Hiçbiri yoksa <title> etiketine düş
    if not title and soup.title and soup.title.string:
        title = soup.title.string.strip()

    return title, thumbnail


def prompt_with_default(label, default_value):
    """
    Varsayılan değeri köşeli parantez içinde gösteren input.
    Kullanıcı boş bırakırsa varsayılanı döndürür.
    """
    if default_value:
        user_input = input(f"{label} [{default_value}]: ").strip()
        return user_input if user_input else default_value
    return input(f"{label}: ").strip()


# ---------------------------------------------------------------------------
# ANA PROGRAM
# ---------------------------------------------------------------------------

def main():
    print("=" * 50)
    print("🚀 HentaiMini Terminal Yükleyiciye Hoş Geldiniz!")
    print("=" * 50)

    # 1) VOE linkini al
    raw_url = input("🔗 VOE.sx Linki veya Embed Kodu: ").strip()
    if not raw_url:
        print("❌ Hata: Link alanı zorunludur!")
        return

    embed_src = extract_embed_src(raw_url)
    if not embed_src:
        print("❌ Hata: Geçerli bir embed URL'si bulunamadı!")
        return

    # 2) VOE sayfasından otomatik başlık + kapak fotoğrafı çek
    print("\n🔍 VOE sayfasından bilgiler alınıyor, lütfen bekleyin...")
    auto_title, auto_thumbnail = fetch_voe_metadata(embed_src)

    if auto_title or auto_thumbnail:
        print("✅ Otomatik bilgiler alındı! (Değiştirmek için yeni değer gir, "
              "boş bırakırsan otomatik değer kullanılır.)")
    else:
        print("ℹ️ Otomatik bilgi alınamadı. Lütfen alanları manuel doldurun.")

    # 3) Başlık
    title = prompt_with_default("🎥 Video Başlığı", auto_title)
    if not title:
        print("❌ Hata: Başlık alanı zorunludur!")
        return

    # 4) Bölüm / Kalite
    episode = input("🎬 Bölüm / Kalite (Örn: 1. Bölüm veya HD): ").strip()
    if not episode:
        episode = "HD"

    # 5) Kapak fotoğrafı
    thumbnail = prompt_with_default("🖼️ Kapak Fotoğrafı URL'si", auto_thumbnail)

    # 6) Yeni video kaydını oluştur
    new_video = {
        "id": f"video-{int(time.time())}",
        "title": title,
        "category": "Genel",
        "type": "embed",
        "embedSrc": embed_src,
        "url": embed_src,
        "thumbnail": thumbnail,
        "preview": thumbnail,
        "episode": episode,
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    # 7) Mevcut videoları al, yenisini EN BAŞA ekle, tekrar kaydet
    videos = read_videos()
    videos.insert(0, new_video)
    write_videos(videos)

    print(f"\n✅ '{title}' başarıyla videos.js dosyasına kaydedildi!")

    # 8) Otomatik Canlı Siteye Gönderme (GitHub Push)
    print("-" * 50)
    push_choice = input("🌐 Değişiklikler canlı siteye (GitHub) gönderilsin mi? (e/h): ").strip().lower()

    if push_choice == 'e':
        print("\n🚀 GitHub'a gönderiliyor, lütfen bekleyin...")
        try:
            subprocess.run(["git", "add", FILE_PATH], check=True)
            subprocess.run(["git", "commit", "-m", f"Yeni bölüm eklendi: {title}"], check=True)
            subprocess.run(["git", "push", "origin", "main"], check=True)
            print("\n🎉 TEBRİKLER! Video canlı sitenizde anında yayınlandı!")
        except subprocess.CalledProcessError:
            print("\n❌ GitHub'a gönderilirken bir hata oluştu. "
                  "Terminalden manuel 'git push' yapmayı deneyin.")
    else:
        print("\n📁 Değişiklikler sadece bilgisayarınızda saklandı. Canlı siteye gitmedi.")


if __name__ == "__main__":
    main()