import json
import os
import time
import subprocess
import re
import sys
import shutil
import datetime

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
# YARDIMCI FONKSİYONLAR (ZIRHLI SÜRÜM)
# ---------------------------------------------------------------------------

def read_videos():
    """
    Mevcut videos.js dosyasını okur. 
    Eğer dosya okunamazsa veya format bozuksa HATA FIRLATIR (veri kaybını önler).
    """
    if not os.path.exists(FILE_PATH):
        return []

    with open(FILE_PATH, 'r', encoding='utf-8') as f:
        content = f.read().strip()
        
        if not content:
            return []

        # Daha esnek bir regex (boşluklara ve sondaki noktalı virgüllere toleranslı)
        match = re.search(r'window\.STATIC_VIDEOS\s*=\s*(\[.*\])\s*;?', content, re.DOTALL)
        
        if not match:
            # Regex eşleşmezse SESSİZCE BOŞ DÖNME, HATA FIRLAT!
            raise ValueError(
                f"❌ KRİTİK HATA: videos.js formatı beklenmedik!\n"
                f"Veri kaybını önlemek için işlem İPTAL edildi.\n"
                f"Dosya boyutu: {len(content)} bayt."
            )
            
        try:
            data = json.loads(match.group(1))
            if not isinstance(data, list):
                raise ValueError("Okunan veri bir liste (dizi) değil!")
            return data
        except Exception as e:
            raise ValueError(f"❌ videos.js JSON okuma hatası: {e}")

def write_videos(videos):
    """
    Güncellenmiş listeyi dosyaya yazar. 
    Yazmadan önce otomatik olarak yedek (.bak) alır.
    """
    # Yazma işleminden önce mevcut dosyayı yedekle
    if os.path.exists(FILE_PATH):
        ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = f"{FILE_PATH}.{ts}.bak"
        shutil.copy2(FILE_PATH, backup_path)
        print(f"🛡️ Güvenlik Yedeği Alındı: {backup_path}")

    with open(FILE_PATH, 'w', encoding='utf-8') as f:
        json_str = json.dumps(videos, indent=2, ensure_ascii=False)
        f.write(f"window.STATIC_VIDEOS = {json_str};\n")

def extract_embed_src(raw_input):
    """Kullanıcı iframe yapıştırırsa içinden sadece src linkini ayıklar."""
    if not raw_input:
        return ""
    if "<iframe" in raw_input.lower():
        match = re.search(r'src=["\']([^"\']+)["\']', raw_input, re.IGNORECASE)
        if match:
            return match.group(1).strip()
    return raw_input.strip()

def fetch_voe_metadata(voe_url, timeout=15):
    """VOE.sx sayfasından og:title ve og:image meta etiketlerini çeker."""
    if not HAS_REQUESTS:
        print("⚠️ 'requests' veya 'beautifulsoup4' kurulu değil. Otomatik çekme devre dışı.")
        return None, None

    if not voe_url:
        return None, None

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
    }

    try:
        response = requests.get(voe_url, headers=headers, timeout=timeout)
        response.raise_for_status()
    except Exception as e:
        print(f"⚠️ VOE sayfasına erişilemedi: {e}")
        return None, None

    soup = BeautifulSoup(response.text, "html.parser")

    def _meta_content(property_name):
        tag = soup.find("meta", attrs={"property": property_name}) or soup.find("meta", attrs={"name": property_name})
        if tag and tag.get("content"):
            return tag["content"].strip()
        return None

    title = _meta_content("og:title") or _meta_content("twitter:title")
    thumbnail = _meta_content("og:image") or _meta_content("twitter:image")

    # "Redirecting..." hatasını önlemek için kontrol
    if title and "redirecting" in title.lower():
        print("⚠️ VOE sayfası yönlendirme (Redirecting...) döndürdü, başlık alınamadı.")
        title = None

    if not title and soup.title and soup.title.string:
        title = soup.title.string.strip()

    return title, thumbnail

def prompt_with_default(label, default_value):
    if default_value:
        user_input = input(f"{label} [{default_value}]: ").strip()
        return user_input if user_input else default_value
    return input(f"{label}: ").strip()

# ---------------------------------------------------------------------------
# ANA PROGRAM
# ---------------------------------------------------------------------------

def main():
    print("=" * 50)
    print("🚀 HentaiMini ZIRHLI Yükleyiciye Hoş Geldiniz!")
    print("=" * 50)

    raw_url = input("🔗 VOE.sx Linki veya Embed Kodu: ").strip()
    if not raw_url:
        print("❌ Hata: Link alanı zorunludur!")
        return

    embed_src = extract_embed_src(raw_url)
    if not embed_src:
        print("❌ Hata: Geçerli bir embed URL'si bulunamadı!")
        return

    print("\n🔍 VOE sayfasından bilgiler alınıyor, lütfen bekleyin...")
    auto_title, auto_thumbnail = fetch_voe_metadata(embed_src)

    if auto_title or auto_thumbnail:
        print("✅ Otomatik bilgiler alındı! (Değiştirmek için yeni değer gir, boş bırakırsan otomatik değer kullanılır.)")
    else:
        print("ℹ️ Otomatik bilgi alınamadı. Lütfen alanları manuel doldurun.")

    title = prompt_with_default("🎥 Video Başlığı", auto_title)
    if not title:
        print("❌ Hata: Başlık alanı zorunludur!")
        return

    episode = input("🎬 Bölüm / Kalite (Örn: 1. Bölüm veya HD): ").strip()
    if not episode:
        episode = "HD"

    thumbnail = prompt_with_default("🖼️ Kapak Fotoğrafı URL'si", auto_thumbnail)

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

    # ⚠️ EN ÖNEMLİ KISIM: Okuma yaparken hata olursa işlemi durdur (Veri kaybını önler)
    try:
        print("\n⏳ Mevcut videos.js okunuyor...")
        videos = read_videos()
        
        # Ekstra güvenlik: Dosya kocaman ama liste boş döndüyse şüphelen ve durdur
        if len(videos) == 0 and os.path.exists(FILE_PATH) and os.path.getsize(FILE_PATH) > 500:
            raise ValueError("Dosya büyük ama video listesi boş okundu. Güvenlik iptali!")
            
        print(f"✅ Mevcut video sayısı: {len(videos)}")
    except ValueError as e:
        print(e)
        print("\n❌ İŞLEM DURDURULDU. Mevcut videos.js dosyasına ZARAR VERİLMEDİ.")
        sys.exit(1)

    # Yeni videoyu en başa ekle ve kaydet
    videos.insert(0, new_video)
    write_videos(videos)

    print(f"\n✅ '{title}' başarıyla videos.js dosyasına kaydedildi!")

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
            print("\n❌ GitHub'a gönderilirken bir hata oluştu. Manuel 'git push' yapmayı deneyin.")
    else:
        print("\n📁 Değişiklikler sadece bilgisayarınızda saklandı.")

if __name__ == "__main__":
    main()