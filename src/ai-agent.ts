import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const VAULT_SYSTEM_PROMPT = `You are CubHunter AI Agent — an expert smart contract security auditor and vault operations advisor.

You analyze on-chain vault data and provide actionable security recommendations.

RESPONSE FORMAT (always JSON):
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

export async function analyzeVault(state: VaultState): Promise<string> {
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

Current block time is approximately now. Evaluate:
1. Is the vault in a safe state?
2. Are there any immediate risks?
3. What should the owner do next?
4. Gas optimization suggestions`;

  const response = await groq.chat.completions.create({
    messages: [
      { role: "system", content: VAULT_SYSTEM_PROMPT },
      { role: "user", content: prompt }
    ],
    model: "llama-3.3-70b-versatile",
    temperature: 0.3,
    max_tokens: 1024,
    response_format: { type: "json_object" }
  });

  return response.choices[0]?.message?.content || '{"status":"error","summary":"No response from AI"}';
}

export async function chatWithAgent(message: string, history: { role: string; content: string }[] = []): Promise<string> {
  const messages = [
    { role: "system" as const, content: VAULT_SYSTEM_PROMPT },
    ...history.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user" as const, content: message }
  ];

  const response = await groq.chat.completions.create({
    messages,
    model: "llama-3.3-70b-versatile",
    temperature: 0.5,
    max_tokens: 2048
  });

  return response.choices[0]?.message?.content || "No response from agent.";
}
