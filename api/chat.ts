import type { VercelRequest, VercelResponse } from "@vercel/node";
import { chatWithAgent, ChatMessage } from "../src/ai-agent";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { message, history } = req.body as { message: string; history?: ChatMessage[] };
  if (!message) return res.status(400).json({ error: "Missing message" });

  try {
    const reply = await chatWithAgent(message, history ?? []);
    return res.json({ reply });
  } catch (err: any) {
    return res.status(500).json({ error: "Chat failed", details: err.message });
  }
}
