# Health Profile Contract Deployment Guide

## Overview

This guide will help you deploy the Health Profile smart contract to ZKsync Era Sepolia testnet. The contract stores encrypted health data (age, sex, height in ft/in, weight in lbs) and supports future ZK proof integration.

## Prerequisites

1. **Node.js** (v16 or higher)
2. **Private Key** for deployment (with testnet ETH)
3. **RPC URL** for ZKsync Sepolia (optional, defaults provided)

## Contract Features

### Data Structure

- **Birthdate**: Encrypted birthdate (YYYY-MM-DD format)
- **Sex**: Encrypted gender (M/F/Other)
- **Height**: Encrypted height in total inches (converted from ft/in)
- **Weight**: Encrypted weight in pounds (variable component)

### Key Functions

- `createProfile()` - Create new encrypted health profile
- `updateProfile()` - Update entire profile
- `updateWeight()` - Update only weight (most frequent change)
- `getProfile()` - Retrieve encrypted profile data
- `submitZKProof()` - Submit ZK proof for verification
- `verifyZKProof()` - Verify ZK proof (future implementation)

## Deployment Steps

### 1. Install Dependencies

```bash
cd Amach-Website
npm install ethers
```

### 2. Set Environment Variables

```bash
# Required: Your private key for deployment
export PRIVATE_KEY="your_private_key_here"

# Optional: Custom RPC URL (defaults to ZKsync Sepolia)
export RPC_URL="https://sepolia.era.zksync.dev"
```

### 3. Get Testnet ETH

Get testnet ETH from:

- [ZKsync Era Sepolia Faucet](https://faucet.quicknode.com/zksync-era-sepolia)
- [ZKsync Era Sepolia Faucet](https://portal.zksync.io/faucet)

### 4. Deploy Contract

```bash
node deploy-contract.js
```

### 5. Verify Deployment

The script will output:

- Contract address
- Deployment transaction hash
- Contract state verification
- Deployment info file location

## Contract Address

After deployment, you'll get a contract address like:

```
0x1234567890abcdef1234567890abcdef12345678
```

## Integration with Frontend

### 1. Update Environment Variables

Add to your `.env.local`:

```env
HEALTH_PROFILE_CONTRACT_ADDRESS=0x1234567890abcdef1234567890abcdef12345678
HEALTH_PROFILE_RPC_URL=https://sepolia.era.zksync.dev
```

### 2. Update Contract Configuration

Update `src/lib/zksync-sso-config.ts`:

```typescript
const healthProfileContractAddress =
  process.env.HEALTH_PROFILE_CONTRACT_ADDRESS;
```

### 3. Test Contract Interaction

Use the wallet components to:

- Create a health profile
- Update profile data
- Submit ZK proofs
- Verify data integrity

## Data Flow

### 1. User Input

```typescript
const healthData = {
  birthDate: "1990-01-01",
  sex: "M",
  height: { feet: 6, inches: 2 },
  weight: 180,
};
```

### 2. Encryption

```typescript
const encryptedData = encryptHealthProfile(healthData, encryptionKey);
```

### 3. On-Chain Storage

```typescript
await contract.createProfile(
  encryptedData.encryptedBirthDate,
  encryptedData.encryptedSex,
  encryptedData.encryptedHeight,
  encryptedData.encryptedWeight,
  encryptedData.dataHash,
);
```

### 4. ZK Proof Generation (Future)

```typescript
const proofInputs = generateZKProofInputs(healthData);
await contract.submitZKProof(proofInputs.proofHash, proofInputs.publicInputs);
```

## Security Considerations

1. **Encryption Keys**: Never store encryption keys on-chain
2. **Private Keys**: Keep deployment private key secure
3. **Data Validation**: Always validate data before encryption
4. **Access Control**: Implement proper access controls
5. **ZK Proofs**: Future implementation will add privacy guarantees

## Future Enhancements

1. **ZK Proof Integration**: Add actual ZK proof verification
2. **Multi-chain Support**: Deploy to multiple chains
3. **Advanced Encryption**: Implement homomorphic encryption
4. **Compliance**: Add HIPAA/GDPR compliance features
5. **Analytics**: Add privacy-preserving analytics

## Troubleshooting

### Common Issues

1. **Insufficient Balance**

   - Get more testnet ETH from faucets
   - Check gas price estimates

2. **RPC Connection Issues**

   - Verify RPC URL is correct
   - Check network connectivity

3. **Contract Deployment Fails**
   - Verify private key is correct
   - Check gas limits
   - Ensure sufficient balance

### Getting Help

- Check ZKsync Era documentation
- Review contract source code
- Test with small amounts first

## Next Steps

After successful deployment:

1. **Test Contract Functions**: Verify all functions work correctly
2. **Integrate Frontend**: Connect wallet to contract
3. **Test Encryption**: Verify data encryption/decryption
4. **Plan ZK Proofs**: Design ZK proof system
5. **Mainnet Deployment**: Deploy to production when ready

## Contract Addresses

### Testnet

- **ZKsync Sepolia**: `0x...` (Update after deployment)

### Mainnet

- **ZKsync Era**: `0x...` (To be deployed)

---

**Note**: This is a testnet deployment. For mainnet deployment, ensure thorough testing and security audits.
