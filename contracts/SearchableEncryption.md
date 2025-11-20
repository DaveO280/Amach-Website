# Searchable Encryption for Health Events

## Overview

Health event types are encrypted using **searchable encryption** to provide:

- ✅ Privacy from blockchain observers
- ✅ Efficient on-chain filtering
- ✅ Selective access control
- ✅ ZK-proof compatibility

## How It Works

### 1. User Secret Generation

```typescript
// Derive a secret from wallet signature (never sent to contract)
const message = "Generate Health Timeline Secret";
const signature = await signer.signMessage(message);
const userSecret = keccak256(signature); // Deterministic per wallet
```

### 2. Search Tag Generation

```typescript
// Client-side: Generate search tag for an event type
import { solidityKeccak256 } from "ethers/lib/utils";

const eventType = "MEDICATION_STARTED";
const searchTag = solidityKeccak256(
  ["string", "bytes32"],
  [eventType, userSecret],
);
```

### 3. Store Event On-Chain

```solidity
// Contract stores searchTag (hash), not plaintext eventType
function addHealthEvent(
    bytes32 searchTag,           // keccak256(eventType + userSecret)
    string memory encryptedData, // Full event details (AES-GCM encrypted)
    bytes32 eventHash           // Integrity hash
) external;
```

### 4. Query Events

```typescript
// Generate tag for the type you want to query
const medicationTag = generateSearchTag("MEDICATION_STARTED", userSecret);

// Query on-chain by tag
const events = await contract.getEventsByTag(userAddress, medicationTag);

// Decrypt results client-side
const decryptedEvents = events.map((e) =>
  decryptAES(e.encryptedData, encryptionKey),
);
```

## Privacy Properties

### What's Hidden ✅

- **Event types** - Blockchain sees random hashes
- **Event details** - All data AES-GCM encrypted
- **User patterns** - Can't correlate event types across users

### What's Visible ⚠️

- **Event count** - Number of events per user
- **Timestamps** - When events were created (required for time-range queries)
- **Search tag** - Unique per (eventType, userSecret) pair

## Access Control

### Selective Disclosure

Share specific event type access with doctors/researchers:

```typescript
// User shares their medication search tag with doctor
const medicationTag = generateSearchTag("MEDICATION_STARTED", userSecret);
await shareMedicationAccessWithDoctor(doctorAddress, medicationTag);

// Doctor can now query medication events (but not weight, conditions, etc.)
const medications = await contract.getEventsByTag(
  patientAddress,
  medicationTag,
);
```

### Access Revocation

To revoke access:

- User rotates their `userSecret` (re-sign wallet message with nonce)
- Old search tags become invalid
- Re-encrypt and migrate existing events with new tags

## ZK Proof Integration

Searchable encryption is **ZK-proof compatible**:

```typescript
// Prove you have N events of a type without revealing which events
const medicationTag = generateSearchTag("MEDICATION_STARTED", userSecret);
const medicationEvents = await contract.getEventsByTag(
  userAddress,
  medicationTag,
);

// Generate ZK proof: "I have >= 3 medication events"
const proof = await generateZKProof({
  statement: "event_count >= 3",
  private: { events: medicationEvents },
  public: { threshold: 3 },
});

// Anyone can verify proof on-chain
await contract.verifyZKProof(proof);
```

## Event Types

```typescript
enum EventType {
  MEDICATION_STARTED = "MEDICATION_STARTED",
  MEDICATION_STOPPED = "MEDICATION_STOPPED",
  CONDITION_DIAGNOSED = "CONDITION_DIAGNOSED",
  CONDITION_RESOLVED = "CONDITION_RESOLVED",
  SURGERY_COMPLETED = "SURGERY_COMPLETED",
  ALLERGY_ADDED = "ALLERGY_ADDED",
  WEIGHT_RECORDED = "WEIGHT_RECORDED",
  HEIGHT_RECORDED = "HEIGHT_RECORDED",
  METRIC_SNAPSHOT = "METRIC_SNAPSHOT", // Apple Health sync
  GENERAL_NOTE = "GENERAL_NOTE",
}
```

## Client-Side Caching

For performance, maintain an IndexedDB cache:

```typescript
interface EventCache {
  searchTag: string;        // The tag
  eventType: string;        // Plaintext type (local only)
  events: DecryptedEvent[]; // Decrypted events
  lastSync: number;         // Timestamp of last sync
}

// Cache structure
{
  "0xabc...": {  // medicationTag
    eventType: "MEDICATION_STARTED",
    events: [...],
    lastSync: 1699564800
  },
  "0xdef...": {  // weightTag
    eventType: "WEIGHT_RECORDED",
    events: [...],
    lastSync: 1699564800
  }
}
```

## Security Considerations

### ✅ Strengths

- Event types hidden from blockchain observers
- Efficient on-chain querying without decryption
- Selective access control per event type
- Deterministic tags (same secret = same tags)

### ⚠️ Limitations

- **Tag correlation**: Same tag across multiple events reveals they're the same type
- **Frequency analysis**: Event count per tag visible
- **Timing attacks**: Event creation timestamps visible

### 🔒 Mitigations

- Use time-based tag rotation (e.g., monthly: `keccak256(eventType + userSecret + "2024-01")`)
- Add dummy events to obscure patterns
- Batch event creation to hide timing

## Gas Costs

Approximate gas costs on ZKsync:

- `addHealthEvent`: ~50,000 gas
- `getEventsByTag`: Free (view function)
- `getEventsInRange`: Free (view function)

## Future Enhancements

1. **Homomorphic Encryption**: Compute on encrypted data (e.g., "average weight" without decryption)
2. **Oblivious RAM**: Hide access patterns from blockchain
3. **Multi-Party Computation**: Doctor and patient jointly decrypt without revealing to either
4. **ZK-STARK Proofs**: Larger proofs, but no trusted setup required
