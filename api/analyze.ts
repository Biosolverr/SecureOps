import type { VercelRequest, VercelResponse } from "@vercel/node";
import { analyzeVault, VaultState } from "../src/ai-agent";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const state = req.body as Partial<VaultState>;
  if (!state.address || !state.currentState) {
    return res.status(400).json({ error: "Missing required vault state fields" });
  }

  try {
    const result = await analyzeVault(state as VaultState);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: "Analysis failed", details: err.message });
  }
}
