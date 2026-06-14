import type { VercelRequest, VercelResponse } from "@vercel/node";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `You are CubHunter AI — expert smart contract security auditor.
Analyze vault data and return JSON:
{
  "status": "ok" | "warning" | "critical",
  "summary": "one-line assessment",
  "analysis": { "state": "...", "risks": [...], "recommendations": [...] }
}
Be concise. Focus on security.`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { address, currentState, owner, guardian, counterparty, balance, lockDuration, lockTimestamp, quarantineEndTime } = req.body;

    const prompt = `Analyze this vault:
Address: ${address}
State: ${currentState}
Owner: ${owner}
Guardian: ${guardian}
Counterparty: ${counterparty}
Balance: ${balance} ETH
Lock Duration: ${lockDuration}s
Lock Timestamp: ${lockTimestamp}
Quarantine End: ${quarantineEndTime}
Evaluate safety, risks, and next actions.`;

    const response = await groq.chat.completions.create({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.3,
      max_tokens: 1024,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0]?.message?.content || "{}";
    res.json(JSON.parse(content));
  } catch (err: any) {
    res.status(500).json({ error: "Analysis failed", details: err.message });
  }
}
