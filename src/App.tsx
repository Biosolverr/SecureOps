import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { VAULT_ADDRESS, VAULT_ABI } from "./config";
import {
  Shield, Lock, Unlock, Send, RotateCcw, AlertTriangle, CheckCircle2,
  Wallet, Copy, ExternalLink, Pause, Play, Key, ShieldAlert, Clock,
  ArrowRight, Coins, Image, RefreshCw, ChevronRight, Zap
} from "lucide-react";
const STATES = ["INIT", "FUNDED", "LOCKED", "EXECUTION_PENDING", "EXECUTED", "REFUNDED"];
const STATE_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#f97316", "#10b981", "#8b5cf6"];
const QUARANTINE_STAKE = ethers.parseEther("0.01");
export default function App() {
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [account, setAccount] = useState("");
  const [vaultAddress, setVaultAddress] = useState(VAULT_ADDRESS);
  const [vault, setVault] = useState<ethers.Contract | null>(null);
  const [vaultState, setVaultState] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [txStatus, setTxStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"actions" | "tokens" | "admin">("actions");
  const [depositAmount, setDepositAmount] = useState("");
  const [secret, setSecret] = useState("");
  const [tokenAddress, setTokenAddress] = useState("");
  const [tokenAmount, setTokenAmount] = useState("");
  const [recoverTo, setRecoverTo] = useState("");
  const [nftId, setNftId] = useState("");
  const [newImpl, setNewImpl] = useState("");
  const connectWallet = async () => {
    const eth = (window as any).ethereum;
    if (!eth) { alert("Install MetaMask"); return; }
    const p = new ethers.BrowserProvider(eth);
    const s = await p.getSigner();
    const addr = await s.getAddress();
    setProvider(p);
    setSigner(s);
    setAccount(addr);
  };
  const disconnect = () => {
    setProvider(null);
    setSigner(null);
    setAccount("");
    setVault(null);
    setVaultState(null);
    setVaultAddress("");
  };
  const loadVault = async (address: string) => {
    if (!provider || !address) return;
    try {
      const c = new ethers.Contract(address, VAULT_ABI, provider);
      const [state, owner, guardian, counterparty, commitmentHash, lockDuration, lockTimestamp, refundDelay, depositedEthAmount, quarantineEndTime, quarantineInitiator, nonce, paused] = await Promise.all([
        c.currentState(), c.owner(), c.guardian(), c.counterparty(), c.commitmentHash(),
        c.lockDuration(), c.lockTimestamp(), c.refundDelay(), c.depositedEthAmount(),
        c.quarantineEndTime(), c.quarantineInitiator(), c.nonce(), c.paused()
      ]);
      const balance = await provider.getBalance(address);
      setVaultState({ state: Number(state), owner, guardian, counterparty, commitmentHash, lockDuration: Number(lockDuration), lockTimestamp: Number(lockTimestamp), refundDelay: Number(refundDelay), depositedEthAmount, quarantineEndTime: Number(quarantineEndTime), quarantineInitiator, nonce: Number(nonce), paused, balance });
      if (signer) setVault(new ethers.Contract(address, VAULT_ABI, signer));
    } catch (err: any) {
      setTxStatus({ type: "error", msg: "Failed to load vault: " + err.message });
    }
  };
  const executeTx = async (fn: () => Promise<any>, label: string) => {
    setLoading(true);
    setTxStatus(null);
    try {
      const tx = await fn();
      await tx.wait();
      setTxStatus({ type: "success", msg: `${label} — confirmed` });
      if (vaultAddress) await loadVault(vaultAddress);
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
  useEffect(() => {
    if (vaultAddress && provider) loadVault(vaultAddress);
  }, [provider, signer, vaultAddress]);
  const StateBadge = ({ state }: { state: number }) => (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase" style={{ background: STATE_COLORS[state] + "20", color: STATE_COLORS[state], border: `1px solid ${STATE_COLORS[state]}40` }}>
      <span className="w-2 h-2 rounded-full" style={{ background: STATE_COLORS[state] }} />
      {STATES[state]}
    </span>
  );
  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-blue-400 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Shield className="text-white w-5 h-5" />
            </div>
            <div>
              <h1 className="font-black text-lg tracking-tight text-slate-900 uppercase">SecureVault</h1>
              <p className="text-[9px] text-slate-400 font-mono tracking-widest">PRODUCTION READY</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {account ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-xs font-mono text-blue-700">{shortAddr(account)}</span>
                </div>
                <button onClick={disconnect} className="text-xs text-slate-400 hover:text-red-500 transition-colors">Disconnect</button>
              </div>
            ) : (
              <button onClick={connectWallet} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-lg shadow-blue-600/20 active:scale-95">
                <Wallet className="w-4 h-4" /> Connect Wallet
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-8 p-6 bg-slate-50 border border-slate-200 rounded-2xl">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 block">Vault Contract Address</label>
          <div className="flex gap-3">
            <input
              value={vaultAddress}
              onChange={(e) => setVaultAddress(e.target.value)}
              placeholder="0x..."
              className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl font-mono text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
            />
            <button onClick={() => vaultAddress && loadVault(vaultAddress)} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all active:scale-95">
              Load
            </button>
          </div>
          <p className="text-[10px] text-slate-400 mt-2">Address from config.ts — deploy vault, then update this file</p>
        </div>
        {vaultState && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="p-4 bg-white border border-slate-200 rounded-xl">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">State</p>
                <StateBadge state={vaultState.state} />
              </div>
              <div className="p-4 bg-white border border-slate-200 rounded-xl">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Balance</p>
                <p className="text-xl font-black text-slate-900">{formatEth(vaultState.balance)} <span className="text-sm text-slate-400">ETH</span></p>
              </div>
              <div className="p-4 bg-white border border-slate-200 rounded-xl">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Paused</p>
                <p className={`text-sm font-bold ${vaultState.paused ? "text-red-500" : "text-green-500"}`}>{vaultState.paused ? "YES" : "NO"}</p>
              </div>
              <div className="p-4 bg-white border border-slate-200 rounded-xl">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Quarantine</p>
                <p className="text-sm font-bold text-slate-700">{vaultState.quarantineEndTime > Date.now() / 1000 ? `Active — ${timeLeft(vaultState.quarantineEndTime)}` : "None"}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              {[
                { label: "Owner", addr: vaultState.owner, color: "blue" },
                { label: "Guardian", addr: vaultState.guardian, color: "purple" },
                { label: "Counterparty", addr: vaultState.counterparty, color: "emerald" }
              ].map(r => (
                <div key={r.label} className={`p-4 bg-white border rounded-xl ${account && r.addr.toLowerCase() === account ? "border-blue-400 ring-2 ring-blue-100" : "border-slate-200"}`}>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{r.label}</p>
                  <p className="font-mono text-xs text-slate-600 break-all">{r.addr}</p>
                  {account && r.addr.toLowerCase() === account && <span className="text-[9px] text-blue-500 font-bold mt-1 inline-block">← YOU</span>}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-slate-400 font-bold">Lock Duration</span>
                <p className="font-mono text-slate-700 mt-1">{vaultState.lockDuration}s ({Math.floor(vaultState.lockDuration / 3600)}h)</p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-slate-400 font-bold">Lock Timestamp</span>
                <p className="font-mono text-slate-700 mt-1">{formatTime(vaultState.lockTimestamp)}</p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-slate-400 font-bold">Refund Delay</span>
                <p className="font-mono text-slate-700 mt-1">{vaultState.refundDelay}s ({Math.floor(vaultState.refundDelay / 3600)}h)</p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-slate-400 font-bold">Deposited</span>
                <p className="font-mono text-slate-700 mt-1">{formatEth(vaultState.depositedEthAmount)} ETH</p>
              </div>
            </div>
            {txStatus && (
              <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 ${txStatus.type === "success" ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
                {txStatus.type === "success" ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                <span className="text-sm font-medium">{txStatus.msg}</span>
              </div>
            )}
            <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-xl w-fit">
              {[
                { key: "actions" as const, label: "Actions", icon: Zap },
                { key: "tokens" as const, label: "Tokens", icon: Coins },
                { key: "admin" as const, label: "Admin", icon: ShieldAlert }
              ].map(t => (
                <button key={t.key} onClick={() => setActiveTab(t.key)} className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${activeTab === t.key ? "bg-white shadow text-blue-600" : "text-slate-400 hover:text-slate-600"}`}>
                  <t.icon className="w-4 h-4" /> {t.label}
                </button>
              ))}
            </div>
            {activeTab === "actions" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-6 bg-white border border-slate-200 rounded-2xl">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center"><Send className="w-5 h-5 text-blue-600" /></div>
                    <div>
                      <h3 className="font-bold text-sm">Deposit ETH</h3>
                      <p className="text-[10px] text-slate-400">State: INIT → FUNDED</p>
                    </div>
                  </div>
                  <input value={depositAmount} onChange={e => setDepositAmount(e.target.value)} placeholder="Amount in ETH" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono mb-3 outline-none focus:border-blue-400" />
                  <button onClick={handleDeposit} disabled={loading || vaultState.state !== 0} className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all">
                    {loading ? "Processing..." : "Deposit"}
                  </button>
                </div>
                <div className="p-6 bg-white border border-slate-200 rounded-2xl">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center"><Lock className="w-5 h-5 text-amber-600" /></div>
                    <div>
                      <h3 className="font-bold text-sm">Lock Vault</h3>
                      <p className="text-[10px] text-slate-400">State: FUNDED → LOCKED</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mb-4">Locks vault for {Math.floor(vaultState.lockDuration / 3600)} hours. Only owner can lock.</p>
                  <button onClick={handleLock} disabled={loading || vaultState.state !== 1 || !isOwner} className="w-full py-3 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all">
                    {loading ? "Processing..." : isOwner ? "Lock" : "Owner Only"}
                  </button>
                </div>
                <div className="p-6 bg-white border border-slate-200 rounded-2xl">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center"><Key className="w-5 h-5 text-orange-600" /></div>
                    <div>
                      <h3 className="font-bold text-sm">Initiate Execution</h3>
                      <p className="text-[10px] text-slate-400">State: LOCKED → EXECUTION_PENDING</p>
                    </div>
                  </div>
                  <input value={secret} onChange={e => setSecret(e.target.value)} placeholder="Enter secret to reveal" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono mb-3 outline-none focus:border-blue-400" />
                  <button onClick={handleInitiateExecution} disabled={loading || vaultState.state !== 2} className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all">
                    {loading ? "Processing..." : "Reveal Secret"}
                  </button>
                </div>
                <div className="p-6 bg-white border border-slate-200 rounded-2xl">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-emerald-600" /></div>
                    <div>
                      <h3 className="font-bold text-sm">Execute</h3>
                      <p className="text-[10px] text-slate-400">State: EXECUTION_PENDING → EXECUTED</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mb-4">Sends {formatEth(vaultState.depositedEthAmount)} ETH to counterparty.</p>
                  <button onClick={handleExecute} disabled={loading || vaultState.state !== 3 || (!isOwner && !isCounterparty)} className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all">
                    {loading ? "Processing..." : isOwner || isCounterparty ? "Execute" : "Owner/Counterparty Only"}
                  </button>
                </div>
                <div className="p-6 bg-white border border-slate-200 rounded-2xl">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center"><RotateCcw className="w-5 h-5 text-purple-600" /></div>
                    <div>
                      <h3 className="font-bold text-sm">Refund</h3>
                      <p className="text-[10px] text-slate-400">State: FUNDED/LOCKED → REFUNDED</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mb-4">Returns ETH to owner. Available from FUNDED or after lock + delay.</p>
                  <button onClick={handleRefund} disabled={loading || !isOwner || (vaultState.state !== 1 && vaultState.state !== 2)} className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all">
                    {loading ? "Processing..." : isOwner ? "Refund" : "Owner Only"}
                  </button>
                </div>
                <div className="p-6 bg-white border border-slate-200 rounded-2xl">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-red-600" /></div>
                    <div>
                      <h3 className="font-bold text-sm">Quarantine</h3>
                      <p className="text-[10px] text-slate-400">Pauses vault for 12h (0.01 ETH stake)</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={handleQuarantine} disabled={loading} className="flex-1 py-3 bg-red-500 hover:bg-red-600 disabled:bg-slate-200 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all">
                      {loading ? "..." : "Activate"}
                    </button>
                    <button onClick={handleReleaseQuarantine} disabled={loading || !isOwner || vaultState.quarantineEndTime <= Date.now() / 1000} className="flex-1 py-3 bg-slate-200 hover:bg-slate-300 disabled:bg-slate-100 text-slate-600 rounded-xl text-xs font-bold uppercase tracking-wider transition-all">
                      {loading ? "..." : "Release"}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {activeTab === "tokens" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-6 bg-white border border-slate-200 rounded-2xl">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center"><Coins className="w-5 h-5 text-blue-600" /></div>
                    <div>
                      <h3 className="font-bold text-sm">Deposit ERC20</h3>
                      <p className="text-[10px] text-slate-400">Transfer tokens to vault</p>
                    </div>
                  </div>
                  <input value={tokenAddress} onChange={e => setTokenAddress(e.target.value)} placeholder="Token contract address" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono mb-3 outline-none focus:border-blue-400" />
                  <input value={tokenAmount} onChange={e => setTokenAmount(e.target.value)} placeholder="Amount" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono mb-3 outline-none focus:border-blue-400" />
                  <button onClick={handleDepositTokens} disabled={loading} className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all">
                    {loading ? "Processing..." : "Deposit Tokens"}
                  </button>
                </div>
                <div className="p-6 bg-white border border-slate-200 rounded-2xl">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center"><RefreshCw className="w-5 h-5 text-green-600" /></div>
                    <div>
                      <h3 className="font-bold text-sm">Recover ERC20</h3>
                      <p className="text-[10px] text-slate-400">After vault closed (EXECUTED/REFUNDED)</p>
                    </div>
                  </div>
                  <input value={tokenAddress} onChange={e => setTokenAddress(e.target.value)} placeholder="Token address" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono mb-3 outline-none focus:border-blue-400" />
                  <input value={recoverTo} onChange={e => setRecoverTo(e.target.value)} placeholder="Recover to address" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono mb-3 outline-none focus:border-blue-400" />
                  <button onClick={handleRecoverTokens} disabled={loading || !isOwner || (vaultState.state !== 4 && vaultState.state !== 5)} className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-200 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all">
                    {loading ? "Processing..." : "Recover Tokens"}
                  </button>
                </div>
                <div className="p-6 bg-white border border-slate-200 rounded-2xl">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-pink-50 rounded-xl flex items-center justify-center"><Image className="w-5 h-5 text-pink-600" /></div>
                    <div>
                      <h3 className="font-bold text-sm">Recover NFT</h3>
                      <p className="text-[10px] text-slate-400">Recover ERC721 after vault closed</p>
                    </div>
                  </div>
                  <input value={tokenAddress} onChange={e => setTokenAddress(e.target.value)} placeholder="NFT contract address" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono mb-3 outline-none focus:border-blue-400" />
                  <input value={recoverTo} onChange={e => setRecoverTo(e.target.value)} placeholder="Recover to address" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono mb-3 outline-none focus:border-blue-400" />
                  <input value={nftId} onChange={e => setNftId(e.target.value)} placeholder="Token ID" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono mb-3 outline-none focus:border-blue-400" />
                  <button onClick={handleRecoverNFT} disabled={loading || !isOwner || (vaultState.state !== 4 && vaultState.state !== 5)} className="w-full py-3 bg-pink-600 hover:bg-pink-700 disabled:bg-slate-200 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all">
                    {loading ? "Processing..." : "Recover NFT"}
                  </button>
                </div>
              </div>
            )}
            {activeTab === "admin" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-6 bg-white border border-slate-200 rounded-2xl">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                      {vaultState.paused ? <Play className="w-5 h-5 text-green-600" /> : <Pause className="w-5 h-5 text-red-600" />}
                    </div>
                    <div>
                      <h3 className="font-bold text-sm">{vaultState.paused ? "Unpause" : "Pause"}</h3>
                      <p className="text-[10px] text-slate-400">Emergency stop for all operations</p>
                    </div>
                  </div>
                  <button onClick={vaultState.paused ? handleUnpause : handlePause} disabled={loading || !isOwner} className="w-full py-3 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-200 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all">
                    {loading ? "Processing..." : vaultState.paused ? "Unpause" : "Pause Vault"}
                  </button>
                </div>
                <div className="p-6 bg-white border border-slate-200 rounded-2xl">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center"><ArrowRight className="w-5 h-5 text-indigo-600" /></div>
                    <div>
                      <h3 className="font-bold text-sm">Schedule Upgrade</h3>
                      <p className="text-[10px] text-slate-400">48h timelock required</p>
                    </div>
                  </div>
                  <input value={newImpl} onChange={e => setNewImpl(e.target.value)} placeholder="New implementation address" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono mb-3 outline-none focus:border-blue-400" />
                  <button onClick={handleScheduleUpgrade} disabled={loading || !isOwner} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all">
                    {loading ? "Processing..." : "Schedule Upgrade"}
                  </button>
                </div>
                <div className="p-6 bg-blue-50 border border-blue-200 rounded-2xl md:col-span-2">
                  <h3 className="font-bold text-sm text-blue-800 mb-2">Vault Information</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                    <div>
                      <span className="text-blue-400 font-bold">Address</span>
                      <p className="font-mono text-blue-700 mt-1 break-all">{vaultAddress}</p>
                    </div>
                    <div>
                      <span className="text-blue-400 font-bold">Commitment Hash</span>
                      <p className="font-mono text-blue-700 mt-1 break-all">{shortAddr(vaultState.commitmentHash)}</p>
                    </div>
                    <div>
                      <span className="text-blue-400 font-bold">Nonce</span>
                      <p className="font-mono text-blue-700 mt-1">{vaultState.nonce}</p>
                    </div>
                    <div>
                      <span className="text-blue-400 font-bold">Refund Delay</span>
                      <p className="font-mono text-blue-700 mt-1">{Math.floor(vaultState.refundDelay / 3600)}h</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        {!vaultState && (
          <div className="text-center py-32">
            <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Shield className="w-10 h-10 text-blue-400" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-2">SecureVault DApp</h2>
            <p className="text-sm text-slate-400 max-w-md mx-auto">Connect your wallet and enter a vault address to manage your secure vault.</p>
          </div>
        )}
      </main>
    </div>
  );
}
