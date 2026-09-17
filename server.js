const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const DEFAULT_PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");

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

app.get("*", (req, res) => {
  res.sendFile(path.join(PUBLIC, "index.html"));
});

startServer(DEFAULT_PORT);