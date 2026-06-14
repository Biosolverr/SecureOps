import type { VercelRequest, VercelResponse } from "@vercel/node";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `You are CubHunter AI — expert smart contract security advisor for SecureVault.
You help users understand vault operations, security risks, and best practices.
Be concise and technical. Use bullet points for recommendations.`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { message, history } = req.body;
    if (!message) return res.status(400).json({ error: "Missing message" });

    const messages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      ...(history || []).map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user" as const, content: message }
    ];

    const response = await groq.chat.completions.create({
      messages,
      model: "llama-3.3-70b-versatile",
      temperature: 0.5,
      max_tokens: 2048
    });

    res.json({ reply: response.choices[0]?.message?.content || "No response." });
  } catch (err: any) {
    res.status(500).json({ error: "Chat failed", details: err.message });
  }
}
