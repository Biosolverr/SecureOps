# SecureOps
# SecureVault Hardhat Project

A production-ready Hardhat project repository for a secure, upgradeable vault with advanced protection mechanisms.

## Features
- **UUPS Upgradeable**: Future-proof with 48h timelock for upgrades.
- **State Machine**: INIT → FUNDED → LOCKED → EXECUTION_PENDING → EXECUTED / REFUNDED.
- **Quarantine System**: 12h pause mechanism protected by 0.01 ETH stake.
- **2-of-3 Recovery**: EIP-712 based account recovery (Owner + Guardian).
- **Flash Loan Protection**: Modifier checking for EOA origins.
- **Fee-on-Transfer Safe**: Handles tokens that deduct fees on transfer.
- **NFT Ready**: Supports ERC721 deposits.

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
Run the comprehensive suite of 15+ tests:
```bash
npx hardhat test
```

## Deployment
Create a `.env` file from `.env.example` and populate it.

### Deploy to Base Sepolia
```bash
npx hardhat run scripts/deploy.js --network baseSepolia
```

### Deploy to Base Mainnet
```bash
npx hardhat run scripts/deploy.js --network baseMainnet
```

## Contact Addresses
- **SecureVault**: [DEPLOYED_ADDRESS_HERE]

## License
MIT
