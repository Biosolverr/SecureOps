# SecureOps — SecureVault Hardhat Project

A production-ready Hardhat project for a secure, upgradeable vault with advanced protection mechanisms.

## Features

- **UUPS Upgradeable** — future-proof with 48h timelock for upgrades
- **State Machine** — `INIT → FUNDED → LOCKED → EXECUTION_PENDING → EXECUTED / REFUNDED`
- **Quarantine System** — 12h pause protected by 0.01 ETH stake; stake refunded if owner releases early
- **2-of-2 Recovery** — EIP-712 account recovery requiring distinct owner + guardian signatures
- **Flash Loan Protection** — `noFlashLoan` modifier blocks contract-originated calls (EOA only)
- **Fee-on-Transfer Safe** — balance diff check in `depositTokens`
- **NFT Ready** — `IERC721Receiver` support with recovery after vault closes
- **ReentrancyGuardUpgradeable** — OZ storage-layout-safe reentrancy protection
- **Rate-limited API** — backend enforces per-IP limits on AI endpoints

## Security Notes

- `noFlashLoan` uses `tx.origin != msg.sender`. This blocks proxy/contract callers but does **not** protect against EOA-relayed flash loans or ERC-4337 account abstraction — treat as a deterrent, not a guarantee.
- Quarantine stake (0.01 ETH) is returned to initiator if `releaseQuarantine()` is called by owner. If quarantine expires naturally, stake remains in the contract as a spam deterrent.
- The `receive()` fallback does **not** trigger quarantine — use `initiateQuarantine()` explicitly.

## Prerequisites

- Node.js v18+
- npm or yarn

## Installation

```bash
npm install
```

## Compilation

```bash
npx hardhat compile
```

## Testing

```bash
npx hardhat test
```

## Deployment

Copy `.env.example` to `.env` and fill in all values. **Do not deploy with the default `VAULT_SECRET`.**

### Base Sepolia

```bash
npx hardhat run scripts/deploy.js --network baseSepolia
```

### Base Mainnet

```bash
npx hardhat run scripts/deploy.js --network baseMainnet
```

After deployment, update `src/config.ts` with the printed `VAULT_ADDRESS`.

## Running the Local Dev Server

```bash
npm run dev
```

## Contract Addresses

- **SecureVault**: `[DEPLOYED_ADDRESS_HERE]`

## License

MIT
