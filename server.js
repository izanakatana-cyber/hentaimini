const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const UPLOADS = path.join(ROOT, "uploads");
const DATA = path.join(ROOT, "videos.json");

for (const dir of [UPLOADS, PUBLIC]) {
  fs.mkdirSync(dir, { recursive: true });
}
if (!fs.existsSync(DATA)) {
  fs.writeFileSync(DATA, "[]", "utf8");
}

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(UPLOADS, {
  setHeaders: (res, filePath) => {
    if (/\.(mp4|webm|ogg|mov|mkv)$/i.test(filePath)) {
      res.setHeader("Accept-Ranges", "bytes");
    }
  }
}));
app.use(express.static(PUBLIC));

const allowedExt = [".mp4", ".webm", ".ogg", ".mov", ".mkv", ".avi"];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".mp4";
    const safeExt = allowedExt.includes(ext) ? ext : ".mp4";
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${safeExt}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith("video/")) {
      return cb(null, true);
    }
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExt.includes(ext)) {
      return cb(null, true);
    }
    cb(new Error("Desteklenmeyen video formatı. MP4, WebM, OGG, MOV, MKV kullan."));
  }
});

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

app.get("/api/videos", (_req, res) => {
  const list = readVideos().sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
  res.json(list);
});

app.post("/api/upload", (req, res) => {
  upload.single("video")(req, res, (err) => {
    if (err) {
      console.error("Upload error:", err.message);
      return res.status(400).json({ error: err.message || "Yükleme başarısız." });
    }
    if (!req.file) {
      return res.status(400).json({
        error: "Video dosyası gerekli. Form-data ile 'video' alanı gönder."
      });
    }

    try {
      const title =
        String(req.body.title || path.parse(req.file.originalname).name)
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

      const item = {
        id: crypto.randomUUID(),
        title,
        description,
        category,
        tags,
        filename: req.file.filename,
        url: `/uploads/${encodeURIComponent(req.file.filename)}`,
        originalName: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype || "video/mp4",
        createdAt: new Date().toISOString()
      };

      const videos = readVideos();
      videos.push(item);
      writeVideos(videos);

      console.log(`Video yüklendi: ${item.title} (${item.filename})`);
      res.status(201).json(item);
    } catch (e) {
      console.error(e);
      try {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      } catch {}
      res.status(500).json({ error: "Video kaydedilemedi: " + e.message });
    }
  });
});

app.delete("/api/videos/:id", (req, res) => {
  const videos = readVideos();
  const item = videos.find((v) => v.id === req.params.id);
  if (!item) {
    return res.status(404).json({ error: "Video bulunamadı." });
  }

  const file = path.join(UPLOADS, item.filename);
  if (fs.existsSync(file)) {
    try {
      fs.unlinkSync(file);
    } catch (e) {
      console.error("Dosya silinemedi:", e.message);
    }
  }
  writeVideos(videos.filter((v) => v.id !== req.params.id));
  res.json({ ok: true });
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    videos: readVideos().length,
    uploadsDir: UPLOADS
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
  console.log(`HentaiMini çalışıyor: http://localhost:${PORT}`);
  console.log(`Uploads: ${UPLOADS}`);
  console.log(`Data: ${DATA}`);
});
