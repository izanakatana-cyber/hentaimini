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

app.use(express.json({ limit: "5mb" }));
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
  fs.writeFileSync(
    DATA,
    JSON.stringify(videos, null, 2),
    "utf8"
  );
}


function sanitizeEmbedSrc(raw) {
  let src = String(raw || "").trim();

  if (!src) return null;

  if (src.startsWith("//")) {
    src = "https:" + src;
  }

  if (!/^https?:\/\//i.test(src)) {
    return null;
  }

  if (src.length > 2000) {
    return null;
  }

  return src;
}


// Videoları getir
app.get("/api/videos", (req, res) => {

  const videos = readVideos().sort(
    (a,b)=> new Date(b.createdAt) - new Date(a.createdAt)
  );

  res.json(videos);

});


// Video ekleme
app.post("/api/upload", (req,res)=>{

  try {

    const title =
      String(req.body.title || "Yeni video")
      .trim()
      .slice(0,160);


    const description =
      String(req.body.description || "")
      .trim()
      .slice(0,3000);


    let category =
      String(req.body.category || "Yeni")
      .trim()
      .slice(0,60);


    if(!category){
      category="Yeni";
    }


    const tags =
      String(req.body.tags || "")
      .split(",")
      .map(x=>x.trim())
      .filter(Boolean)
      .slice(0,20);



    const embedSrc =
      sanitizeEmbedSrc(
        req.body.embedSrc || req.body.url
      );


    if(!embedSrc){

      return res.status(400).json({
        error:"Geçerli embed URL gerekli."
      });

    }



    const embedCode =
      String(req.body.embedCode || "")
      .trim()
      .slice(0,4000);



    // Yeni eklenen alanlar
    const thumbnail =
      String(req.body.thumbnail || "")
      .trim()
      .slice(0,1000);


    const preview =
      String(req.body.preview || "")
      .trim()
      .slice(0,1000);



    const item={

      id:crypto.randomUUID(),

      title,

      description,

      category,

      tags,

      type:"embed",

      embedSrc,

      url:embedSrc,

      embedCode:embedCode || null,


      // Video kartı için kapak
      thumbnail: thumbnail || null,


      // Mouse üzerine gelince oynatılacak önizleme
      preview: preview || null,


      duration:
        req.body.duration || "Embed",


      rating:
        req.body.rating || "Yeni",


      createdAt:
        new Date().toISOString()

    };



    const videos=readVideos();

    videos.push(item);

    writeVideos(videos);



    console.log(
      "Video eklendi:",
      item.title
    );


    res.status(201).json(item);



  }catch(err){

    console.error(err);

    res.status(500).json({
      error:"Video kaydedilemedi."
    });

  }

});



// Video silme
app.delete("/api/videos/:id",(req,res)=>{


  const videos=readVideos();


  const exists=
    videos.find(v=>v.id===req.params.id);



  if(!exists){

    return res.status(404).json({
      error:"Video bulunamadı."
    });

  }


  const filtered =
    videos.filter(
      v=>v.id!==req.params.id
    );


  writeVideos(filtered);


  res.json({
    ok:true
  });


});



// Sağlık kontrolü
app.get("/api/health",(req,res)=>{

  res.json({

    ok:true,

    videos:readVideos().length,

    mode:"embed-only"

  });

});



// Ana sayfa
app.get("*",(req,res)=>{

  res.sendFile(
    path.join(
      PUBLIC,
      "index.html"
    )
  );

});



app.use((err,req,res,next)=>{

  console.error(
    "Error:",
    err.message
  );


  res.status(400).json({
    error:err.message
  });

});



app.listen(
  PORT,
  "0.0.0.0",
  ()=>{

    console.log(
      `Server çalışıyor: http://localhost:${PORT}`
    );

  }
);