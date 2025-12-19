# Storj Storage Framework

## Overview

Decentralized storage for health timeline events and conversation history using Storj (S3-compatible). Each wallet gets its own isolated bucket with end-to-end encryption.

## Architecture

```
Application Layer (aiStore, HealthEventService)
    ↓
Storj Services (Timeline, Conversation, Sync)
    ↓
StorageService (encryption layer)
    ↓
StorjClient (S3-compatible, per-wallet buckets)
```

### Per-Wallet Buckets

- **Bucket Name**: `{prefix}-{hash(wallet-address + encryption-key)}`
- **Isolation**: Each wallet has its own discrete bucket
- **Auto-Creation**: Buckets created on-demand
- **Security**: Bucket name requires wallet connection (encryption key from signature)

## Security Model

### Two-Layer Security

**Layer 1: Bucket Access**

- Requires: Wallet address + Encryption key (derived from wallet signature)
- Prevents: Server credentials + public wallet address = bucket access
- Bucket name generation requires wallet connection

**Layer 2: Data Encryption**

- Requires: Wallet connection + signature
- Prevents: Decrypting data without wallet
- Encryption key derived from wallet signature via PBKDF2

### Security Guarantees

✅ **Protected:**

- Bucket isolation (hashed names, cannot be guessed)
- Bucket validation (every operation validates ownership)
- Data encryption (wallet-derived keys)
- Defense in depth (bucket + encryption layers)

⚠️ **Limitations:**

- Server credentials + wallet connection = bucket access (but data still encrypted)
- Mitigation: Keep server credentials secure, data remains encrypted

## Services

### StorjTimelineService

Stores health timeline events (medications, conditions, etc.)

```typescript
import { getStorjTimelineService } from "@/storage";

const timelineService = getStorjTimelineService();
const encryptionKey = await getWalletDerivedEncryptionKey(address, signMessage);

// Store event
const result = await timelineService.storeTimelineEvent(
  event,
  userAddress,
  encryptionKey,
);

// Store result.storjUri on blockchain
```

### StorjConversationService

Stores conversation sessions and history

```typescript
import { getStorjConversationService } from "@/storage";

const conversationService = getStorjConversationService();
const encryptionKey = await getWalletDerivedEncryptionKey(address, signMessage);

// Store session
await conversationService.storeConversationSession(
  session,
  messages,
  userAddress,
  encryptionKey,
);
```

### StorjSyncService

Syncs IndexedDB conversation memory with Storj

```typescript
import { getStorjSyncService } from "@/storage";

const syncService = getStorjSyncService();
const encryptionKey = await getWalletDerivedEncryptionKey(address, signMessage);

// Sync local to Storj
await syncService.syncConversationMemory(userAddress, encryptionKey);

// Restore from Storj
await syncService.restoreConversationMemory(userAddress, encryptionKey);
```

## Setup

### Environment Variables

```bash
STORJ_ACCESS_KEY=your-access-key
STORJ_SECRET_KEY=your-secret-key
STORJ_ENDPOINT=https://gateway.storjshare.io
STORJ_BUCKET_PREFIX=amach-health
```

### Client Creation

```typescript
// Production (strict validation)
const client = StorjClient.createClient();

// Testing (no validation - for debugging only)
const testClient = StorjClient.createTestClient();
```

## Usage Requirements

### Wallet Connection

**Required for:**

- ✅ Encrypting/decrypting data
- ✅ Generating bucket names (requires encryption key)
- ✅ All Storj operations

**Not required for:**

- ❌ Nothing - all operations require wallet connection

### Encryption Key Derivation

```typescript
import { getWalletDerivedEncryptionKey } from "@/utils/walletEncryption";

// Wallet MUST be connected
const encryptionKey = await getWalletDerivedEncryptionKey(
  walletAddress,
  signMessage, // ← Requires wallet connection
);
```

## Integration Points

### Timeline Events

In `HealthEventService.ts`:

```typescript
const timelineService = getStorjTimelineService();
const storjResult = await timelineService.storeTimelineEvent(
  event,
  userAddress,
  encryptionKey,
);
// Store storjResult.storjUri on blockchain
```

### Conversation History

In `aiStore.tsx`:

```typescript
const syncService = getStorjSyncService();
await syncService.syncConversationMemory(userAddress, encryptionKey);
```

## Best Practices

1. **Always use wallet-derived encryption keys**
2. **Sync after important conversations, not every message**
3. **Check `success` flag in all results**
4. **Use batch operations for multiple items**
5. **Keep server credentials secure**

## Testing

Use `/test-storj` page for manual testing:

- Connect wallet
- Test upload/download/list operations
- Verify encryption and bucket isolation
