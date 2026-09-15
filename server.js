const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mongoose = require("mongoose");
const os = require("os");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const app = express();

const DEFAULT_PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const DATA = path.join(ROOT, "videos.json");

function startServer(port) {
  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`HentaiMini server running at http://localhost:${port}`);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      const nextPort = port + 1;
      console.warn(`Port ${port} kullanımda, ${nextPort} portuna geçiliyor...`);
      startServer(nextPort);
      return;
    }

    console.error("Sunucu başlatma hatası:", err);
    process.exit(1);
  });
}

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
let mongoReady = Promise.resolve();

let VideoModel = null;
if (MONGO_URI) {
  mongoReady = mongoose.connect(MONGO_URI)
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
    await mongoReady;
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

app.post("/api/extract-thumbnail", async (req, res) => {
  try {
    const embedCode = String(req.body.embedCode || "").trim();
    const iframeMatch = embedCode.match(/<iframe\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i);
    const sourceUrl = iframeMatch ? iframeMatch[1] : embedCode;

    if (!/^https?:\/\//i.test(sourceUrl)) {
      return res.status(400).json({ error: "Geçerli bir embed sayfası gerekli." });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(sourceUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "HentaiMini thumbnail resolver" }
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(502).json({ error: "Embed sayfasına erişilemedi." });
    }

    const html = (await response.text()).slice(0, 2000000);
    const pageUrl = new URL(sourceUrl);
    const candidates = [];
    const mediaCandidates = [];
    const addCandidate = (value) => {
      if (!value) return;
      try {
        const absoluteUrl = new URL(value.replace(/&amp;/g, "&"), pageUrl).href;
        if (/^https?:\/\//i.test(absoluteUrl) && !candidates.includes(absoluteUrl)) {
          candidates.push(absoluteUrl);
        }
      } catch {}
    };
    const addMediaCandidate = (value) => {
      if (!value || /^data:/i.test(value)) return;
      try {
        const absoluteUrl = new URL(value.replace(/\\u0026/g, "&").replace(/&amp;/g, "&"), pageUrl).href;
        if (/^https?:\/\//i.test(absoluteUrl) && !mediaCandidates.includes(absoluteUrl)) {
          mediaCandidates.push(absoluteUrl);
        }
      } catch {}
    };

    const posterRegex = /\bposter=["']([^"']+)["']/gi;
    let match;
    while ((match = posterRegex.exec(html))) addCandidate(match[1]);

    const metaRegex = /<meta\b[^>]*>/gi;
    while ((match = metaRegex.exec(html))) {
      const tag = match[0];
      const isImageMeta = /(?:property|name)\s*=\s*["'](?:og:image|twitter:image)["']/i.test(tag);
      const contentMatch = tag.match(/\bcontent\s*=\s*["']([^"']+)["']/i);
      if (isImageMeta && contentMatch) addCandidate(contentMatch[1]);
    }

    const mediaRegex = /(?:file|source|videoUrl|video_url|contentUrl|content_url)\s*["']?\s*[:=]\s*["']([^"']+)["']/gi;
    while ((match = mediaRegex.exec(html))) addMediaCandidate(match[1]);

    if (candidates.length === 0) {
      const videoMatch = html.match(/<(?:video|source)\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i);
      if (videoMatch) addMediaCandidate(videoMatch[1]);

      for (const videoUrl of mediaCandidates) {
        const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "hentaimini-"));
        const outputPath = path.join(tempDir, "thumbnail.jpg");
        try {
          await execFileAsync("ffmpeg", [
            "-y", "-ss", "1", "-i", videoUrl,
            "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "3", outputPath
          ], { timeout: 20000, maxBuffer: 1024 * 1024 });
          const image = await fs.promises.readFile(outputPath);
          candidates.push(`data:image/jpeg;base64,${image.toString("base64")}`);
          break;
        } catch {
          // Try the next media URL when the player exposes multiple sources.
        } finally {
          await fs.promises.rm(tempDir, { recursive: true, force: true });
        }
      }
    }

    res.json({ thumbnails: candidates.slice(0, 3) });
  } catch (err) {
    res.status(502).json({ error: "Embed sayfasından kapak alınamadı." });
  }
});

app.post("/api/upload", async (req, res) => {
  try {
    await mongoReady;
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
      thumbnail: String(req.body.thumbnail || "").trim().slice(0, 5000000) || null,
      preview: String(req.body.preview || "").trim().slice(0, 5000000) || null,
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
    await mongoReady;
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

startServer(DEFAULT_PORT);