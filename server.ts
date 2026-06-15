import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import { analyzeVault, chatWithAgent, VaultState, ChatMessage } from "./src/ai-agent";

dotenv.config();

// Simple in-memory rate limiter
const rateLimits = new Map<string, { count: number; resetAt: number }>();
function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimits.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  app.use(express.json({ limit: "1mb" }));

  // Security headers
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
    const ip = req.ip ?? "unknown";
    if (!rateLimit(`analyze:${ip}`, 10, 60_000)) {
      res.status(429).json({ error: "Rate limit exceeded. Try again in a minute." });
      return;
    }

    const state = req.body as Partial<VaultState>;
    if (!state.address || !state.currentState) {
      res.status(400).json({ error: "Missing required vault state fields" });
      return;
    }

    try {
      const result = await analyzeVault(state as VaultState);
      res.json(result);
    } catch (err: any) {
      console.error("Analyze error:", err.message);
      res.status(500).json({ error: "AI analysis failed", details: err.message });
    }
  });

  app.post("/api/chat", async (req, res) => {
    const ip = req.ip ?? "unknown";
    if (!rateLimit(`chat:${ip}`, 20, 60_000)) {
      res.status(429).json({ error: "Rate limit exceeded. Try again in a minute." });
      return;
    }

    const { message, history } = req.body as { message: string; history?: ChatMessage[] };
    if (!message) {
      res.status(400).json({ error: "Missing message" });
      return;
    }

    try {
      const reply = await chatWithAgent(message, history ?? []);
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
