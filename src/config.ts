export const VAULT_ADDRESS = "0x9f94712cc394F3Dd5DfaAab37D7f1189eCA8Fc49";

export const VAULT_ABI = [
  // ─── State variables (view) ───────────────────────────────────────────
  "function currentState() view returns (uint8)",
  "function counterparty() view returns (address)",
  "function guardian() view returns (address)",
  "function owner() view returns (address)",
  "function commitmentHash() view returns (bytes32)",
  "function lockDuration() view returns (uint256)",
  "function lockTimestamp() view returns (uint256)",
  "function refundDelay() view returns (uint256)",
  "function depositedEthAmount() view returns (uint256)",
  "function quarantineEndTime() view returns (uint256)",
  "function quarantineInitiator() view returns (address)",
  "function nonce() view returns (uint256)",
  "function paused() view returns (bool)",

  // ─── Constants & timelock (view) ─────────────────────────────────────
  "function QUARANTINE_STAKE() view returns (uint256)",
  "function UPGRADE_DELAY() view returns (uint256)",
  "function upgradeTimelock() view returns (uint256)",
  "function pendingImplementation() view returns (address)",
  "function GUARDIAN_ROLE() view returns (bytes32)",
  "function COUNTERPARTY_ROLE() view returns (bytes32)",

  // ─── Roles ───────────────────────────────────────────────────────────
  "function hasRole(bytes32 role, address account) view returns (bool)",

  // ─── Integrity ───────────────────────────────────────────────────────
  "function assertFundIntegrity() view",

  // ─── Admin ───────────────────────────────────────────────────────────
  "function pause()",
  "function unpause()",
  "function scheduleUpgrade(address newImplementation)",

  // ─── Core vault flow ─────────────────────────────────────────────────
  "function deposit() payable",
  "function lock()",
  "function initiateExecution(bytes32 secret)",
  "function execute()",
  "function refund()",

  // ─── Quarantine ──────────────────────────────────────────────────────
  "function initiateQuarantine() payable",
  "function releaseQuarantine()",

  // ─── Token / NFT recovery ────────────────────────────────────────────
  "function depositTokens(address token, uint256 amount)",
  "function recoverTokens(address token, address to)",
  "function recoverNFT(address token, address to, uint256 tokenId)",

  // ─── Account recovery (EIP-712) ──────────────────────────────────────
  "function recoverAccount(address newOwner, uint256 deadline, bytes ownerSignature, bytes guardianSignature)",

  // ─── Events ──────────────────────────────────────────────────────────
  "event Deposited(address indexed sender, uint256 indexed amount, uint256 timestamp)",
  "event StateChanged(uint8 indexed from, uint8 indexed to, uint256 timestamp)",
  "event SecretRevealed(bytes32 indexed secretHash)",
  "event Quarantined(address indexed initiator, uint256 indexed endTime)",
  "event QuarantineReleased(address indexed initiator, uint256 stakeRefunded)",
  "event Refunded(address indexed recipient, uint256 indexed amount, uint256 timestamp)",
  "event TokensRecovered(address indexed token, address indexed to, uint256 indexed amount)",
  "event NFTRecovered(address indexed token, address indexed to, uint256 indexed tokenId)",
];
