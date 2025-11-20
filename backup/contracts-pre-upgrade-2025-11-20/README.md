# Contract Backup - Pre-UUPS Upgrade

**Date:** November 20, 2025  
**Backup Reason:** Upgrading SecureHealthProfile to UUPS Proxy Pattern

---

## 📋 What Was Backed Up

### Current Contract (Non-Upgradeable)

- **Contract:** `SecureHealthProfile.sol`
- **Deployed Address:** `0xb1e41c4913D52E20aAaF4728c0449Bc6320a45A3`
- **Network:** ZKsync Sepolia Testnet
- **Status:** 2 active profiles

### Key Files Backed Up

1. `SecureHealthProfile-ORIGINAL.sol` - Current contract implementation
2. `zksync-sso-config-ORIGINAL.ts` - Config with old contract address/ABI
3. `ZkSyncSsoWalletService-ORIGINAL.ts` - Service using old contract
4. `deployment-info-ORIGINAL.json` - Deployment metadata (if exists)

---

## 🔍 Existing Profiles

### Profile 1

- **Address:** Your primary wallet
- **Data:** Encrypted birthDate, sex, height, weight, email

### Profile 2

- **Address:** Test wallet
- **Data:** Encrypted profile data

**Note:** These profiles exist on the OLD contract and will need to be re-entered after upgrade.

---

## 🎯 What Changed in Upgrade

### Old Architecture (Non-Upgradeable)

```
User → SecureHealthProfile (0xb1e4...)
        ├─ Logic (functions)
        └─ Storage (user data)
```

**Problem:** Can't add new features without redeploying and migrating all data.

### New Architecture (UUPS Upgradeable)

```
User → Proxy (0xNEW...)
        ├─ delegatecall → Implementation V1
        │                 └─ Logic + upgrade()
        └─ Storage (永 permanent)
            ├─ Profiles
            └─ Health Timeline (append-only events)
```

**Benefits:**

- ✅ Add new features (medications, conditions, attestations)
- ✅ Never redeploy or migrate again
- ✅ Data stays with user forever
- ✅ Enables ZK proofs for provable health data

---

## 🏥 New Features in V1

### Event-Based Health Timeline

- **Immutable history** of health events
- **Rich AI context** from complete timeline
- **Provable claims** via ZK proofs

### Event Types

- `MEDICATION_STARTED` / `MEDICATION_STOPPED`
- `CONDITION_DIAGNOSED` / `CONDITION_RESOLVED`
- `WEIGHT_RECORDED`
- `METRIC_SNAPSHOT` (periodic aggregates)
- `SURGERY_COMPLETED`
- `ALLERGY_ADDED`

### Future Upgrades (V2+)

- ✅ Doctor attestations
- ✅ Lab result verification
- ✅ Apple Health device verification
- ✅ Pharmacy verification
- ✅ Hospital EMR integration

---

## 🔄 Migration Path

### Option 1: Re-enter Data (Recommended)

Since only 2 profiles exist, manually re-enter:

1. Connect wallet to new contract
2. Create profile with same data
3. Add historical events to timeline
4. Old data remains on old contract (readable anytime)

### Option 2: Keep Old Contract for Reference

- Old contract still accessible at `0xb1e4...`
- Can read encrypted data anytime
- Use as backup/verification

---

## 📞 Recovery Instructions

If you need to reference the old contract:

```typescript
// Read from OLD contract
const OLD_CONTRACT = "0xb1e41c4913D52E20aAaF4728c0449Bc6320a45A3";
const profile = await readContract(wagmiConfig, {
  address: OLD_CONTRACT,
  abi: secureHealthProfileAbi, // from backup
  functionName: "getEncryptedProfile",
  args: [userAddress],
});
```

---

## ✅ Verification Checklist

Before deleting this backup:

- [ ] New contract deployed successfully
- [ ] 2 profiles migrated and verified
- [ ] All functions working on new contract
- [ ] Dashboard loads profiles correctly
- [ ] Timeline events working
- [ ] Mobile profile creation tested

---

**Do not delete this backup until mainnet launch!**
