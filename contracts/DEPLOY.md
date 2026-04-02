# Deploying PayAgentEscrow to Celo

## Prerequisites

1. **Node.js 18+** installed locally
2. **Deployer wallet funded** with CELO for gas
   - Alfajores testnet faucet: https://faucet.celo.org
   - You need ~0.1 CELO for deployment gas
3. **Alchemy app** with Celo Alfajores network enabled
   - Go to: https://dashboard.alchemy.com/apps/7th0b0ehcbopfr4h/networks
   - Enable **Celo Alfajores** (and optionally Celo Mainnet)

## Setup

```bash
cd contracts

# Create .env from the example
cp .env.example .env

# Fill in your values:
# DEPLOYER_PRIVATE_KEY=0xe5f060b807615bec039a1d216071bdb85891da15a597da59ba0be37a2e94b51a
# AI_AGENT_ADDRESS=<address derived from AI_AGENT_PRIVATE_KEY>
# ALCHEMY_KEY=XbS3A-psx-MSEn_ownjsb0You7sONhdF
# CELOSCAN_API_KEY=K5RCGPY5VRSU8ZP9TU96WJ2MN7M58TEPGP

npm install
```

## Deploy to Alfajores Testnet

```bash
npm run deploy:alfajores
```

Expected output:
```
=== PayAgentEscrow Deployment ===
Network:   alfajores (chainId: 44787)
Deployer:  0x...
Balance:   0.5 CELO
AI Agent:  0x...
cUSD:      0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1

Deploying PayAgentEscrow...

✅ PayAgentEscrow deployed!
Contract:  0x<YOUR_CONTRACT_ADDRESS>
Tx Hash:   0x...
Celoscan:  https://alfajores.celoscan.io/address/0x<YOUR_CONTRACT_ADDRESS>

══════════════════════════════════════════════════
NEXT STEP — Add this to Replit Secrets:
  CONTRACT_ADDRESS = 0x<YOUR_CONTRACT_ADDRESS>
  CELO_NETWORK     = alfajores
══════════════════════════════════════════════════
```

## After Deployment

1. Copy `CONTRACT_ADDRESS` from the output
2. Add it to **Replit Secrets** as `CONTRACT_ADDRESS`
3. The API server picks it up automatically — all `/api/escrow/*`, `/api/payments/*`, and `/api/receipts/*` endpoints become live

## Verify on Celoscan (Optional)

```bash
npx hardhat verify --network alfajores <CONTRACT_ADDRESS> \
  "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1" \
  "<AI_AGENT_ADDRESS>"
```

## Deploy to Mainnet

```bash
npm run deploy:celo
```

> ⚠️ Mainnet requires real CELO for gas. Double-check all addresses before deploying.

## Local Testing (no wallet needed)

```bash
# Run against local Hardhat node (no real tokens, instant)
npm run deploy:local

# Run the full test suite
npm test
```
