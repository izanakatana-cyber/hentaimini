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

for (const dir of [UPLOADS, PUBLIC]) fs.mkdirSync(dir, { recursive: true });
if (!fs.existsSync(DATA)) fs.writeFileSync(DATA, "[]", "utf8");

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(UPLOADS));
app.use(express.static(PUBLIC));

const allowed = new Set([
  "video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-matroska"
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".mp4";
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!allowed.has(file.mimetype)) return cb(new Error("Desteklenmeyen video formatı."));
    cb(null, true);
  }
});

function readVideos() {
  try { return JSON.parse(fs.readFileSync(DATA, "utf8")); }
  catch { return []; }
}
function writeVideos(videos) {
  fs.writeFileSync(DATA, JSON.stringify(videos, null, 2), "utf8");
}

app.get("/api/videos", (_req, res) => {
  res.json(readVideos().sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

app.post("/api/upload", upload.single("video"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Video dosyası gerekli." });

  const title = String(req.body.title || path.parse(req.file.originalname).name).trim().slice(0, 160);
  const description = String(req.body.description || "").trim().slice(0, 3000);
  const category = String(req.body.category || "all").trim().slice(0, 60);
  const tags = String(req.body.tags || "").split(",").map(x => x.trim()).filter(Boolean).slice(0, 20);

  const item = {
    id: crypto.randomUUID(),
    title: title || "Yeni video",
    description,
    category,
    tags,
    filename: req.file.filename,
    url: `/uploads/${encodeURIComponent(req.file.filename)}`,
    originalName: req.file.originalname,
    size: req.file.size,
    mimeType: req.file.mimetype,
    createdAt: new Date().toISOString()
  };

  const videos = readVideos();
  videos.push(item);
  writeVideos(videos);
  res.status(201).json(item);
});

app.delete("/api/videos/:id", (req, res) => {
  const videos = readVideos();
  const item = videos.find(v => v.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Video bulunamadı." });

  const file = path.join(UPLOADS, item.filename);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  writeVideos(videos.filter(v => v.id !== req.params.id));
  res.json({ ok: true });
});

app.get("*", (_req, res) => res.sendFile(path.join(PUBLIC, "index.html")));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(400).json({ error: err.message || "İstek başarısız." });
});

app.listen(PORT, () => {
  console.log(`HentaiMini çalışıyor: http://localhost:${PORT}`);
});
