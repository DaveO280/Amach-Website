# Network Configuration Guide

## Overview

The network configuration system allows you to easily switch between **testnet** and **mainnet** using a single environment variable.

## Quick Start

### For Testnet (Default)

```bash
# In your .env.local file
NEXT_PUBLIC_NETWORK=testnet
# Or simply omit it (testnet is the default)
```

### For Mainnet

```bash
# In your .env.local file
NEXT_PUBLIC_NETWORK=mainnet
```

## How It Works

### 1. Network Selection

The system automatically detects the network from `NEXT_PUBLIC_NETWORK`:

- `testnet` → zkSync Sepolia Testnet (Chain ID: 300)
- `mainnet` → zkSync Mainnet (Chain ID: 324)
- Default: `testnet` if not specified

### 2. Contract Addresses

Contract addresses are automatically selected based on the network:

**Testnet Contracts:**

- Profile Verification: `0xA2D3b1b8080895C5bE335d8352D867e4b6e51ab3`
- Secure Health Profile: `0x2A8015613623A6A8D369BcDC2bd6DD202230785a`
- Health Token: `0x057df807987f284b55ba6A9ab89d089fd8398B99`

**Mainnet Contracts:**

- ⚠️ **TODO**: Update these after deploying to mainnet
- Currently set to placeholder addresses (`0x0000...`)

### 3. Usage in Code

```typescript
import {
  getActiveChain,
  getContractAddresses,
  getCurrentNetwork,
} from "@/lib/networkConfig";

// Get the active chain (testnet or mainnet)
const chain = getActiveChain();

// Get contract addresses for current network
const contracts = getContractAddresses();
const profileContract = contracts.PROFILE_VERIFICATION_CONTRACT;

// Check current network
const isMainnet = getCurrentNetwork() === "mainnet";
```

## Migration Steps

### Step 1: Deploy Contracts to Mainnet

1. Deploy all contracts to zkSync Mainnet
2. Save the contract addresses

### Step 2: Update Mainnet Addresses

Edit `src/lib/networkConfig.ts`:

```typescript
mainnet: {
  PROFILE_VERIFICATION_CONTRACT: "0x...", // Your mainnet address
  SECURE_HEALTH_PROFILE_CONTRACT: "0x...", // Your mainnet address
  HEALTH_TOKEN_CONTRACT: "0x...", // Your mainnet address
  HEALTH_PROFILE_CONTRACT: "0x...", // Your mainnet address
},
```

### Step 3: Switch to Mainnet

Update your `.env.local`:

```bash
NEXT_PUBLIC_NETWORK=mainnet
```

### Step 4: Restart Your App

```bash
npm run dev
# or
pnpm dev
```

## Important Notes

### ✅ Wallet Compatibility

- **Privy embedded wallets work on both networks**
- The same wallet address works on testnet and mainnet
- You don't need to create a new wallet when switching networks

### ⚠️ Data Separation

- Testnet data is completely separate from mainnet
- Profiles, verifications, and tokens on testnet don't exist on mainnet
- This is by design - testnet is for testing only

### 🔒 Security

- Always test on testnet first
- Verify all functionality before switching to mainnet
- Double-check contract addresses before production deployment

## Testing

### Test Network Configuration

```typescript
import { networkConfig } from "@/lib/networkConfig";

console.log("Current Network:", networkConfig.current);
console.log("Chain ID:", networkConfig.chain.id);
console.log("Is Testnet:", networkConfig.isTestnet);
console.log("Contracts:", networkConfig.contracts);
```

### Switch Networks for Testing

You can temporarily override the network in code for testing:

```typescript
// Force testnet (for testing only)
process.env.NEXT_PUBLIC_NETWORK = "testnet";

// Force mainnet (for testing only)
process.env.NEXT_PUBLIC_NETWORK = "mainnet";
```

## Environment Variables

### Required

- `NEXT_PUBLIC_NETWORK` - Set to `testnet` or `mainnet` (default: `testnet`)

### Optional (for Privy)

- `NEXT_PUBLIC_PRIVY_APP_ID` - Your Privy app ID

## Troubleshooting

### Issue: Wrong network selected

**Solution**: Check your `.env.local` file and ensure `NEXT_PUBLIC_NETWORK` is set correctly.

### Issue: Contract calls failing

**Solution**:

1. Verify contract addresses are correct for the selected network
2. Ensure contracts are deployed to the correct network
3. Check that your wallet is connected to the correct network

### Issue: Wallet not connecting

**Solution**: Privy wallets work on both networks automatically. If issues persist, check your Privy app configuration.

## Files Modified

- `src/lib/networkConfig.ts` - Main network configuration
- `src/lib/zkSyncChain.ts` - Re-exports for backward compatibility
- `src/hooks/usePrivyWalletService.ts` - Updated to use network config
- `src/app/test-privy-readonly/page.tsx` - Updated to use network config

## Next Steps

1. ✅ Test on testnet (current setup)
2. ⏳ Deploy contracts to mainnet
3. ⏳ Update mainnet contract addresses in `networkConfig.ts`
4. ⏳ Switch to mainnet when ready for production
