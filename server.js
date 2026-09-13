const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const DATA = path.join(ROOT, "videos.json");

for (const dir of [PUBLIC]) {
  fs.mkdirSync(dir, { recursive: true });
}
if (!fs.existsSync(DATA)) {
  fs.writeFileSync(DATA, "[]", "utf8");
}

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUBLIC));

function readVideos() {
  try {
    const raw = fs.readFileSync(DATA, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeVideos(videos) {
  fs.writeFileSync(DATA, JSON.stringify(videos, null, 2), "utf8");
}

/** Gömme src'sini temizle ve doğrula */
function sanitizeEmbedSrc(raw) {
  let src = String(raw || "").trim();
  if (!src) return null;
  if (src.startsWith("//")) src = "https:" + src;
  if (!/^https?:\/\//i.test(src)) return null;
  // Çok uzun URL'leri reddet
  if (src.length > 2000) return null;
  return src;
}

app.get("/api/videos", (_req, res) => {
  const list = readVideos().sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
  res.json(list);
});

app.post("/api/upload", (req, res) => {
  try {
    const title =
      String(req.body.title || "Yeni video")
        .trim()
        .slice(0, 160) || "Yeni video";
    const description = String(req.body.description || "").trim().slice(0, 3000);
    let category = String(req.body.category || "Yeni").trim().slice(0, 60);
    if (category === "all" || category === "Tümü" || !category) category = "Yeni";

    const tags = String(req.body.tags || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 20);

    const embedSrc = sanitizeEmbedSrc(req.body.embedSrc || req.body.url);
    if (!embedSrc) {
      return res.status(400).json({
        error: "Geçerli bir gömme URL’si (embedSrc) gerekli. iframe src veya doğrudan https URL gönder."
      });
    }

    // Opsiyonel ham kod (sadece saklanır, oynatmada src kullanılır)
    const embedCode = String(req.body.embedCode || "").trim().slice(0, 4000) || null;

    const item = {
      id: crypto.randomUUID(),
      title,
      description,
      category,
      tags,
      type: "embed",
      embedSrc,
      url: embedSrc,
      embedCode,
      thumbnail: null,
      duration: "Embed",
      rating: "Yeni",
      size: 0,
      mimeType: "embed/iframe",
      createdAt: new Date().toISOString()
    };

    const videos = readVideos();
    videos.push(item);
    writeVideos(videos);

    console.log(`Embed eklendi: ${item.title} → ${item.embedSrc}`);
    res.status(201).json(item);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Video kaydedilemedi: " + e.message });
  }
});

app.delete("/api/videos/:id", (req, res) => {
  const videos = readVideos();
  const item = videos.find((v) => v.id === req.params.id);
  if (!item) {
    return res.status(404).json({ error: "Video bulunamadı." });
  }
  writeVideos(videos.filter((v) => v.id !== req.params.id));
  res.json({ ok: true });
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    videos: readVideos().length,
    mode: "embed-only"
  });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(PUBLIC, "index.html"));
});

app.use((err, _req, res, _next) => {
  console.error("Error:", err.message);
  res.status(400).json({ error: err.message || "İstek başarısız." });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`HentaiMini (embed-only) çalışıyor: http://localhost:${PORT}`);
  console.log(`Data: ${DATA}`);
});
