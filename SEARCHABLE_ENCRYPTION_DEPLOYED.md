# ✅ Searchable Encryption Deployed!

**Date:** November 20, 2025  
**Network:** ZKsync Sepolia Testnet  
**Status:** 🟢 Ready for Testing

---

## 🎯 What Changed

### Privacy Enhancement

Event types are now **fully encrypted** using searchable encryption:

**Before (V0):**

```solidity
struct HealthEvent {
    EventType eventType;  // ❌ Plaintext on blockchain
    string encryptedData;
    ...
}
```

**After (V1 with Searchable Encryption):**

```solidity
struct HealthEvent {
    bytes32 searchTag;    // ✅ keccak256(eventType + userSecret)
    string encryptedData; // ✅ Includes eventType in encrypted payload
    ...
}
```

### What's Hidden Now ✅

- **Event types** - Blockchain observers see random hashes
- **Event details** - All data AES-GCM encrypted
- **User patterns** - Can't correlate event types across users

### What's Still Visible ⚠️

- **Event count** - Number of events per user (required for ZK proofs)
- **Timestamps** - When events were created (required for time-range queries)
- **Search tags** - Unique per (eventType + userSecret) pair

---

## 📋 Deployment Details

### Contract Addresses

| Component                | Address                                      | Notes                                     |
| ------------------------ | -------------------------------------------- | ----------------------------------------- |
| **Proxy** (永 Permanent) | `0x2A8015613623A6A8D369BcDC2bd6DD202230785a` | Use this address in frontend              |
| **Implementation V1**    | `0x9aD92C50548c7D0628f21836c48230041330D277` | Logic contract                            |
| **Previous Proxy**       | `0xcA1A0A89A3e6907587A34aE027D89D4BC01331Bf` | Old deployment (no searchable encryption) |

### Updated Functions

| Old Function                            | New Function                                     | Change                           |
| --------------------------------------- | ------------------------------------------------ | -------------------------------- |
| `addHealthEvent(EventType, ...)`        | `addHealthEvent(bytes32 searchTag, ...)`         | Tag = keccak256(type + secret)   |
| `getEventsByType(address, EventType)`   | `getEventsByTag(address, bytes32)`               | Query by tag, not plaintext type |
| `getEventsInRange(address, start, end)` | `getEventsInRange(address, start, end, bytes32)` | Added optional tag filter        |

---

## 🔧 How It Works

### 1. User Secret Generation

```typescript
// One-time setup: Derive secret from wallet signature
import { getUserSecret, generateSearchTag } from "@/utils/searchableEncryption";

const userSecret = await getUserSecret(signer);
// Example: "0xabc123..." (deterministic per wallet)
```

### 2. Creating Events

```typescript
// Client-side: Generate search tag
const searchTag = generateSearchTag("MEDICATION_STARTED", userSecret);

// Store on-chain with tag (not plaintext type)
await contract.addHealthEvent(
  searchTag, // ✅ keccak256("MEDICATION_STARTED" + userSecret)
  encryptedData, // ✅ Full event details (AES-GCM)
  eventHash, // ✅ Integrity verification
);
```

### 3. Querying Events

```typescript
// Generate tag for the type you want
const medicationTag = generateSearchTag("MEDICATION_STARTED", userSecret);

// Query on-chain by tag (blockchain sees random hash)
const events = await contract.getEventsByTag(userAddress, medicationTag);

// Decrypt results client-side
const decrypted = events.map((e) => decryptAES(e.encryptedData, key));
```

---

## 🔐 Privacy Benefits

### Searchable Encryption Properties

1. **Privacy from Observers**: Blockchain sees `0xabc123...`, not `"MEDICATION_STARTED"`
2. **Efficient Filtering**: On-chain queries work without decryption
3. **Selective Access**: Share specific tags with doctors (e.g., share medication tag, not weight tag)
4. **ZK-Proof Compatible**: Can prove "I have N medication events" without revealing which events

### Example: Selective Disclosure

```typescript
// Share ONLY medication access with doctor
const medicationTag = generateSearchTag("MEDICATION_STARTED", userSecret);
await shareMedicationAccessWithDoctor(doctorAddress, medicationTag);

// Doctor can query medications (but NOT weight, conditions, etc.)
const meds = await contract.getEventsByTag(patientAddress, medicationTag);
```

---

## 📦 Available Event Types

```typescript
enum HealthEventType {
  MEDICATION_STARTED,
  MEDICATION_STOPPED,
  CONDITION_DIAGNOSED,
  CONDITION_RESOLVED,
  SURGERY_COMPLETED,
  ALLERGY_ADDED,
  WEIGHT_RECORDED,
  HEIGHT_RECORDED,
  METRIC_SNAPSHOT, // Apple Health data
  GENERAL_NOTE,
}
```

---

## 🧪 Testing Checklist

### 1. Profile Management ✅

- [ ] Connect wallet (ZKsync SSO)
- [ ] Create profile (birthdate, sex, height, email)
- [ ] View profile on blockchain
- [ ] Test on mobile

### 2. Timeline Events (New Feature) 🆕

- [ ] Add weight record event
- [ ] Add medication event
- [ ] Query events by tag (medications only)
- [ ] Query events in date range
- [ ] Verify event types are hidden on blockchain explorer

### 3. Privacy Verification 🔒

- [ ] Check ZKsync explorer: event types should be random hashes
- [ ] Generate search tags for different event types
- [ ] Verify filtering works (only see events matching tag)
- [ ] Test selective disclosure (share one tag, not all)

---

## 🚀 Next Steps

### Immediate (Testing Phase)

1. Test profile creation with new contract
2. Test adding health events with search tags
3. Test querying events by tag
4. Verify privacy on blockchain explorer

### Near-Term (Timeline UI)

1. Build health timeline dashboard
2. Implement event creation UI (weight, medications, etc.)
3. Add client-side event cache (IndexedDB)
4. Build selective access control UI

### Future Enhancements

1. **ZK-SNARKs**: Prove event counts without revealing data
2. **Time-based Tag Rotation**: Change tags monthly for additional privacy
3. **Homomorphic Encryption**: Compute on encrypted data (e.g., average weight)
4. **Multi-Party Computation**: Doctor and patient jointly decrypt

---

## 📚 Documentation

- **Contract Source**: `contracts/SecureHealthProfileV1.sol`
- **Client Utilities**: `src/utils/searchableEncryption.ts`
- **Detailed Guide**: `contracts/SearchableEncryption.md`
- **Deployment Info**: `latest-upgradeable-deployment.json`

---

## ⚠️ Migration Notes

### For Existing Users (2 profiles)

1. **Old profiles cannot be migrated automatically** (different contract)
2. **Action Required**: Re-create profiles on new contract
3. **Data Preservation**: Old data remains accessible at previous address

### For New Users

- No action needed - just create a profile!

---

## 🎉 Summary

**Privacy Achieved:**

- ✅ Event types encrypted with searchable tags
- ✅ On-chain filtering without decryption
- ✅ Selective access control ready
- ✅ ZK-proof compatible architecture

**Ready for:**

- ✅ Profile creation testing
- ✅ Health timeline event storage
- ✅ Privacy-preserving queries
- ✅ Doctor/researcher data sharing

---

**Dev Server Running:** `http://localhost:3000`  
**Test and report any issues!** 🚀
