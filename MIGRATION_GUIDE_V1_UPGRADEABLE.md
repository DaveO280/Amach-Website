# Migration Guide: V1 Upgradeable Health Profile

**Date:** November 20, 2025  
**Migration Type:** Clean slate (re-enter data)  
**Affected Profiles:** 2 existing profiles  
**Old Contract:** `0xb1e41c4913D52E20aAaF4728c0449Bc6320a45A3` (non-upgradeable)  
**New Contract:** Deploy first, then update

---

## 🎯 What Changed

### Old System (Non-Upgradeable)

- ✅ Basic encrypted profile (birthDate, sex, height, weight, email)
- ❌ No timeline/event history
- ❌ No upgradeability (stuck forever)
- ❌ Weight in profile (not historical)

### New System (V1 Upgradeable)

- ✅ Core encrypted profile (birthDate, sex, height, email)
- ✅ **Immutable event timeline** (medications, conditions, weight records, etc.)
- ✅ **Upgradeable** (can add attestations, verifications, etc. in V2+)
- ✅ **Weight as timeline events** (full history)
- ✅ **Append-only health history** (richer AI context)

---

## 📋 Migration Steps

### Step 1: Deploy New Contract ✅ DONE

```bash
cd 'C:\Users\ogara\AmachHealth(S)\Amach-Website'
npx hardhat run scripts/deploy-upgradeable-health-profile.js --network zksyncSepolia
```

**Expected Output:**

```
✅ Proxy deployed at: 0x[NEW_ADDRESS]
✅ Implementation deployed at: 0x[IMPL_ADDRESS]
```

### Step 2: Update Frontend Config

Edit `src/lib/zksync-sso-config.ts`:

```typescript
const SECURE_HEALTH_PROFILE_CONTRACT = "0x[NEW_PROXY_ADDRESS]"; // ← Paste from deployment output
```

### Step 3: Test Deployment (Developer)

```bash
npm run dev
```

Navigate to dashboard and:

1. Connect wallet (test account)
2. Create new profile
3. Verify profile loads correctly
4. Add a test timeline event (e.g., weight record)
5. Check timeline displays correctly

### Step 4: Migrate Your 2 Profiles

#### Profile 1: Your Primary Wallet

1. **Connect** your primary wallet
2. **Create Profile:**
   - Birth Date: [Re-enter from memory or old profile]
   - Sex: [Re-enter]
   - Height: [Re-enter]
   - Email: [Re-enter]
3. **Add Historical Events** (optional but recommended):

   ```typescript
   // Example: Add weight history
   await addHealthEvent(
     EventType.WEIGHT_RECORDED,
     encrypt({ weight: 185, unit: "lbs", date: "2024-11-01" }),
     hash,
   );

   // Add medications (if any)
   await addHealthEvent(
     EventType.MEDICATION_STARTED,
     encrypt({ medication: "Aspirin 81mg", dosage: "1x daily" }),
     hash,
   );
   ```

#### Profile 2: Test Wallet

1. **Connect** test wallet
2. **Create Profile:** Same process as above
3. **Test timeline events:** Add sample data to verify functionality

---

## 🔍 Verification Checklist

Before considering migration complete:

### Backend (Contract)

- [ ] New contract deployed to testnet
- [ ] Proxy address verified on zkSync Explorer
- [ ] Implementation address verified
- [ ] Contract version returns `1`
- [ ] Owner address is correct

### Frontend

- [ ] Config updated with new proxy address
- [ ] `HealthProfileReader.ts` imports from config
- [ ] No hardcoded old addresses remain
- [ ] SSO connector call policies updated

### Functionality

- [ ] Can create new profile
- [ ] Can update existing profile
- [ ] Can add timeline events (all types)
- [ ] Can retrieve timeline events
- [ ] Can deactivate events (soft delete)
- [ ] Dashboard displays profile correctly
- [ ] Mobile works (profile creation + events)

### Data

- [ ] Profile 1 migrated successfully
- [ ] Profile 2 migrated successfully
- [ ] Historical events added (if desired)
- [ ] Old data backed up (see `backup/contracts-pre-upgrade-2025-11-20/`)

---

## 🏥 Adding Historical Events (Recommended)

To give AI richer context, add historical health events:

### Weight History

```typescript
import { EventType } from "@/types/healthEvents";

// Past weights
await addHealthEvent(
  EventType.WEIGHT_RECORDED,
  encrypt({
    weight: 210,
    unit: "lbs",
    date: "2024-01-01",
    notes: "Starting point",
  }),
  hashData({ weight: 210, unit: "lbs", date: "2024-01-01" }),
);

await addHealthEvent(
  EventType.WEIGHT_RECORDED,
  encrypt({
    weight: 198,
    unit: "lbs",
    date: "2024-03-01",
    notes: "3 months progress",
  }),
  hashData({ weight: 198, unit: "lbs", date: "2024-03-01" }),
);

// Current weight
await addHealthEvent(
  EventType.WEIGHT_RECORDED,
  encrypt({ weight: 185, unit: "lbs", date: "2024-11-20", notes: "Current" }),
  hashData({ weight: 185, unit: "lbs", date: "2024-11-20" }),
);
```

### Medications (if any)

```typescript
await addHealthEvent(
  EventType.MEDICATION_STARTED,
  encrypt({
    medication: "Metformin 1000mg",
    dosage: "2x daily",
    startDate: "2024-01-15",
    prescribingDoctor: "Dr. Johnson",
    reason: "Type 2 Diabetes",
  }),
  hashData({ medication: "Metformin 1000mg", startDate: "2024-01-15" }),
);
```

### Conditions (if any)

```typescript
await addHealthEvent(
  EventType.CONDITION_DIAGNOSED,
  encrypt({
    condition: "Type 2 Diabetes",
    diagnosisDate: "2024-01-10",
    diagnosingDoctor: "Dr. Johnson",
    a1c: "7.2%",
    notes: "Lifestyle + medication management",
  }),
  hashData({ condition: "Type 2 Diabetes", diagnosisDate: "2024-01-10" }),
);
```

---

## 🔐 Old Data Access (If Needed)

Your old profiles are **still readable** on the old contract:

```typescript
import { SECURE_HEALTH_PROFILE_CONTRACT_V1_OLD } from "@/lib/zksync-sso-config";

// Read from old contract
const oldProfile = await readContract(wagmiConfig, {
  address: SECURE_HEALTH_PROFILE_CONTRACT_V1_OLD,
  abi: oldProfileAbi, // from backup
  functionName: "getEncryptedProfile",
  args: [userAddress],
});

// Decrypt and reference if needed
```

**Old Contract Address:** `0xb1e41c4913D52E20aAaF4728c0449Bc6320a45A3`  
**Backup Location:** `backup/contracts-pre-upgrade-2025-11-20/`

---

## 🚀 Post-Migration: What's Next?

### Immediate (V1)

- ✅ Start building health timeline with daily events
- ✅ Track weight, medications, conditions, etc.
- ✅ AI gets richer context from complete history

### Future (V2 - 6 months)

- ✅ Doctor attestations for medications
- ✅ Apple Health device verification
- ✅ Lab result verification
- ✅ Pharmacy prescription verification

### Future (V3 - 12+ months)

- ✅ Hospital EMR integration
- ✅ Insurance verifications
- ✅ ZK proofs for provable health claims
- ✅ Verifier reputation system

---

## 🆘 Troubleshooting

### "Profile already exists" error

- You're connected to the wrong wallet
- Or profile was already created on new contract
- Check wallet address matches expected

### "Contract not found" error

- Config not updated with new proxy address
- Or deployment failed
- Verify address on zkSync Explorer

### "Function not found" error

- Using old ABI with new contract
- Clear cache and rebuild: `npm run dev`
- Verify `HealthProfileReader.ts` imports from config

### Timeline events not showing

- Profile must exist before adding events
- Check event hash is valid (not 0x000...)
- Use dashboard dev tools to inspect contract calls

---

## 📊 Event Types Reference

```typescript
enum EventType {
  MEDICATION_STARTED = 0,
  MEDICATION_STOPPED = 1,
  CONDITION_DIAGNOSED = 2,
  CONDITION_RESOLVED = 3,
  SURGERY_COMPLETED = 4,
  ALLERGY_ADDED = 5,
  WEIGHT_RECORDED = 6,
  HEIGHT_RECORDED = 7,
  METRIC_SNAPSHOT = 8, // For periodic health score snapshots
  GENERAL_NOTE = 9, // For any other health-related notes
}
```

---

## ✅ Migration Complete!

Once all checklist items are ✅, you're ready for mainnet preparation.

**Next Steps:**

1. Use the system daily to build health timeline
2. Monitor for any issues
3. Test on multiple devices (desktop + mobile)
4. Plan V2 features (attestations, verifications)
5. Prepare for mainnet launch

---

**Questions or issues?** Check `backup/contracts-pre-upgrade-2025-11-20/README.md` for recovery instructions.
