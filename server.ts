import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import { analyzeVault, chatWithAgent, VaultState } from "./src/ai-agent";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  app.use(express.json({ limit: "1mb" }));

  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "CubHunter Audit API" });
  });

  app.post("/api/analyze", async (req, res) => {
    try {
      const vaultState: VaultState = req.body;
      if (!vaultState.address || !vaultState.currentState) {
        res.status(400).json({ error: "Missing vault state fields" });
        return;
      }
      const result = await analyzeVault(vaultState);
      res.json(JSON.parse(result));
    } catch (err: any) {
      console.error("Analyze error:", err.message);
      res.status(500).json({ error: "AI analysis failed", details: err.message });
    }
  });

  app.post("/api/chat", async (req, res) => {
    try {
      const { message, history } = req.body;
      if (!message) {
        res.status(400).json({ error: "Missing message" });
        return;
      }
      const reply = await chatWithAgent(message, history || []);
      res.json({ reply });
    } catch (err: any) {
      console.error("Chat error:", err.message);
      res.status(500).json({ error: "AI chat failed", details: err.message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath, { index: false }));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const HOST = process.env.NODE_ENV === "production" ? "127.0.0.1" : "0.0.0.0";
  app.listen(PORT, HOST, () => {
    console.log(`CubHunter server running on http://${HOST}:${PORT}`);
  });
}

startServer();
