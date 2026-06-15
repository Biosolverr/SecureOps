import Groq from "groq-sdk";

// Single source of truth for the AI agent — used by both server.ts and Vercel api/ functions.

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const AUDIT_SYSTEM_PROMPT = `You are CubHunter AI — expert smart contract security auditor for SecureVault.
Analyze vault data and return ONLY valid JSON (no markdown, no preamble):
{
  "status": "ok" | "warning" | "critical",
  "summary": "one-line assessment",
  "analysis": {
    "state": "description of current vault state",
    "risks": ["risk1", "risk2"],
    "recommendations": ["action1", "action2"],
    "gas_estimate": "estimated gas for next likely operation"
  },
  "actions": [
    { "name": "action_name", "description": "what it does", "priority": "high|medium|low" }
  ]
}
Be concise. Focus on security. Use technical language.`;

const CHAT_SYSTEM_PROMPT = `You are CubHunter AI — expert smart contract security advisor for SecureVault.
Help users understand vault operations, security risks, and best practices.
Be concise and technical. Use bullet points for recommendations.`;

export interface VaultState {
  address: string;
  currentState: string;
  owner: string;
  guardian: string;
  counterparty: string;
  balance: string;
  lockDuration: string;
  lockTimestamp: string;
  refundDelay: string;
  quarantineEndTime: string;
  nonce: string;
  depositedEthAmount: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function analyzeVault(state: VaultState): Promise<object> {
  const prompt = `Analyze this deployed SecureVault and provide security assessment:

Address: ${state.address}
State: ${state.currentState}
Owner: ${state.owner}
Guardian: ${state.guardian}
Counterparty: ${state.counterparty}
Balance: ${state.balance} ETH
Lock Duration: ${state.lockDuration}s
Lock Timestamp: ${state.lockTimestamp}
Refund Delay: ${state.refundDelay}s
Quarantine End: ${state.quarantineEndTime}
Nonce: ${state.nonce}
Deposited Amount: ${state.depositedEthAmount} ETH

Evaluate:
1. Is the vault in a safe state?
2. Are there any immediate risks?
3. What should the owner do next?
4. Gas optimization suggestions`;

  const response = await groq.chat.completions.create({
    messages: [
      { role: "system", content: AUDIT_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    model: "llama-3.3-70b-versatile",
    temperature: 0.3,
    max_tokens: 1024,
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  return JSON.parse(raw);
}

export async function chatWithAgent(
  message: string,
  history: ChatMessage[] = []
): Promise<string> {
  const messages = [
    { role: "system" as const, content: CHAT_SYSTEM_PROMPT },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: message },
  ];

  const response = await groq.chat.completions.create({
    messages,
    model: "llama-3.3-70b-versatile",
    temperature: 0.5,
    max_tokens: 2048,
  });

  return response.choices[0]?.message?.content ?? "No response from agent.";
}
