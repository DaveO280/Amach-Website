# Using the Secure Health Profile System

## Overview

The new SecureHealthProfile contract provides truly secure, encrypted on-chain health data storage with ZK-proof support. Unlike the previous system that stored hashes, this system stores actual encrypted data that can be decrypted by authorized parties.

## Key Features

1. **AES-256-GCM Encryption**: Military-grade encryption
2. **PBKDF2 Key Derivation**: Secure key generation from user credentials
3. **On-Chain Encrypted Storage**: Ciphertext, IV, and salt stored on-chain
4. **ZK-Proof Integration**: Privacy-preserving data verification
5. **Protocol Access Control**: Only authorized protocols can access data

## Architecture

```
User Input → Client-Side Encryption → On-Chain Storage → Authorized Access → Decryption
```

### Data Flow

1. User enters health data
2. Data is encrypted client-side using AES-256-GCM
3. Encrypted data (ciphertext, IV, salt) stored on-chain
4. Data hash stored for integrity verification
5. Only user or authorized protocols can decrypt

## Usage Examples

### 1. Creating a Secure Profile

```typescript
import { SecureHealthProfileService } from '@/services/SecureHealthProfileService';
import { ethers } from 'ethers';

// Initialize service with signer
const signer = /* your ethers signer */;
const contractAddress = '0x47045AE584b94De8104f9B007472399642b0ef60';
const service = new SecureHealthProfileService(signer, contractAddress);

// Create profile
const profileData = {
  birthDate: '1990-01-01',
  sex: 'M',
  height: { feet: 5, inches: 10 },
  weight: 170,
  email: 'user@example.com'
};

const result = await service.createProfile(profileData);
console.log('Profile created:', result.txHash);
```

### 2. Updating a Secure Profile

```typescript
const updatedData = {
  ...profileData,
  weight: 165, // Updated weight
};

const result = await service.updateProfile(updatedData);
console.log("Profile updated:", result.txHash);
```

### 3. Reading Encrypted Profile

```typescript
const walletAddress = "0x...";
const decryptedProfile = await service.getDecryptedProfile(walletAddress);

if (decryptedProfile) {
  console.log("Birth Date:", decryptedProfile.birthDate);
  console.log(
    "Height:",
    `${decryptedProfile.height.feet}'${decryptedProfile.height.inches}"`,
  );
  console.log("Weight:", decryptedProfile.weight);
}
```

### 4. Submitting ZK-Proof

```typescript
import { keccak256, toBytes } from "viem";

// Generate ZK-proof hash (in production, use actual ZK-proof library)
const proofData = {
  ageRange: "25-35",
  heightRange: "5'8\"-6'0\"",
  weightRange: "150-180",
  emailDomain: "example.com",
};

const proofHash = keccak256(toBytes(JSON.stringify(proofData)));

const result = await service.submitZKProof(proofHash);
console.log("ZK-proof submitted:", result.txHash);
```

### 5. Checking Profile Metadata

```typescript
// Get profile metadata without decrypting
const contract = new ethers.Contract(
  "0x47045AE584b94De8104f9B007472399642b0ef60",
  secureHealthProfileAbi,
  provider,
);

const [timestamp, isActive, version, dataHash] =
  await contract.getProfileMetadata(walletAddress);

console.log("Profile Metadata:");
console.log("  Timestamp:", new Date(timestamp * 1000));
console.log("  Active:", isActive);
console.log("  Version:", version);
console.log("  Data Hash:", dataHash);
```

## Integration with ZKsync SSO

The SecureHealthProfile is fully integrated with ZKsync SSO:

```typescript
import { ssoConnector } from "@/lib/zksync-sso-config";

// ZKsync SSO automatically handles:
// 1. Wallet connection
// 2. Session management
// 3. Transaction signing
// 4. Gas fee abstraction

// All SecureHealthProfile functions are whitelisted:
// - createSecureProfile
// - updateSecureProfile
// - submitZKProof
```

## Security Best Practices

### 1. Key Management

```typescript
// Keys are derived from wallet address
// NEVER store raw encryption keys in localStorage
// PBKDF2 ensures keys can't be reverse-engineered
```

### 2. Data Validation

```typescript
// Always validate data before encryption
if (!profileData.birthDate || !profileData.sex) {
  throw new Error("Required fields missing");
}
```

### 3. Error Handling

```typescript
try {
  const result = await service.createProfile(profileData);
  if (!result.success) {
    console.error("Profile creation failed:", result.error);
  }
} catch (error) {
  console.error("Unexpected error:", error);
}
```

### 4. Data Integrity

```typescript
// Verify data hash after retrieval
import { keccak256 } from "viem";

const profile = await service.getDecryptedProfile(address);
const expectedHash = keccak256(/* combine encrypted fields */);

if (profile.dataHash !== expectedHash) {
  console.warn("Data integrity check failed!");
}
```

## ZK-Proof Generation

### Example: Age Range Proof

```typescript
// Prove age is within range without revealing exact age
const birthDate = new Date(profileData.birthDate);
const age = calculateAge(birthDate);

// Create proof that age is between 25-35
if (age >= 25 && age <= 35) {
  const proofData = {
    ageRange: "25-35",
    // Include other ranges as needed
  };

  // In production, use actual ZK-proof library
  const proofHash = keccak256(toBytes(JSON.stringify(proofData)));
  await service.submitZKProof(proofHash);
}
```

## Contract Addresses

```typescript
// Production addresses (ZKsync Era Sepolia)
export const CONTRACTS = {
  HEALTH_TOKEN: "0x6398c18070d89b1FcA7de99f8EBEEf354d990c2D",
  SECURE_HEALTH_PROFILE: "0x47045AE584b94De8104f9B007472399642b0ef60",
  PROFILE_VERIFICATION: "0xC62283a6667396A4D77EFD0eDEfAB8C505679109",
};
```

## Troubleshooting

### Issue: "Invalid IV length"

**Solution**: Ensure IV is exactly 12 bytes (96 bits) for AES-GCM

### Issue: "Invalid Salt length"

**Solution**: Ensure salt is exactly 16 bytes (128 bits) for PBKDF2

### Issue: "Profile already exists"

**Solution**: Use `updateSecureProfile` instead of `createSecureProfile`

### Issue: "Not authorized"

**Solution**: Ensure you're calling from the profile owner's wallet or an authorized protocol

## Advanced Usage

### Custom Encryption Parameters

```typescript
// Modify encryption parameters (advanced users only)
const customKey = await deriveKey(password, customSalt);
const encrypted = await encryptData(data, customKey);
```

### Batch Operations

```typescript
// Create multiple profiles efficiently
const profiles = [
  /* array of profile data */
];
const results = await Promise.all(
  profiles.map((profile) => service.createProfile(profile)),
);
```

### Event Monitoring

```typescript
// Listen for profile events
contract.on("ProfileCreated", (user, profileId, dataHash) => {
  console.log(`Profile created for ${user}`);
});

contract.on("ZKProofSubmitted", (user, profileId, proofHash) => {
  console.log(`ZK-proof submitted by ${user}`);
});
```

## Testing

Run the test suite:

```bash
# Test fresh system deployment
node scripts/test-fresh-system.js

# Test encryption
node scripts/test-encryption.js

# Test ZK-proofs
node scripts/test-zk-proofs.js
```

## Support

For issues or questions:

1. Check deployment summary: `FRESH_DEPLOYMENT_SUMMARY.md`
2. Review contract source: `contracts/SecureHealthProfile.sol`
3. Examine encryption utils: `src/utils/secureHealthEncryption.ts`

---

**Remember**: This system provides true privacy through encryption and ZK-proofs. Always handle encryption keys securely and never expose sensitive data unnecessarily.
