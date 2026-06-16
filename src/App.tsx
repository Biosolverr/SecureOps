import { useState, useEffect, useRef, useCallback } from "react";
import { ethers } from "ethers";
import { VAULT_ADDRESS, VAULT_ABI } from "./config";
import {
  Shield, Lock, Unlock, Send, RotateCcw, AlertTriangle, CheckCircle2,
  Wallet, Copy, Pause, Play, Key, ShieldAlert, Clock,
  Coins, RefreshCw, Zap, Eye, EyeOff, ShieldCheck, Bot, MessageSquare, X, ChevronDown, ChevronUp
} from "lucide-react";

const STATES = ["INIT", "FUNDED", "LOCKED", "EXECUTION_PENDING", "EXECUTED", "REFUNDED"];
const STATE_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#f97316", "#10b981", "#8b5cf6"];
const QUARANTINE_STAKE = ethers.parseEther("0.01");

interface ChatMessage { role: "user" | "assistant"; content: string; }
interface AuditResult {
  status: "ok" | "warning" | "critical";
  summary: string;
  analysis: { state: string; risks: string[]; recommendations: string[]; gas_estimate: string };
  actions: { name: string; description: string; priority: string }[];
}

export default function App() {
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [account, setAccount] = useState("");
  const [vaultAddress, setVaultAddress] = useState(VAULT_ADDRESS);
  const [vault, setVault] = useState<ethers.Contract | null>(null);
  const [vaultState, setVaultState] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [txStatus, setTxStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"actions" | "tokens" | "admin" | "ai">("actions");
  const [depositAmount, setDepositAmount] = useState("");
  const [secret, setSecret] = useState("");
  const [secretVisible, setSecretVisible] = useState(false);
  const [tokenAddress, setTokenAddress] = useState("");
  const [tokenAmount, setTokenAmount] = useState("");
  const [recoverTo, setRecoverTo] = useState("");
  const [nftId, setNftId] = useState("");
  const [newImpl, setNewImpl] = useState("");
  const [copied, setCopied] = useState("");

  // AI Agent state
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const providerRef = useRef<ethers.BrowserProvider | null>(null);
  const signerRef = useRef<ethers.Signer | null>(null);
  const vaultAddressRef = useRef(vaultAddress);

  useEffect(() => { vaultAddressRef.current = vaultAddress; }, [vaultAddress]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatHistory]);

  const connectWallet = async () => {
    const eth = (window as any).ethereum;
    if (!eth) { alert("Install MetaMask"); return; }
    const p = new ethers.BrowserProvider(eth);
    const s = await p.getSigner();
    const addr = await s.getAddress();
    providerRef.current = p;
    signerRef.current = s;
    setProvider(p);
    setSigner(s);
    setAccount(addr);
  };

  const disconnect = () => {
    providerRef.current = null;
    signerRef.current = null;
    setProvider(null);
    setSigner(null);
    setAccount("");
    setVault(null);
    setVaultState(null);
  };

  const loadVault = useCallback(async (address: string) => {
    const p = providerRef.current;
    const s = signerRef.current;
    if (!p || !address) return;
    setLoading(true);
    setTxStatus(null);
    try {
      const c = new ethers.Contract(address, VAULT_ABI, p);
      const [state, owner, guardian, counterparty, commitmentHash, lockDuration, lockTimestamp, refundDelay, depositedEthAmount, quarantineEndTime, quarantineInitiator, nonce, paused] = await Promise.all([
        c.currentState(), c.owner(), c.guardian(), c.counterparty(), c.commitmentHash(),
        c.lockDuration(), c.lockTimestamp(), c.refundDelay(), c.depositedEthAmount(),
        c.quarantineEndTime(), c.quarantineInitiator(), c.nonce(), c.paused()
      ]);
      const balance = await p.getBalance(address);
      setVaultState({ state: Number(state), owner, guardian, counterparty, commitmentHash, lockDuration: Number(lockDuration), lockTimestamp: Number(lockTimestamp), refundDelay: Number(refundDelay), depositedEthAmount, quarantineEndTime: Number(quarantineEndTime), quarantineInitiator, nonce: Number(nonce), paused, balance });
      if (s) setVault(new ethers.Contract(address, VAULT_ABI, s));
    } catch (err: any) {
      setTxStatus({ type: "error", msg: "Failed to load vault: " + (err?.reason || err?.message || String(err)) });
    } finally {
      setLoading(false);
    }
  }, []);

  const executeTx = async (fn: () => Promise<any>, label: string) => {
    setLoading(true);
    setTxStatus(null);
    try {
      const tx = await fn();
      await tx.wait();
      setTxStatus({ type: "success", msg: `${label} — confirmed` });
      if (vaultAddressRef.current) await loadVault(vaultAddressRef.current);
    } catch (err: any) {
      const msg = err?.reason || err?.message || "Transaction failed";
      setTxStatus({ type: "error", msg: `${label} — ${msg.slice(0, 120)}` });
    } finally {
      setLoading(false);
    }
  };

  const handleDeposit = () => executeTx(() => vault!.deposit({ value: ethers.parseEther(depositAmount) }), "Deposit");
  const handleLock = () => executeTx(() => vault!.lock(), "Lock");
  const handleInitiateExecution = () => executeTx(() => vault!.initiateExecution(ethers.encodeBytes32String(secret)), "Initiate Execution");
  const handleExecute = () => executeTx(() => vault!.execute(), "Execute");
  const handleRefund = () => executeTx(() => vault!.refund(), "Refund");
  const handleQuarantine = () => executeTx(() => vault!.initiateQuarantine({ value: QUARANTINE_STAKE }), "Quarantine");
  const handleReleaseQuarantine = () => executeTx(() => vault!.releaseQuarantine(), "Release Quarantine");
  const handleDepositTokens = () => executeTx(() => vault!.depositTokens(tokenAddress, ethers.parseEther(tokenAmount)), "Deposit Tokens");
  const handleRecoverTokens = () => executeTx(() => vault!.recoverTokens(tokenAddress, recoverTo), "Recover Tokens");
  const handleRecoverNFT = () => executeTx(() => vault!.recoverNFT(tokenAddress, recoverTo, BigInt(nftId)), "Recover NFT");
  const handlePause = () => executeTx(() => vault!.pause(), "Pause");
  const handleUnpause = () => executeTx(() => vault!.unpause(), "Unpause");
  const handleScheduleUpgrade = () => executeTx(() => vault!.scheduleUpgrade(newImpl), "Schedule Upgrade");

  // ─── AI Agent functions ────────────────────────────────────────────────────

  const buildVaultPayload = () => {
    if (!vaultState) return null;
    return {
      address: vaultAddress,
      currentState: STATES[vaultState.state],
      owner: vaultState.owner,
      guardian: vaultState.guardian,
      counterparty: vaultState.counterparty,
      balance: ethers.formatEther(vaultState.balance),
      lockDuration: String(vaultState.lockDuration),
      lockTimestamp: String(vaultState.lockTimestamp),
      refundDelay: String(vaultState.refundDelay),
      quarantineEndTime: String(vaultState.quarantineEndTime),
      nonce: String(vaultState.nonce),
      depositedEthAmount: ethers.formatEther(vaultState.depositedEthAmount),
    };
  };

  const handleAnalyze = async () => {
    const payload = buildVaultPayload();
    if (!payload) return;
    setAuditLoading(true);
    setAuditResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAuditResult(data);
      setAuditOpen(true);
    } catch (err: any) {
      setTxStatus({ type: "error", msg: "AI analysis failed: " + err.message });
    } finally {
      setAuditLoading(false);
    }
  };

  const handleChat = async () => {
    if (!chatInput.trim()) return;
    const userMsg: ChatMessage = { role: "user", content: chatInput.trim() };
    const newHistory = [...chatHistory, userMsg];
    setChatHistory(newHistory);
    setChatInput("");
    setChatLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg.content, history: chatHistory }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setChatHistory([...newHistory, { role: "assistant", content: data.reply }]);
    } catch (err: any) {
      setChatHistory([...newHistory, { role: "assistant", content: "⚠️ Error: " + err.message }]);
    } finally {
      setChatLoading(false);
    }
  };

  // ──────────────────────────────────────────────────────────────────────────

  const isOwner = vaultState && account && vaultState.owner.toLowerCase() === account.toLowerCase();
  const isCounterparty = vaultState && account && vaultState.counterparty.toLowerCase() === account.toLowerCase();
  const isGuardian = vaultState && account && vaultState.guardian.toLowerCase() === account.toLowerCase();
  const shortAddr = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;
  const formatEth = (v: bigint) => ethers.formatEther(v);
  const formatTime = (ts: number) => ts === 0 ? "—" : new Date(ts * 1000).toLocaleString();
  const timeLeft = (ts: number) => {
    if (ts === 0) return "—";
    const diff = ts - Math.floor(Date.now() / 1000);
    if (diff <= 0) return "Expired";
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 1500);
  };

  useEffect(() => {
    if (vaultAddress && provider) loadVault(vaultAddress);
  }, [provider, signer, loadVault]);

  const statusColor = (s: string) => s === "ok" ? "#10b981" : s === "warning" ? "#f59e0b" : "#ef4444";
  const priorityColor = (p: string) => p === "high" ? "#ef4444" : p === "medium" ? "#f59e0b" : "#6b7280";

  const StateBadge = ({ state }: { state: number }) => (
    <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider"
      style={{ background: `linear-gradient(135deg, ${STATE_COLORS[state]}15, ${STATE_COLORS[state]}08)`, color: STATE_COLORS[state], border: `1px solid ${STATE_COLORS[state]}30`, boxShadow: `0 0 20px ${STATE_COLORS[state]}10` }}>
      <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: STATE_COLORS[state] }} />
      {STATES[state]}
    </span>
  );

  const GlassCard = ({ children, className = "", hover = true }: { children: React.ReactNode; className?: string; hover?: boolean }) => (
    <div className={`relative rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 transition-all duration-300 ${hover ? "hover:border-white/20 hover:bg-white/[0.06] hover:shadow-2xl hover:shadow-black/20" : ""} ${className}`}>
      {children}
    </div>
  );

  const ActionCard = ({ icon: Icon, iconColor, title, subtitle, children, disabled }: {
    icon: any; iconColor: string; title: string; subtitle: string; children: React.ReactNode; disabled?: boolean;
  }) => (
    <GlassCard className={`group ${disabled ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-4 mb-5">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
          style={{ background: `linear-gradient(135deg, ${iconColor}20, ${iconColor}08)`, border: `1px solid ${iconColor}20` }}>
          <Icon className="w-5 h-5" style={{ color: iconColor }} />
        </div>
        <div>
          <h3 className="font-bold text-sm text-white">{title}</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>
        </div>
      </div>
      {children}
    </GlassCard>
  );

  const Input = ({ value, onChange, placeholder, type = "text" }: {
    value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder: string; type?: string;
  }) => (
    <input type={type} value={value} onChange={onChange} placeholder={placeholder}
      className="w-full px-4 py-3 bg-white/[0.05] border border-white/10 rounded-xl text-sm font-mono text-white placeholder:text-slate-600 mb-3 outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 transition-all duration-200"
    />
  );

  const Button = ({ onClick, disabled, children, variant = "primary", className = "" }: {
    onClick: () => void; disabled?: boolean; children: React.ReactNode; variant?: "primary" | "danger" | "ghost" | "success" | "amber" | "purple" | "indigo"; className?: string;
  }) => {
    const variants: Record<string, string> = {
      primary: "bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 shadow-lg shadow-blue-500/20",
      success: "bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 shadow-lg shadow-emerald-500/20",
      danger: "bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 shadow-lg shadow-red-500/20",
      ghost: "bg-white/[0.05] hover:bg-white/[0.1] border border-white/10",
      amber: "bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 shadow-lg shadow-amber-500/20",
      purple: "bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 shadow-lg shadow-purple-500/20",
      indigo: "bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 shadow-lg shadow-indigo-500/20",
    };
    return (
      <button onClick={onClick} disabled={disabled || loading}
        className={`w-full py-3 rounded-xl text-xs font-bold uppercase tracking-wider text-white transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none ${variants[variant]} ${className}`}>
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Processing...
          </span>
        ) : children}
      </button>
    );
  };

  const RoleCard = ({ label, addr, color, isYou }: { label: string; addr: string; color: string; isYou: boolean }) => (
    <div className={`p-4 rounded-xl border transition-all duration-300 ${isYou ? "border-blue-500/40 bg-blue-500/5 shadow-lg shadow-blue-500/5" : "border-white/5 bg-white/[0.02]"}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</span>
        {isYou && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            <span className="text-[9px] font-bold text-blue-400">YOU</span>
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <p className="font-mono text-xs text-slate-400 break-all flex-1">{addr}</p>
        <button onClick={() => copyToClipboard(addr, label)} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
          <Copy className={`w-3 h-3 ${copied === label ? "text-green-400" : "text-slate-600"}`} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#080b14] text-white font-sans relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-blue-600/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-purple-600/5 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-600/3 rounded-full blur-[150px]" />
      </div>

      <header className="relative border-b border-white/5 bg-[#080b14]/80 backdrop-blur-2xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}>
              <Shield className="text-white w-5 h-5" />
            </div>
            <div>
              <h1 className="font-black text-base tracking-tight text-white uppercase">SecureVault</h1>
              <p className="text-[9px] text-blue-400/60 font-mono tracking-widest">PRODUCTION READY</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {account ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.05] border border-white/10 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/50" />
                  <span className="text-xs font-mono text-slate-300">{shortAddr(account)}</span>
                </div>
                <button onClick={disconnect} className="text-xs text-slate-500 hover:text-red-400 transition-colors duration-200">Disconnect</button>
              </div>
            ) : (
              <button onClick={connectWallet} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 active:scale-95 text-white" style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", boxShadow: "0 4px 20px rgba(37, 99, 235, 0.3)" }}>
                <Wallet className="w-4 h-4" /> Connect Wallet
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="relative max-w-7xl mx-auto px-6 py-10">
        <GlassCard className="mb-8" hover={false}>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-3 block">Vault Contract Address</label>
          <div className="flex gap-3">
            <input value={vaultAddress} onChange={(e) => setVaultAddress(e.target.value)} placeholder="0x..."
              className="flex-1 px-4 py-3 bg-white/[0.05] border border-white/10 rounded-xl font-mono text-sm text-white placeholder:text-slate-600 outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 transition-all duration-200"
            />
            <button onClick={() => vaultAddress && loadVault(vaultAddress)}
              className="px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 active:scale-95 text-white"
              style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", boxShadow: "0 4px 20px rgba(37, 99, 235, 0.2)" }}>
              Load
            </button>
          </div>
        </GlassCard>

        {txStatus && (
          <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 transition-all duration-300 ${txStatus.type === "success" ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300" : "bg-red-500/10 border border-red-500/20 text-red-300"}`}>
            {txStatus.type === "success" ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
            <span className="text-sm font-medium">{txStatus.msg}</span>
          </div>
        )}

        {vaultState && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <GlassCard className="!p-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">State</p>
                <StateBadge state={vaultState.state} />
              </GlassCard>
              <GlassCard className="!p-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Balance</p>
                <p className="text-xl font-black text-white">{formatEth(vaultState.balance)} <span className="text-sm text-slate-500">ETH</span></p>
              </GlassCard>
              <GlassCard className="!p-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Paused</p>
                <p className={`text-sm font-bold ${vaultState.paused ? "text-red-400" : "text-emerald-400"}`}>{vaultState.paused ? "YES" : "NO"}</p>
              </GlassCard>
              <GlassCard className="!p-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Quarantine</p>
                <p className="text-sm font-bold text-slate-300">
                  {vaultState.quarantineEndTime > Date.now() / 1000 ? `Active — ${timeLeft(vaultState.quarantineEndTime)}` : "None"}
                </p>
              </GlassCard>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              {[
                { label: "Owner", addr: vaultState.owner, color: "#3b82f6" },
                { label: "Guardian", addr: vaultState.guardian, color: "#a855f7" },
                { label: "Counterparty", addr: vaultState.counterparty, color: "#10b981" }
              ].map(r => (
                <RoleCard key={r.label} label={r.label} addr={r.addr} color={r.color} isYou={!!(account && r.addr.toLowerCase() === account)} />
              ))}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {[
                { label: "Lock Duration", value: `${vaultState.lockDuration}s (${Math.floor(vaultState.lockDuration / 3600)}h)`, icon: Lock },
                { label: "Lock Timestamp", value: formatTime(vaultState.lockTimestamp), icon: Clock },
                { label: "Refund Delay", value: `${vaultState.refundDelay}s (${Math.floor(vaultState.refundDelay / 3600)}h)`, icon: RotateCcw },
                { label: "Deposited", value: `${formatEth(vaultState.depositedEthAmount)} ETH`, icon: Coins }
              ].map((item) => (
                <GlassCard key={item.label} className="!p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <item.icon className="w-3.5 h-3.5 text-slate-600" />
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{item.label}</span>
                  </div>
                  <p className="font-mono text-xs text-slate-300">{item.value}</p>
                </GlassCard>
              ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-8 bg-white/[0.03] border border-white/5 p-1 rounded-xl w-fit">
              {[
                { key: "actions" as const, label: "Actions", icon: Zap },
                { key: "tokens" as const, label: "Tokens", icon: Coins },
                { key: "admin" as const, label: "Admin", icon: ShieldAlert },
                { key: "ai" as const, label: "AI Agent", icon: Bot },
              ].map(t => (
                <button key={t.key} onClick={() => setActiveTab(t.key)}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-200 ${activeTab === t.key ? "bg-white/[0.1] text-white shadow-lg" : "text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]"}`}>
                  <t.icon className="w-4 h-4" /> {t.label}
                </button>
              ))}
            </div>

            {activeTab === "actions" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ActionCard icon={Send} iconColor="#3b82f6" title="Deposit ETH" subtitle="State: INIT → FUNDED">
                  <Input value={depositAmount} onChange={e => setDepositAmount(e.target.value)} placeholder="Amount in ETH" />
                  <Button onClick={handleDeposit} disabled={vaultState.state !== 0}>Deposit ETH</Button>
                </ActionCard>
                <ActionCard icon={Lock} iconColor="#f59e0b" title="Lock Vault" subtitle="State: FUNDED → LOCKED">
                  <p className="text-xs text-slate-500 mb-4">Locks vault for {Math.floor(vaultState.lockDuration / 3600)} hours</p>
                  <Button onClick={handleLock} disabled={vaultState.state !== 1 || !isOwner} variant="amber">{isOwner ? "Lock Vault" : "Owner Only"}</Button>
                </ActionCard>
                <ActionCard icon={Key} iconColor="#f97316" title="Initiate Execution" subtitle="State: LOCKED → EXECUTION_PENDING">
                  <div className="relative mb-3">
                    <input type={secretVisible ? "text" : "password"} value={secret} onChange={e => setSecret(e.target.value)} placeholder="Enter secret to reveal"
                      className="w-full px-4 py-3 pr-10 bg-white/[0.05] border border-white/10 rounded-xl text-sm font-mono text-white placeholder:text-slate-600 outline-none focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/10 transition-all duration-200"
                    />
                    <button type="button" onClick={() => setSecretVisible(!secretVisible)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors">
                      {secretVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <Button onClick={handleInitiateExecution} disabled={vaultState.state !== 2} variant="amber">Reveal Secret</Button>
                </ActionCard>
                <ActionCard icon={CheckCircle2} iconColor="#10b981" title="Execute" subtitle="State: EXECUTION_PENDING → EXECUTED">
                  <p className="text-xs text-slate-500 mb-4">Sends {formatEth(vaultState.depositedEthAmount)} ETH to counterparty</p>
                  <Button onClick={handleExecute} disabled={vaultState.state !== 3 || (!isOwner && !isCounterparty)} variant="success">
                    {isOwner || isCounterparty ? "Execute Transfer" : "Owner/Counterparty Only"}
                  </Button>
                </ActionCard>
                <ActionCard icon={RotateCcw} iconColor="#a855f7" title="Refund" subtitle="State: FUNDED/LOCKED → REFUNDED">
                  <p className="text-xs text-slate-500 mb-4">Returns ETH to owner. Available from FUNDED or after lock + delay.</p>
                  <Button onClick={handleRefund} disabled={!isOwner || (vaultState.state !== 1 && vaultState.state !== 2)} variant="purple">
                    {isOwner ? "Refund ETH" : "Owner Only"}
                  </Button>
                </ActionCard>
                <ActionCard icon={AlertTriangle} iconColor="#ef4444" title="Quarantine" subtitle="Pauses vault for 12h (0.01 ETH stake)">
                  <div className="flex gap-3">
                    <Button onClick={handleQuarantine} variant="danger" className="!flex-1">Activate</Button>
                    <Button onClick={handleReleaseQuarantine} disabled={!isOwner || vaultState.quarantineEndTime <= Date.now() / 1000} variant="ghost" className="!flex-1">Release</Button>
                  </div>
                </ActionCard>
              </div>
            )}

            {activeTab === "tokens" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ActionCard icon={Coins} iconColor="#3b82f6" title="Deposit ERC20" subtitle="Transfer tokens to vault">
                  <Input value={tokenAddress} onChange={e => setTokenAddress(e.target.value)} placeholder="Token contract address" />
                  <Input value={tokenAmount} onChange={e => setTokenAmount(e.target.value)} placeholder="Amount" />
                  <Button onClick={handleDepositTokens}>Deposit Tokens</Button>
                </ActionCard>
                <ActionCard icon={RefreshCw} iconColor="#10b981" title="Recover ERC20" subtitle="After vault closed (EXECUTED/REFUNDED)">
                  <Input value={tokenAddress} onChange={e => setTokenAddress(e.target.value)} placeholder="Token address" />
                  <Input value={recoverTo} onChange={e => setRecoverTo(e.target.value)} placeholder="Recover to address" />
                  <Button onClick={handleRecoverTokens} disabled={!isOwner || (vaultState.state !== 4 && vaultState.state !== 5)} variant="success">Recover Tokens</Button>
                </ActionCard>
                <ActionCard icon={ShieldCheck} iconColor="#ec4899" title="Recover NFT" subtitle="Recover ERC721 after vault closed">
                  <Input value={tokenAddress} onChange={e => setTokenAddress(e.target.value)} placeholder="NFT contract address" />
                  <Input value={recoverTo} onChange={e => setRecoverTo(e.target.value)} placeholder="Recover to address" />
                  <Input value={nftId} onChange={e => setNftId(e.target.value)} placeholder="Token ID" />
                  <Button onClick={handleRecoverNFT} disabled={!isOwner || (vaultState.state !== 4 && vaultState.state !== 5)} variant="danger">Recover NFT</Button>
                </ActionCard>
              </div>
            )}

            {activeTab === "admin" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ActionCard icon={vaultState.paused ? Play : Pause} iconColor={vaultState.paused ? "#10b981" : "#ef4444"} title={vaultState.paused ? "Unpause" : "Pause"} subtitle="Emergency stop for all operations">
                  <Button onClick={vaultState.paused ? handleUnpause : handlePause} disabled={!isOwner} variant={vaultState.paused ? "success" : "danger"}>
                    {vaultState.paused ? "Resume Vault" : "Pause Vault"}
                  </Button>
                </ActionCard>
                <ActionCard icon={Zap} iconColor="#6366f1" title="Schedule Upgrade" subtitle="48h timelock required">
                  <Input value={newImpl} onChange={e => setNewImpl(e.target.value)} placeholder="New implementation address" />
                  <Button onClick={handleScheduleUpgrade} disabled={!isOwner} variant="indigo">Schedule Upgrade</Button>
                </ActionCard>
                <GlassCard className="md:col-span-2" hover={false}>
                  <div className="flex items-center gap-2 mb-4">
                    <ShieldCheck className="w-4 h-4 text-blue-400" />
                    <h3 className="font-bold text-sm text-white">Vault Information</h3>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: "Address", value: vaultAddress },
                      { label: "Commitment Hash", value: shortAddr(vaultState.commitmentHash) },
                      { label: "Nonce", value: vaultState.nonce },
                      { label: "Refund Delay", value: `${Math.floor(vaultState.refundDelay / 3600)}h` }
                    ].map((item) => (
                      <div key={item.label}>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{item.label}</span>
                        <p className="font-mono text-xs text-slate-300 mt-1 break-all">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              </div>
            )}

            {/* ─── AI AGENT TAB ─────────────────────────────────────────────── */}
            {activeTab === "ai" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Audit Panel */}
                <GlassCard hover={false} className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #7c3aed20, #7c3aed08)", border: "1px solid #7c3aed20" }}>
                      <Bot className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-white">CubHunter AI Audit</h3>
                      <p className="text-[11px] text-slate-500">Security analysis of current vault state</p>
                    </div>
                  </div>
                  <button onClick={handleAnalyze} disabled={auditLoading}
                    className="w-full py-3 rounded-xl text-xs font-bold uppercase tracking-wider text-white transition-all duration-200 active:scale-[0.98] disabled:opacity-40 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-lg shadow-purple-500/20">
                    {auditLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Analyzing...
                      </span>
                    ) : "Run Security Audit"}
                  </button>

                  {auditResult && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: statusColor(auditResult.status) }}>
                          ● {auditResult.status.toUpperCase()}
                        </span>
                        <button onClick={() => setAuditOpen(!auditOpen)} className="text-slate-500 hover:text-white transition-colors">
                          {auditOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-sm text-slate-300">{auditResult.summary}</p>

                      {auditOpen && (
                        <>
                          <div className="rounded-xl bg-white/[0.03] border border-white/5 p-4 flex flex-col gap-3">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">State</p>
                            <p className="text-xs text-slate-300">{auditResult.analysis.state}</p>
                            {auditResult.analysis.risks.length > 0 && (
                              <>
                                <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Risks</p>
                                {auditResult.analysis.risks.map((r, i) => (
                                  <p key={i} className="text-xs text-slate-400">• {r}</p>
                                ))}
                              </>
                            )}
                            {auditResult.analysis.recommendations.length > 0 && (
                              <>
                                <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Recommendations</p>
                                {auditResult.analysis.recommendations.map((r, i) => (
                                  <p key={i} className="text-xs text-slate-400">• {r}</p>
                                ))}
                              </>
                            )}
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Gas Estimate</p>
                            <p className="text-xs font-mono text-slate-300">{auditResult.analysis.gas_estimate}</p>
                          </div>

                          {auditResult.actions.length > 0 && (
                            <div className="flex flex-col gap-2">
                              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Suggested Actions</p>
                              {auditResult.actions.map((a, i) => (
                                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/5">
                                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full mt-0.5" style={{ background: `${priorityColor(a.priority)}20`, color: priorityColor(a.priority) }}>
                                    {a.priority.toUpperCase()}
                                  </span>
                                  <div>
                                    <p className="text-xs font-bold text-white">{a.name}</p>
                                    <p className="text-[11px] text-slate-500 mt-0.5">{a.description}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </GlassCard>

                {/* Chat Panel */}
                <GlassCard hover={false} className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #2563eb20, #2563eb08)", border: "1px solid #2563eb20" }}>
                      <MessageSquare className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-sm text-white">Ask CubHunter AI</h3>
                      <p className="text-[11px] text-slate-500">Smart contract security advisor</p>
                    </div>
                    {chatHistory.length > 0 && (
                      <button onClick={() => setChatHistory([])} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors text-slate-600 hover:text-red-400">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Messages */}
                  <div className="flex flex-col gap-3 max-h-72 overflow-y-auto pr-1">
                    {chatHistory.length === 0 && (
                      <div className="text-center py-8">
                        <Bot className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                        <p className="text-xs text-slate-600">Ask anything about vault security, operations, or best practices.</p>
                      </div>
                    )}
                    {chatHistory.map((m, i) => (
                      <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${m.role === "user" ? "bg-blue-600/20 border border-blue-500/20 text-blue-100" : "bg-white/[0.04] border border-white/5 text-slate-300"}`}>
                          {m.content}
                        </div>
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="flex justify-start">
                        <div className="px-4 py-3 rounded-2xl bg-white/[0.04] border border-white/5">
                          <span className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                            Thinking...
                          </span>
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Input */}
                  <div className="flex gap-2 mt-auto">
                    <input
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleChat()}
                      placeholder="Ask about vault security..."
                      className="flex-1 px-4 py-3 bg-white/[0.05] border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-600 outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 transition-all duration-200"
                    />
                    <button onClick={handleChat} disabled={chatLoading || !chatInput.trim()}
                      className="px-4 py-3 rounded-xl text-white transition-all duration-200 active:scale-95 disabled:opacity-40"
                      style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}>
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </GlassCard>

              </div>
            )}
          </>
        )}

        {!vaultState && (
          <div className="text-center py-32 relative">
            <div className="relative inline-flex mb-8">
              <div className="w-24 h-24 rounded-3xl flex items-center justify-center relative" style={{ background: "linear-gradient(135deg, rgba(37, 99, 235, 0.15), rgba(124, 58, 237, 0.15))", border: "1px solid rgba(255,255,255,0.08)" }}>
                <Shield className="w-12 h-12 text-blue-400" />
              </div>
              <div className="absolute -inset-4 rounded-[28px] border border-white/[0.03] animate-pulse" />
            </div>
            <h2 className="text-3xl font-black text-white mb-3">SecureVault DApp</h2>
            <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
              Connect your wallet and enter a vault address to manage your secure vault.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
