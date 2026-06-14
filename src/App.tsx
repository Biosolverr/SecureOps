/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from "react";
import { 
  ShieldAlert, 
  ShieldCheck, 
  ShieldQuestion, 
  Terminal, 
  Cpu, 
  Search, 
  Code, 
  AlertTriangle, 
  CheckCircle2, 
  Loader2,
  Copy,
  Plus,
  Play,
  RotateCcw,
  Zap,
  Lock,
  Ghost,
  History,
  FileCode,
  Globe
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { GoogleGenAI, Type } from "@google/genai";

// Standard vulnerable contract example
const DEMO_CONTRACT = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract VulnerableBank {
    mapping(address => uint256) public balances;

    function deposit() public payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw() public {
        uint256 amount = balances[msg.sender];
        // VULNERABILITY: External call before state update (Reentrancy)
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
        balances[msg.sender] = 0;
    }

    function emergencyWithdraw() public {
        // VULNERABILITY: No access control
        payable(msg.sender).transfer(address(this).balance);
    }
}`;

export default function App() {
  const [code, setCode] = useState(DEMO_CONTRACT);
  const [isScanning, setIsScanning] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [agentChat, setAgentChat] = useState<{ role: string; content: string }[]>([]);
  const [agentInput, setAgentInput] = useState("");
  const [agentLoading, setAgentLoading] = useState(false);
  const [vaultAddress, setVaultAddress] = useState("");
  const [vaultAnalysis, setVaultAnalysis] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const connectWallet = async () => {
    if (walletAddress) {
      setWalletAddress(null);
      return;
    }
    const eth = (window as any).ethereum;
    if (!eth) {
      alert("MetaMask not found. Install it from metamask.io");
      return;
    }
    setIsConnecting(true);
    try {
      const accounts = await eth.request({ method: "eth_requestAccounts" });
      setWalletAddress(accounts[0]);
    } catch (err) {
      console.error("Wallet connection rejected:", err);
    } finally {
      setIsConnecting(false);
    }
  };

  const shortAddress = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : null;

  const sendAgentMessage = async () => {
    if (!agentInput.trim() || agentLoading) return;
    const userMsg = { role: "user", content: agentInput };
    setAgentChat(prev => [...prev, userMsg]);
    setAgentInput("");
    setAgentLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: agentInput, history: agentChat })
      });
      const data = await res.json();
      setAgentChat(prev => [...prev, { role: "assistant", content: data.reply || "Error" }]);
    } catch {
      setAgentChat(prev => [...prev, { role: "assistant", content: "Failed to reach AI agent." }]);
    } finally {
      setAgentLoading(false);
    }
  };

  const analyzeVaultOnChain = async () => {
    if (!vaultAddress.trim()) return;
    setAnalyzing(true);
    setVaultAnalysis(null);
    try {
      const mockState = {
        address: vaultAddress,
        currentState: "LOCKED",
        owner: walletAddress || "0x0000",
        guardian: "0x0000",
        counterparty: "0x0000",
        balance: "1.0",
        lockDuration: "86400",
        lockTimestamp: String(Math.floor(Date.now() / 1000) - 43200),
        refundDelay: "86400",
        quarantineEndTime: "0",
        nonce: "0",
        depositedEthAmount: "1.0"
      };
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mockState)
      });
      const data = await res.json();
      setVaultAnalysis(data);
    } catch {
      setVaultAnalysis({ status: "error", summary: "Analysis failed" });
    } finally {
      setAnalyzing(false);
    }
  };

  const scan = async () => {
    console.log("Scan initiated...");
    if (!code.trim()) {
      console.log("Abort: Empty code");
      return;
    }

    setIsScanning(true);
    setError(null);
    setResults(null);
    setProgress(0);

    const simulateProgress = setInterval(() => {
      setProgress(prev => Math.min(prev + (100 - prev) * 0.1, 95));
    }, 200);

    try {
      console.log("Attempting to load configuration...");
      const apiKey = typeof process !== 'undefined' && process.env ? process.env.GEMINI_API_KEY : (import.meta as any).env.VITE_GEMINI_API_KEY;
      
      if (!apiKey) {
        console.error("Critical: API Key is undefined");
        throw new Error("GEMINI_API_KEY is missing from environment. Please set it in the Secrets panel.");
      }

      console.log("Config loaded. Initializing Gemini SDK...");
      const ai = new GoogleGenAI({ apiKey });
      
      console.log("Scanning contract code...");
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: code,
        config: {
          systemInstruction: `You are CubHunter, a world-class smart contract security auditor. 
          Analyze the provided Solidity code for vulnerabilities. 
          Return a JSON response with the following structure:
          {
            "score": number (0-100, 100 is safest),
            "riskLevel": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
            "vulnerabilities": [
              {
                "title": string,
                "description": string,
                "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
                "line": number (0 if unknown),
                "fix": string
              }
            ],
            "overview": string (short summary)
          }`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.NUMBER },
              riskLevel: { type: Type.STRING },
              overview: { type: Type.STRING },
              vulnerabilities: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    severity: { type: Type.STRING },
                    line: { type: Type.NUMBER },
                    fix: { type: Type.STRING },
                  },
                  required: ["title", "description", "severity", "fix"]
                }
              }
            },
            required: ["score", "riskLevel", "vulnerabilities", "overview"]
          }
        },
      });

      const data = JSON.parse(response.text);
      setResults(data);
      setProgress(100);
    } catch (err: any) {
      console.error(err);
      setError("Audit failed. Ensure your Gemini API Key is configured in settings.");
    } finally {
      clearInterval(simulateProgress);
      setIsScanning(false);
    }
  };

  const getSeverityColor = (sev: string) => {
    switch (sev.toUpperCase()) {
      case "CRITICAL": return "text-red-500 bg-red-500/10 border-red-500/20";
      case "HIGH": return "text-orange-500 bg-orange-500/10 border-orange-500/20";
      case "MEDIUM": return "text-yellow-500 bg-yellow-500/10 border-yellow-500/20";
      default: return "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 font-sans selection:bg-blue-500/30 overflow-x-hidden">
      {/* Background Decor */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/30 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-600/30 rounded-full blur-[120px]" />
      </div>

      <nav className="relative z-50 border-b border-slate-800/60 bg-slate-950/50 backdrop-blur-md sticky top-0">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 group cursor-pointer">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform duration-300">
              <Ghost className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-xl tracking-tight text-white uppercase italic">CubHunter</h1>
              <p className="text-[10px] text-slate-500 font-mono tracking-widest flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                SYSTEM_LIVE: AUDIT_NODES_ONLINE
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-6 text-sm font-medium text-slate-400">
            <button 
              onClick={() => {
                console.log("Real-time feed clicked");
                alert("Real-time detection feed is being synchronized...");
              }}
              className="hover:text-white transition-colors cursor-pointer hidden md:block"
            >
              Real-time Feed
            </button>
            <button 
              onClick={() => {
                console.log("Audit history clicked");
                alert("Retrieving your past security audits...");
              }}
              className="hover:text-white transition-colors cursor-pointer hidden md:block"
            >
              Audit History
            </button>
            <div className="h-4 w-px bg-slate-800" />
            <button 
              onClick={connectWallet}
              disabled={isConnecting}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 rounded-full border border-blue-500/20 transition-all active:scale-95 cursor-pointer"
            >
              <Zap className="w-4 h-4 fill-current" />
              <span>{walletAddress ? shortAddress : isConnecting ? "Connecting..." : "Connect Wallet"}</span>
            </button>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto px-6 py-12">
        <header className="mb-12">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex items-center gap-2 mb-4">
              <span className="h-px w-8 bg-blue-500" />
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-400">Security Reconnaissance</span>
            </div>
            <h2 className="text-5xl font-black text-white mb-6 uppercase italic tracking-tighter leading-none">
              Detect. Shield. <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">Execute.</span>
            </h2>
            <p className="max-w-xl text-slate-400 text-lg leading-relaxed font-light">
              Submit your Solidity contract for an automated deep-dive audit. We hunt for bugs so the hackers don't have to.
            </p>
          </motion.div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Editor Section */}
          <section className="lg:col-span-7 space-y-4">
            <div className="bg-slate-900/40 rounded-3xl border border-slate-800 shadow-2xl overflow-hidden backdrop-blur-xl">
              <div className="h-12 border-b border-slate-800 px-6 flex items-center justify-between bg-slate-950/30">
                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 tracking-widest uppercase">
                  <FileCode className="w-3 h-3" />
                  <span>Contract Source // .sol</span>
                </div>
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/30 border border-red-500/20" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/30 border border-yellow-500/20" />
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/30 border border-emerald-500/20" />
                </div>
              </div>
              
              <div className="relative group">
                <textarea
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Paste your Solidity code here..."
                  className="w-full h-[500px] p-6 bg-transparent font-mono text-[13px] text-slate-300 resize-none outline-none leading-relaxed overflow-auto scrollbar-thin scrollbar-thumb-slate-800"
                  spellCheck={false}
                />
                
                <div className="absolute bottom-6 right-6 flex gap-3 z-30">
                  <button 
                    onClick={() => {
                      console.log("Clear button clicked");
                      setCode("");
                    }}
                    className="p-3 bg-slate-950/80 hover:bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 hover:text-white transition-all shadow-xl active:scale-95"
                    title="Clear"
                  >
                    <RotateCcw className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => {
                      console.log("Run Audit clicked");
                      scan();
                    }}
                    disabled={isScanning}
                    className="flex items-center gap-3 px-8 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-xl shadow-blue-600/20 group overflow-hidden relative active:scale-95 cursor-pointer"
                  >
                    {isScanning ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Hunting...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-current group-hover:translate-x-0.5 transition-transform" />
                        <span>Run Full Audit</span>
                      </>
                    )}
                    
                    {isScanning && (
                      <motion.div 
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: progress / 100 }}
                        className="absolute bottom-0 left-0 right-0 h-1 bg-white/30 origin-left"
                      />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-4 p-4 rounded-2xl border border-slate-800 bg-slate-950/30 backdrop-blur text-[10px] text-slate-500 font-mono tracking-tighter uppercase italic overflow-hidden whitespace-nowrap">
              <span className="flex items-center gap-1"><History className="w-3 h-3" /> LASTRUN: {new Date().toLocaleTimeString()}</span>
              <span className="text-slate-700">|</span>
              <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> CLOUD: SEPOLIA_SHIELD_V4</span>
              <span className="text-slate-700">|</span>
              <span className="flex items-center gap-1 text-blue-500/80">MEMORY: OK</span>
            </div>
          </section>

          {/* Results Section */}
          <section className="lg:col-span-5 h-full flex flex-col gap-6">
            <AnimatePresence mode="wait">
              {!results && !error && !isScanning && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-900/20 border border-slate-800 border-dashed rounded-3xl text-center min-h-[500px]"
                >
                  <div className="w-20 h-20 bg-slate-800/50 rounded-full flex items-center justify-center mb-6">
                    <Search className="w-8 h-8 text-slate-600" />
                  </div>
                  <h3 className="font-black uppercase italic text-slate-500 mb-2">No Analysis Selected</h3>
                  <p className="text-xs text-slate-600 max-w-xs leading-relaxed">
                    Paste contract source code and trigger the scan engine to begin the security audit sequence.
                  </p>
                </motion.div>
              )}

              {isScanning && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex-1 flex flex-col p-8 bg-slate-900/20 border border-slate-800 rounded-3xl min-h-[500px]"
                >
                  <div className="mb-8 flex justify-between items-end">
                    <div>
                      <h3 className="text-xs font-black uppercase text-blue-400 mb-1">Deciphering...</h3>
                      <div className="text-3xl font-black italic text-white font-mono">{Math.round(progress)}%</div>
                    </div>
                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                  </div>

                  <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-16 bg-slate-800/40 rounded-2xl border border-slate-800 relative overflow-hidden">
                        <motion.div 
                          initial={{ x: "-100%" }}
                          animate={{ x: "100%" }}
                          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                          className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-500/10 to-transparent"
                        />
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-6 bg-red-500/10 border border-red-500/20 rounded-3xl flex flex-col items-center text-center"
                >
                  <AlertTriangle className="w-10 h-10 text-red-500 mb-4" />
                  <h4 className="font-bold text-red-400 mb-2 uppercase">Engine Error</h4>
                  <p className="text-xs text-red-500/80 leading-relaxed mb-6 italic">{error}</p>
                  <button className="px-4 py-2 bg-red-500/20 text-red-500 rounded-xl text-[10px] font-bold uppercase tracking-tighter transition-all hover:bg-red-500">
                    Fix Secret Keys
                  </button>
                </motion.div>
              )}

              {results && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6 overflow-y-auto max-h-[700px] pr-2 scrollbar-thin scrollbar-thumb-slate-800"
                >
                  {/* Summary Card */}
                  <div className="p-8 bg-slate-900 border border-slate-800 rounded-3xl relative overflow-hidden">
                    <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl blur-3xl opacity-30 ${results.score > 70 ? 'from-emerald-500' : 'from-red-500'}`} />
                    
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-1">Safety Index</h3>
                        <div className={`text-6xl font-black italic leading-none ${results.score > 70 ? 'text-emerald-500' : results.score > 40 ? 'text-yellow-500' : 'text-red-500'}`}>
                          {results.score}
                        </div>
                      </div>
                      <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-current ${getSeverityColor(results.riskLevel)}`}>
                        {results.riskLevel} RISK
                      </div>
                    </div>
                    
                    <p className="text-sm text-slate-400 leading-relaxed italic border-l-2 border-slate-700 pl-4 py-1">
                      {results.overview}
                    </p>
                  </div>

                  {/* Vulnerability List */}
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                      <ShieldAlert className="w-3 h-3" />
                      Detected Threats ({results.vulnerabilities.length})
                    </h4>
                    
                    {results.vulnerabilities.map((vuln: any, idx: number) => (
                      <motion.div 
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        key={idx} 
                        className="p-6 bg-slate-950/40 border border-slate-800 rounded-3xl group hover:border-slate-700 transition-colors"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <h5 className="font-bold text-white group-hover:text-blue-400 transition-colors uppercase tracking-tight italic flex items-center gap-2">
                            <AlertTriangle className={`w-3.5 h-3.5 ${getSeverityColor(vuln.severity)} fill-none`} />
                            {vuln.title}
                          </h5>
                          <span className={`text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-tighter border ${getSeverityColor(vuln.severity)}`}>
                            {vuln.severity}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed mb-4">
                          {vuln.description}
                        </p>
                        
                        {vuln.line > 0 && (
                          <div className="mb-4 inline-flex items-center gap-2 px-3 py-1 bg-slate-900 border border-slate-800 rounded-lg text-[10px] font-mono text-slate-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500/50 block" /> 
                            LOC_IDENTIFIED: LINE_{vuln.line}
                          </div>
                        )}

                        <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl">
                          <div className="text-[10px] font-black text-emerald-500 uppercase mb-2 flex items-center gap-1.5 opacity-80">
                            <CheckCircle2 className="w-3 h-3" /> Recommended Shielding
                          </div>
                          <p className="text-[11px] text-emerald-500/80 leading-relaxed font-mono">
                            {vuln.fix}
                          </p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </div>
      </main>

      <section className="relative z-10 max-w-7xl mx-auto px-6 py-16">
        <div className="flex items-center gap-2 mb-8">
          <span className="h-px w-8 bg-emerald-500" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400">AI Security Agent</span>
        </div>
        <h2 className="text-4xl font-black text-white mb-2 uppercase italic tracking-tighter">
          CubHunter <span className="text-emerald-400">Agent</span>
        </h2>
        <p className="text-slate-400 text-sm mb-8 max-w-lg">On-chain vault analysis powered by Groq AI. Paste a vault address or chat with the agent.</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Vault Analyzer */}
          <div className="bg-slate-900/40 rounded-3xl border border-slate-800 p-6">
            <h3 className="text-xs font-black text-emerald-400 uppercase tracking-widest mb-4">Vault Analyzer</h3>
            <div className="flex gap-3 mb-4">
              <input
                value={vaultAddress}
                onChange={(e) => setVaultAddress(e.target.value)}
                placeholder="0x... vault address"
                className="flex-1 px-4 py-3 bg-slate-950/60 border border-slate-800 rounded-xl font-mono text-xs text-slate-300 outline-none focus:border-emerald-500/50 transition-colors"
              />
              <button
                onClick={analyzeVaultOnChain}
                disabled={analyzing || !vaultAddress.trim()}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
              >
                {analyzing ? "Analyzing..." : "Analyze"}
              </button>
            </div>

            {vaultAnalysis && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                <div className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border inline-block ${
                  vaultAnalysis.status === "ok" ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" :
                  vaultAnalysis.status === "warning" ? "text-yellow-400 border-yellow-500/30 bg-yellow-500/10" :
                  "text-red-400 border-red-500/30 bg-red-500/10"
                }`}>
                  {vaultAnalysis.status}
                </div>
                <p className="text-sm text-slate-300">{vaultAnalysis.summary}</p>
                {vaultAnalysis.analysis && (
                  <div className="space-y-2 text-xs text-slate-500">
                    <p><span className="text-slate-400">State:</span> {vaultAnalysis.analysis.state}</p>
                    {vaultAnalysis.analysis.risks?.length > 0 && (
                      <div>
                        <span className="text-red-400 font-bold">Risks:</span>
                        <ul className="ml-4 mt-1 space-y-1">
                          {vaultAnalysis.analysis.risks.map((r: string, i: number) => <li key={i}>- {r}</li>)}
                        </ul>
                      </div>
                    )}
                    {vaultAnalysis.analysis.recommendations?.length > 0 && (
                      <div>
                        <span className="text-emerald-400 font-bold">Recommendations:</span>
                        <ul className="ml-4 mt-1 space-y-1">
                          {vaultAnalysis.analysis.recommendations.map((r: string, i: number) => <li key={i}>- {r}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </div>

          {/* Agent Chat */}
          <div className="bg-slate-900/40 rounded-3xl border border-slate-800 p-6 flex flex-col">
            <h3 className="text-xs font-black text-blue-400 uppercase tracking-widest mb-4">Agent Chat</h3>
            <div className="flex-1 overflow-y-auto max-h-[400px] space-y-3 mb-4 pr-2 scrollbar-thin scrollbar-thumb-slate-800">
              {agentChat.length === 0 && (
                <p className="text-xs text-slate-600 italic">Ask the agent about vault security, gas optimization, or attack vectors...</p>
              )}
              {agentChat.map((msg, i) => (
                <div key={i} className={`p-3 rounded-2xl text-xs leading-relaxed ${
                  msg.role === "user"
                    ? "bg-blue-600/10 border border-blue-500/20 text-blue-300 ml-8"
                    : "bg-slate-800/50 border border-slate-700 text-slate-300 mr-8"
                }`}>
                  {msg.content}
                </div>
              ))}
              {agentLoading && (
                <div className="p-3 bg-slate-800/50 border border-slate-700 rounded-2xl text-xs text-slate-500 mr-8 flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" /> Thinking...
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <input
                value={agentInput}
                onChange={(e) => setAgentInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendAgentMessage()}
                placeholder="Ask about vault security..."
                className="flex-1 px-4 py-3 bg-slate-950/60 border border-slate-800 rounded-xl font-mono text-xs text-slate-300 outline-none focus:border-blue-500/50 transition-colors"
              />
              <button
                onClick={sendAgentMessage}
                disabled={agentLoading || !agentInput.trim()}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer className="relative z-50 border-t border-slate-800/40 py-12 bg-slate-950/80 backdrop-blur-3xl mt-24">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-12">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-3 mb-6">
               <Ghost className="text-white w-6 h-6" />
               <span className="font-black italic text-xl tracking-tighter uppercase">CubHunter <span className="text-blue-500">v2.0</span></span>
            </div>
            <p className="text-sm text-slate-500 leading-relaxed max-w-sm mb-8">
              A high-velocity security analysis engine designed for the next generation of decentralized financial infrastructure. Audits take seconds, not weeks.
            </p>
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center hover:bg-slate-800 transition-colors border border-slate-800 cursor-pointer">
                <Github className="w-5 h-5 text-slate-400" />
              </div>
              <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center hover:bg-slate-800 transition-colors border border-slate-800 cursor-pointer">
                <Globe className="w-5 h-5 text-slate-400" />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h6 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Core Engine</h6>
            <ul className="space-y-2 text-xs text-slate-600">
              <li className="hover:text-blue-400 transition-colors cursor-pointer">Reentrancy Guard Analysis</li>
              <li className="hover:text-blue-400 transition-colors cursor-pointer">Integer Overflow Scanner</li>
              <li className="hover:text-blue-400 transition-colors cursor-pointer">Access Control Audit</li>
              <li className="hover:text-blue-400 transition-colors cursor-pointer">Logic Inconsistency Engine</li>
            </ul>
          </div>

          <div className="p-6 bg-blue-600/5 border border-blue-500/10 rounded-3xl">
            <h6 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400 mb-3 flex items-center gap-2">
              <Terminal className="w-3 h-3" /> Status: Operational
            </h6>
            <div className="space-y-2 mb-6 font-mono text-[10px]">
              <div className="flex justify-between text-slate-500">
                <span>LATENCY:</span>
                <span className="text-emerald-500">22MS</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>THREAT_LEVEL:</span>
                <span className="text-slate-100">STABLE</span>
              </div>
            </div>
            <button className="w-full py-2 bg-blue-600 rounded-xl text-[10px] font-black text-white uppercase italic tracking-widest hover:scale-[1.02] transition-transform">
              Upgrade to PRO
            </button>
          </div>
        </div>
        <div className="mt-12 text-center text-[10px] text-slate-800 font-mono tracking-widest uppercase">
          &copy; 2026 Ghost Protocol Infrastructure. No data shared. Private by default.
        </div>
      </footer>
    </div>
  );
}

const Github = ({ className }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
  </svg>
);
