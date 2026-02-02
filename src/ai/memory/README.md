# AI Memory System

Phase 2 implementation: Tiered storage with BM25 search for health/wellness data.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  DailyLogService │────▶│  HealthProfile  │────▶│  HybridSearch   │
│   (generation)   │     │    (curation)   │     │    (BM25)       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
           │                       │                       │
           └───────────────────────┴───────────────────────┘
                               │
                    ┌─────────────────┐
                    │  LocalStorage   │
                    │  (3-tier: hot/  │
                    │  warm/cold)     │
                    └─────────────────┘
```

## Storage Tiers

| Tier | Location | Retention | Access |
|------|----------|-----------|--------|
| Hot | localStorage | 30 days | <10ms |
| Warm | IndexedDB | 60 days | <50ms |
| Cold | Storj | Indefinite | <500ms |

## Usage

```typescript
import { initMemorySystem, searchMemory } from './ai/memory';

// Initialize with wallet-derived encryption
const memory = await initMemorySystem(walletSignature);

// Generate daily log
const log = await memory.logs.generateDailyLog({
  date: '2025-01-15',
  userId: 'user-123',
  sleep: { durationMinutes: 480, quality: 'good' },
  activity: { steps: 8500, activeMinutes: 45 },
  dataSources: ['manual', 'watch']
}, { type: 'manual', date: '2025-01-15', userId: 'user-123', triggeredAt: Date.now().toString() });

// Search memory
const results = searchMemory(memory, 'sleep quality last week');

// Get profile
const profile = await memory.profiles.getOrCreateProfile('user-123');
```

## Feature Flags

Configure via `src/config/featureFlags.ts`:

- `memoryEnabled` - Master toggle
- `encryptionEnabled` - Wallet-derived AES-256-GCM
- `tieredStorageEnabled` - Hot/warm/cold tiers
- `deepSearchEnabled` - BM25 + embeddings
- `autoDailyLogEnabled` - Nightly generation

## Search Modes

**Standard:** BM25 text search only (fast, no deps)

**Deep:** BM25 + local embeddings (better semantic match, ~+20MB)

## Daily Log Generation

- **Auto:** Nightly at 23:00 (configurable)
- **On-demand:** Manual trigger
- **Deduplication:** Prevents duplicate generation within 1 hour

## Files

| File | Purpose |
|------|---------|
| `types.ts` | All interfaces |
| `DailyLogService.ts` | Log generation/management |
| `HealthProfileStore.ts` | Long-term profile curation |
| `HybridSearchIndex.ts` | BM25 + vector search |
| `LocalStorageAdapter.ts` | 3-tier storage |
| `MemoryEncryption.ts` | Wallet-derived crypto |
| `index.ts` | Public API |

## Next Steps

- Phase 3: Add transformers.js for real embeddings
- Phase 4: Auto-curation triggers
- Phase 5: Cross-user pattern learning (anonymized)
