# SecureHealthProfile V3 Upgrade Guide

## Overview

V3 adds the **weight field** to the health profile contract, moving it from localStorage to on-chain encrypted storage. This ensures weight is synchronized with other profile data.

## What Changed

### Contract Additions (V3)

- ✨ **New Field**: `encryptedWeight` (stored in separate mapping for storage compatibility)
- ✨ **New Functions**:
  - `createProfileWithWeight()` - Create profile with weight
  - `updateProfileWithWeight()` - Update profile with weight
  - `updateWeight()` - Update only weight (gas-efficient)
  - `getProfileWithWeight()` - Get profile including weight
  - `getWeight()` - Get just the weight

### Why This Architecture?

- **UUPS Upgradeable**: Can't modify existing struct without breaking storage layout
- **Solution**: Added separate `mapping(address => string) private encryptedWeights`
- **Result**: Backwards compatible, no data loss, clean upgrade path

## Deployment Steps

### 1. Pre-Deployment Checklist

```bash
# Ensure you're on the right network
export NETWORK=testnet  # or mainnet

# Check your wallet has funds
npx hardhat run scripts/check-wallet-balance.js --network zksyncSepolia

# Verify you're the contract owner
# Current owner should be your deployer address
```

### 2. Compile V3 Contract

```bash
npx hardhat compile
```

### 3. Run Upgrade Script

```bash
npx hardhat run scripts/upgrade-to-v3.js --network zksyncSepolia
```

**What this does:**

1. Deploys new V3 implementation contract
2. Calls `upgradeTo()` on existing proxy
3. Verifies upgrade succeeded
4. Tests V3 functions
5. Saves deployment info to `deployments/upgrade-to-v3-{timestamp}.json`

### 4. Verify Upgrade

The script will output:

```
✅ UPGRADE TO V3 COMPLETE!

📋 Summary:
  • Proxy (永 unchanged): 0x2A8015613623A6A8D369BcDC2bd6DD202230785a
  • V3 Implementation: 0x[NEW_ADDRESS]
  • Version: 3
  • Profiles preserved: [COUNT]
```

**Key Points:**

- ✅ Proxy address **stays the same** - no frontend config changes needed
- ✅ All existing profiles preserved
- ✅ V2 functions still work (backwards compatible)
- ✅ V3 functions immediately available

## Frontend Integration

### Files to Update

1. **src/hooks/usePrivyWalletService.ts**

   - Update `createHealthProfile()` to use `createProfileWithWeight`
   - Update `updateHealthProfile()` to use `updateProfileWithWeight`
   - Add `updateWeight()` function for quick weight updates
   - Update `loadHealthProfile()` to use `getProfileWithWeight`

2. **src/components/HealthProfileManager.tsx**

   - Update form submission to include weight
   - Add weight-only update function

3. **src/components/WalletSetupWizard.tsx**
   - Update initial profile creation to include weight
   - Remove localStorage weight storage

### Code Changes

#### Before (V2):

```typescript
// Creating profile
await walletClient.writeContract({
  address: SECURE_HEALTH_PROFILE_CONTRACT,
  abi: secureHealthProfileAbi,
  functionName: "createProfile",
  args: [
    encryptedBirthDate,
    encryptedSex,
    encryptedHeight,
    encryptedEmail,
    dataHash,
    nonce,
  ],
});

// Weight in localStorage
localStorage.setItem(`weight-${address}`, encryptedWeight);
```

#### After (V3):

```typescript
// Creating profile with weight
await walletClient.writeContract({
  address: SECURE_HEALTH_PROFILE_CONTRACT,
  abi: secureHealthProfileAbi,
  functionName: "createProfileWithWeight",
  args: [
    encryptedBirthDate,
    encryptedSex,
    encryptedHeight,
    encryptedWeight, // ← Now on-chain!
    encryptedEmail,
    dataHash,
    nonce,
  ],
});

// No localStorage needed!
```

#### Quick Weight Update:

```typescript
// Gas-efficient weight-only update
await walletClient.writeContract({
  address: SECURE_HEALTH_PROFILE_CONTRACT,
  abi: secureHealthProfileAbi,
  functionName: "updateWeight",
  args: [encryptedWeight],
});
```

#### Reading Profile:

```typescript
// Get profile with weight
const profileData = await publicClient.readContract({
  address: SECURE_HEALTH_PROFILE_CONTRACT,
  abi: secureHealthProfileAbi,
  functionName: "getProfileWithWeight",
  args: [userAddress],
});

// profileData now includes encryptedWeight at index 3
const [
  encryptedBirthDate,
  encryptedSex,
  encryptedHeight,
  encryptedWeight, // ← Index 3
  encryptedEmail,
  dataHash,
  timestamp,
  isActive,
  version,
  nonce,
] = profileData;
```

## Migration Plan

### Existing Users (localStorage Weight)

For users who have weight in localStorage but not on-chain:

```typescript
// Migration helper
async function migrateWeightToBlockchain(address: string) {
  // 1. Get localStorage weight
  const localWeight = localStorage.getItem(`weight-${address}`);

  if (localWeight) {
    // 2. Update on-chain
    await walletClient.writeContract({
      address: SECURE_HEALTH_PROFILE_CONTRACT,
      abi: secureHealthProfileAbi,
      functionName: "updateWeight",
      args: [localWeight],
    });

    // 3. Remove from localStorage
    localStorage.removeItem(`weight-${address}`);

    console.log("✅ Weight migrated to blockchain");
  }
}
```

## Testing Checklist

After deployment and frontend updates:

- [ ] **Create new profile with weight** - Verify weight is stored on-chain
- [ ] **Load existing profile** - Verify old profiles still load
- [ ] **Update weight only** - Test `updateWeight()` function
- [ ] **Update full profile** - Test `updateProfileWithWeight()`
- [ ] **Verify encryption** - Ensure weight is encrypted properly
- [ ] **Check gas costs** - Compare to V2 profile updates
- [ ] **Test on testnet first** - Full flow before mainnet

## Rollback Plan

If something goes wrong:

1. **DO NOT PANIC** - Proxy keeps all data safe
2. **Option A**: Deploy V2 implementation again and `upgradeTo()` it
3. **Option B**: Fix V3 contract, redeploy implementation, `upgradeTo()` fixed version
4. **Proxy address never changes** - Users unaffected

## Gas Cost Analysis

Estimated gas costs on zkSync:

| Operation          | V2 (without weight) | V3 (with weight) | Difference |
| ------------------ | ------------------- | ---------------- | ---------- |
| Create Profile     | ~0.001 ETH          | ~0.0012 ETH      | +20%       |
| Update Profile     | ~0.0008 ETH         | ~0.001 ETH       | +25%       |
| Update Weight Only | N/A                 | ~0.0003 ETH      | New!       |

**Note**: Weight-only updates are much cheaper than full profile updates!

## Support & Troubleshooting

### Common Issues

**Q: Upgrade transaction fails**

- A: Ensure you're the contract owner
- A: Check you have enough ETH for gas

**Q: New functions not showing up**

- A: Verify ABI is updated in `src/lib/contractConfig.ts`
- A: Clear build cache: `rm -rf .next && pnpm build`

**Q: Old profiles can't load**

- A: Use `getProfile()` for V2 profiles without weight
- A: Use `getProfileWithWeight()` for V3 profiles (weight will be empty string if not set)

**Q: Weight shows empty after upgrade**

- A: Expected! Existing profiles need weight set via `updateWeight()` or `updateProfileWithWeight()`
- A: Or migrate from localStorage using migration helper

## Files Modified

- ✅ `contracts/SecureHealthProfileV3.sol` - New contract
- ✅ `scripts/upgrade-to-v3.js` - Upgrade script
- ✅ `src/lib/contractConfig.ts` - Updated ABI
- ⏳ `src/hooks/usePrivyWalletService.ts` - Needs update
- ⏳ `src/components/HealthProfileManager.tsx` - Needs update
- ⏳ `src/components/WalletSetupWizard.tsx` - Needs update

## Timeline

1. **Now**: Deploy to testnet
2. **Test**: 1-2 days of testing
3. **Fix**: Any issues found
4. **Deploy**: To mainnet
5. **Frontend**: Update and deploy frontend
6. **Monitor**: Watch for issues

## Questions?

- Check deployment logs in `deployments/upgrade-to-v3-{timestamp}.json`
- Review contract source: `contracts/SecureHealthProfileV3.sol`
- Test on testnet first!

---

**Status**: Ready for testnet deployment 🚀
**Version**: V2 → V3
**Breaking Changes**: None (backwards compatible)
**Data Loss Risk**: Zero (proxy preserves all data)
