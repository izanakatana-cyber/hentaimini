const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const DEFAULT_PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const FEEDBACK_FILE = path.join(DATA_DIR, "feedback.json");

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
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(FEEDBACK_FILE)) fs.writeFileSync(FEEDBACK_FILE, "[]", "utf8");

app.use(express.json({ limit: "32kb" }));

app.use((req, res, next) => {
  if (req.path === "/videos.js") {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  }
  next();
});

app.use(express.static(PUBLIC));

app.get("/api/videos", (req, res) => {
  res.json([]);
});

app.post("/api/feedback", (req, res) => {
  const { type, message, contact } = req.body || {};
  const allowedTypes = new Set(["suggestion", "bug", "other"]);
  const cleanMessage = typeof message === "string" ? message.trim() : "";
  const cleanContact = typeof contact === "string" ? contact.trim().slice(0, 160) : "";

  if (!allowedTypes.has(type) || cleanMessage.length < 3) {
    return res.status(400).json({ error: "Bildirim türü ve en az 3 karakterlik bir mesaj gerekli." });
  }

  try {
    const feedback = JSON.parse(fs.readFileSync(FEEDBACK_FILE, "utf8"));
    feedback.push({
      id: `feedback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      message: cleanMessage.slice(0, 3000),
      contact: cleanContact,
      createdAt: new Date().toISOString()
    });
    fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(feedback, null, 2), "utf8");
    res.status(201).json({ ok: true });
  } catch (error) {
    console.error("Bildirim kaydetme hatası:", error);
    res.status(500).json({ error: "Bildirim kaydedilemedi." });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(PUBLIC, "index.html"));
});

startServer(DEFAULT_PORT);