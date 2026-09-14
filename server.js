const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mongoose = require("mongoose");

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

// MongoDB Bağlantısı (Varsa bulut veritabanı kullanılır, yoksa yerel JSON dosyası)
let isMongoConnected = false;
const MONGO_URI = process.env.MONGO_URI;

let VideoModel = null;
if (MONGO_URI) {
  mongoose.connect(MONGO_URI)
    .then(() => {
      isMongoConnected = true;
      console.log("MongoDB veritabanına başarıyla bağlandı. Videolar artık kalıcı!");
    })
    .catch(err => {
      console.error("MongoDB bağlantı hatası, yerel dosya sistemine devam ediliyor:", err.message);
    });

  const videoSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    title: String,
    category: String,
    type: String,
    embedSrc: String,
    url: String,
    embedCode: String,
    thumbnail: String,
    preview: String,
    duration: String,
    rating: String,
    createdAt: { type: Date, default: Date.now }
  });
  VideoModel = mongoose.model("Video", videoSchema);
}

// Yerel JSON okuma/yazma yardımcıları
function readLocalVideos() {
  try {
    const raw = fs.readFileSync(DATA, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeLocalVideos(videos) {
  fs.writeFileSync(DATA, JSON.stringify(videos, null, 2), "utf8");
}

// API Endpoints
app.get("/api/videos", async (req, res) => {
  try {
    if (isMongoConnected && VideoModel) {
      const videos = await VideoModel.find().sort({ createdAt: -1 });
      return res.json(videos);
    }
    const videos = readLocalVideos().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(videos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Videolar yüklenemedi." });
  }
});

app.post("/api/upload", async (req, res) => {
  try {
    const title = String(req.body.title || "Yeni Video").trim().slice(0, 160);
    const category = String(req.body.category || "Yeni").trim().slice(0, 60);
    let embedSrc = String(req.body.embedSrc || req.body.url || "").trim();
    
    if (embedSrc.startsWith("//")) embedSrc = "https:" + embedSrc;
    if (!embedSrc || !/^https?:\/\//i.test(embedSrc)) {
      return res.status(400).json({ error: "Geçerli video kaynağı veya embed URL gerekli." });
    }

    const item = {
      id: crypto.randomUUID(),
      title,
      category,
      type: "embed",
      embedSrc,
      url: embedSrc,
      embedCode: String(req.body.embedCode || "").trim().slice(0, 4000) || null,
      thumbnail: String(req.body.thumbnail || "").trim().slice(0, 1500) || null,
      preview: String(req.body.preview || "").trim().slice(0, 1500) || null,
      duration: req.body.duration || "HD",
      rating: req.body.rating || "4.8",
      createdAt: new Date()
    };

    if (isMongoConnected && VideoModel) {
      const newVideo = new VideoModel(item);
      await newVideo.save();
      return res.status(201).json(newVideo);
    }

    const videos = readLocalVideos();
    videos.push(item);
    writeLocalVideos(videos);

    res.status(201).json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Video kaydedilemedi." });
  }
});

app.delete("/api/videos/:id", async (req, res) => {
  try {
    const videoId = req.params.id;
    if (isMongoConnected && VideoModel) {
      const deleted = await VideoModel.findOneAndDelete({ id: videoId });
      if (!deleted) return res.status(404).json({ error: "Video bulunamadı." });
      return res.json({ ok: true });
    }

    const videos = readLocalVideos();
    const exists = videos.find(v => v.id === videoId);
    if (!exists) {
      return res.status(404).json({ error: "Video bulunamadı." });
    }
    const filtered = videos.filter(v => v.id !== videoId);
    writeLocalVideos(filtered);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Silme işlemi başarısız." });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(PUBLIC, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`HentaiMini server running at http://localhost:${PORT}`);
});