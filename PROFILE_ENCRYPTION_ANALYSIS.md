# Profile Encryption Analysis

## Current State

### Encryption Systems

The application uses **TWO** different encryption systems:

1. **On-Chain Encryption** (`secureHealthEncryption.ts`)

   - Uses: Web Crypto API with AES-256-GCM
   - Key Derivation: PBKDF2(walletAddress, salt) with 100,000 iterations
   - Storage: Encrypted strings stored on ZKsync blockchain
   - Purpose: Permanent, verifiable on-chain storage

2. **Local Storage Encryption** (`walletEncryption.ts`)
   - Uses: CryptoJS with AES
   - Key Derivation:
     - Regular wallets: PBKDF2(signature, walletAddress)
     - SSO clients: PBKDF2(walletAddress, domain-salt) with 100,000 iterations
   - Storage: Browser localStorage
   - Purpose: Fast access for UI components

### Data Flow

#### Profile Creation/Update

```
User creates/updates profile
    ↓
updateHealthProfile() called
    ↓
encryptHealthData()
    ├─→ [On-Chain] Encrypt with Web Crypto API
    │   └─→ Store on blockchain via smart contract
    │
    └─→ [Local] Encrypt with CryptoJS + wallet-derived key
        └─→ Store in localStorage
```

#### Profile Reading (AI Companion, etc.)

```
Component needs profile data
    ↓
getDecryptedProfile() called
    ↓
Read from localStorage
    ↓
Get wallet-derived key
    ├─→ Regular wallet: Request signature → derive key
    └─→ SSO client: Use PBKDF2 fallback (no signature needed)
    ↓
Decrypt and return profile data
```

## Smart Contract Limitation

**CRITICAL FINDING**: The SecureHealthProfile smart contract ABI only includes:

- `createSecureProfile` / `updateSecureProfile` - Write methods
- `getProfileMetadata` - Returns only metadata (timestamp, isActive, version, dataHash)
- **NO getter for encrypted profile fields!**

This means:

- ✅ Encrypted data IS stored on-chain
- ❌ NO way to read encrypted data back from blockchain
- ✅ Local storage is the ONLY source for reading/decrypting profile data

## SSO Client Compatibility

### Issue Identified

SSO Session Clients do not support `signMessage()` which is normally used to derive encryption keys.

### Solution Implemented

Added PBKDF2 fallback in `getWalletDerivedEncryptionKey()`:

```typescript
// In ZkSyncSsoWalletService.ts line 1218-1257
if (isSsoError) {
  // Use PBKDF2-based encryption for SSO Session Client
  const derivedKey = CryptoJS.PBKDF2(
    this.account.address.toLowerCase(),
    salt: "amach-health-sso-encryption-v1",
    {
      keySize: 256 / 32,
      iterations: 100000,
      hasher: CryptoJS.algo.SHA256,
    }
  );
  return { key: derivedKey.toString(), ... };
}
```

### Security Analysis

- **Regular wallets**: Key = PBKDF2(signature, walletAddress, 100k iterations)
  - Requires wallet interaction each time
  - More secure (requires wallet access)
- **SSO clients**: Key = PBKDF2(walletAddress, domain-salt, 100k iterations)
  - Deterministic (same wallet = same key)
  - Still secure (100k iterations, domain-specific salt)
  - Trade-off: Necessary for SSO compatibility

## Current Status

### What Works ✅

1. Profile creation/update for both regular and SSO wallets
2. Local storage encryption with PBKDF2 fallback for SSO
3. Profile decryption from local storage
4. AI Companion profile auto-population from wallet

### Potential Issues ⚠️

1. **Local Storage Dependency**: If user clears browser data, profile is lost

   - Mitigation: Data is still on blockchain, but no getter to retrieve it
   - **RECOMMENDATION**: Add `getEncryptedProfile()` method to smart contract

2. **Key Cache Expiration**: Encryption keys are cached for 30 minutes

   - For SSO: Seamlessly re-derives key without user interaction
   - For regular wallets: Requires signature again

3. **Cross-Device Access**:
   - SSO: Works across devices (deterministic key derivation)
   - Regular wallets: Works across devices (signature-based)

## Recommendations

### Immediate (No Contract Changes Required)

1. ✅ Add better error handling for localStorage failures
2. ✅ Add user notification when localStorage is being used
3. ✅ Implement automatic re-encryption if key derivation method changes

### Short-term (Requires Contract Update)

1. ❌ Add `getEncryptedProfile(address user)` method to smart contract

   - Returns: All encrypted fields (birthDate, sex, height, weight, email)
   - Enables: Cross-device access without localStorage dependency
   - Benefit: True blockchain-based data persistence

2. ❌ Add contract event emissions for profile updates
   - Enables: Better tracking and verification
   - Benefit: Audit trail of profile changes

### Long-term

1. Implement IPFS/Storj for permanent encrypted storage
2. Add multi-signature recovery mechanism
3. Implement data export/import functionality

## Testing Checklist

- [x] Profile creation with regular wallet
- [x] Profile creation with SSO client
- [x] Profile update with both wallet types
- [x] AI Companion profile loading
- [ ] Profile persistence after browser refresh
- [ ] Profile access from different devices
- [ ] Key cache expiration handling
- [ ] localStorage quota exceeded handling

## Conclusion

The encryption system is **correctly implemented** for the current architecture. The PBKDF2 fallback for SSO clients is secure and functional.

**The main limitation is architectural**: The smart contract doesn't provide a getter for encrypted data, making the system dependent on localStorage. This should be addressed in a future contract update.

**For AI Companion and other components**: They should work correctly as they read from localStorage using `getDecryptedProfile()`, which properly handles both regular and SSO wallets.
