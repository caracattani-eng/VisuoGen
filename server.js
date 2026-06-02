const express = require("express");
const multer = require("multer");
const fetch = require("node-fetch");
const FormData = require("form-data");
const cors = require("cors");
const path = require("path");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ── Health check ──
app.get("/health", (req, res) => res.json({ status: "Pixora server running!" }));

// ── Generate image from text ──
app.post("/api/generate", async (req, res) => {
  try {
    const { prompt, size, quality, openaiKey } = req.body;
    if (!openaiKey) return res.status(400).json({ error: { message: "No OpenAI key provided" } });
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt,
        n: 1,
        size: size || "1024x1024",
        quality: quality || "auto",
      }),
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Generate error:", err.message);
    res.status(500).json({ error: { message: err.message } });
  }
});

// ── Image to image with OpenAI ──
app.post("/api/edit", upload.single("image"), async (req, res) => {
  try {
    const { prompt, size, openaiKey } = req.body;
    if (!req.file) return res.status(400).json({ error: { message: "No image uploaded" } });
    if (!openaiKey) return res.status(400).json({ error: { message: "No OpenAI key provided" } });
    
    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("prompt", prompt);
    form.append("n", "1");
    form.append("size", size || "1024x1024");
    form.append("image[]", req.file.buffer, {
      filename: "product.png",
      contentType: "image/png",
    });
    const response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        ...form.getHeaders(),
      },
      body: form,
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Edit error:", err.message);
    res.status(500).json({ error: { message: err.message } });
  }
});

// ── Stability AI image to image ──
app.post("/api/stability", upload.single("image"), async (req, res) => {
  try {
    const { prompt, stabilityKey, strength } = req.body;

    if (!req.file) return res.status(400).json({ error: { message: "No image uploaded" } });
    if (!stabilityKey) return res.status(400).json({ error: { message: "No Stability key provided" } });

    console.log("Stability request received, image size:", req.file.size);

    const form = new FormData();
    form.append("init_image", req.file.buffer, {
      filename: "product.png",
      contentType: "image/png",
    });
    form.append("init_image_mode", "IMAGE_STRENGTH");
    form.append("image_strength", strength || "0.35");
    form.append("text_prompts[0][text]", prompt);
    form.append("text_prompts[0][weight]", "1");
    form.append("text_prompts[1][text]", "blurry, bad quality, distorted product, changed product appearance, altered labels");
    form.append("text_prompts[1][weight]", "-1");
    form.append("cfg_scale", "7");
    form.append("samples", "1");
    form.append("steps", "30");

    const response = await fetch(
      "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/image-to-image",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${stabilityKey}`,
          "Accept": "application/json",
          ...form.getHeaders(),
        },
        body: form,
      }
    );

    const data = await response.json();
    console.log("Stability response status:", response.status);

    if (data.artifacts && data.artifacts[0]) {
      res.json({ imageData: "data:image/png;base64," + data.artifacts[0].base64 });
    } else {
      console.error("Stability error:", JSON.stringify(data));
      res.status(500).json({ error: data });
    }
  } catch (err) {
    console.error("Stability error:", err.message);
    res.status(500).json({ error: { message: err.message } });
  }
});

// ── Serve frontend ──
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Pixora running on port ${PORT}`));
