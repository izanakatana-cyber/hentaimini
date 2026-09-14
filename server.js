const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const DATA = path.join(ROOT, "videos.json");

fs.mkdirSync(PUBLIC, { recursive: true });

if (!fs.existsSync(DATA)) {
  fs.writeFileSync(DATA, "[]", "utf8");
}

app.use(express.json({ limit: "10mb" }));
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

function sanitizeEmbedSrc(raw) {
  let src = String(raw || "").trim();
  if (!src) return null;
  if (src.startsWith("//")) src = "https:" + src;
  if (!/^https?:\/\//i.test(src)) return null;
  if (src.length > 2000) return null;
  return src;
}

app.get("/api/videos", (req, res) => {
  const videos = readVideos().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(videos);
});

app.post("/api/upload", (req, res) => {
  try {
    const title = String(req.body.title || "Yeni Video").trim().slice(0, 160);
    const category = String(req.body.category || "Yeni").trim().slice(0, 60);
    const embedSrc = sanitizeEmbedSrc(req.body.embedSrc || req.body.url);
    
    if (!embedSrc) {
      return res.status(400).json({ error: "Geçerli video kaynağı veya embed URL gerekli." });
    }

    const thumbnail = String(req.body.thumbnail || "").trim().slice(0, 1500);
    const preview = String(req.body.preview || "").trim().slice(0, 1500);
    const embedCode = String(req.body.embedCode || "").trim().slice(0, 4000);

    const item = {
      id: crypto.randomUUID(),
      title,
      category,
      type: "embed",
      embedSrc,
      url: embedSrc,
      embedCode: embedCode || null,
      thumbnail: thumbnail || null,
      preview: preview || null,
      duration: req.body.duration || "HD",
      rating: req.body.rating || "4.8",
      createdAt: new Date().toISOString()
    };

    const videos = readVideos();
    videos.push(item);
    writeVideos(videos);

    res.status(201).json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Video kaydedilemedi." });
  }
});

app.delete("/api/videos/:id", (req, res) => {
  const videos = readVideos();
  const exists = videos.find(v => v.id === req.params.id);
  if (!exists) {
    return res.status(404).json({ error: "Video bulunamadı." });
  }
  const filtered = videos.filter(v => v.id !== req.params.id);
  writeVideos(filtered);
  res.json({ ok: true });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(PUBLIC, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`HentaiMini server running at http://localhost:${PORT}`);
});