/**
 * AI Memory System - Public API Exports
 */

// Types
export * from './types';

// Services
export { DailyLogService, type HealthDataInput, type DailyLogServiceConfig } from './DailyLogService';
export { HealthProfileStore, type HealthProfileStoreConfig } from './HealthProfileStore';

// Core
export { HybridSearchIndex, type HybridSearchIndexConfig } from './HybridSearchIndex';
export { LocalStorageAdapter, type LocalStorageAdapterConfig } from './LocalStorageAdapter';
export { MemoryEncryption, getMemoryEncryption, resetMemoryEncryption } from './MemoryEncryption';

// Convenience factory
import { DailyLogService, type DailyLogServiceConfig } from './DailyLogService';
import { HealthProfileStore, type HealthProfileStoreConfig } from './HealthProfileStore';
import { HybridSearchIndex, type HybridSearchIndexConfig } from './HybridSearchIndex';
import { LocalStorageAdapter, type LocalStorageAdapterConfig } from './LocalStorageAdapter';
import { MemoryEncryption, getMemoryEncryption } from './MemoryEncryption';
import { type MemoryFeatureFlags, DEFAULT_MEMORY_FLAGS } from '../config/featureFlags';

export interface MemorySystemConfig {
  featureFlags: MemoryFeatureFlags;
  logServiceConfig?: Partial<DailyLogServiceConfig>;
  profileStoreConfig?: Partial<HealthProfileStoreConfig>;
  searchIndexConfig?: Partial<HybridSearchIndexConfig>;
  storageConfig?: Partial<LocalStorageAdapterConfig>;
}

export interface MemorySystem {
  logs: DailyLogService;
  profiles: HealthProfileStore;
  search: HybridSearchIndex;
  storage: LocalStorageAdapter;
  encryption: MemoryEncryption;
}

/**
 * Initialize the complete memory system
 */
export async function initMemorySystem(
  walletSignature: string,
  config: Partial<MemorySystemConfig> = {}
): Promise<MemorySystem> {
  const flags = config.featureFlags ?? DEFAULT_MEMORY_FLAGS;

  // Initialize encryption
  const encryption = getMemoryEncryption();
  if (flags.encryptionEnabled) {
    await encryption.initialize(walletSignature);
  }

  // Initialize storage
  const storage = new LocalStorageAdapter(
    {
      hotStorageDays: flags.hotStorageDays,
      warmStorageDays: flags.warmStorageDays,
      encryptionEnabled: flags.encryptionEnabled,
      cloudArchiveEnabled: flags.cloudArchiveEnabled,
    },
    encryption
  );
  await storage.initialize();

  // Initialize search
  const search = new HybridSearchIndex({
    bm25Params: flags.bm25Params,
    deepSearchEnabled: flags.deepSearchEnabled,
  });

  // Initialize services
  const logs = new DailyLogService(config.logServiceConfig ?? {}, storage, search);
  const profiles = new HealthProfileStore(config.profileStoreConfig ?? {}, search);

  return { logs, profiles, search, storage, encryption };
}

/**
 * Quick search helper
 */
export function searchMemory(
  system: MemorySystem,
  query: string,
  options?: { mode?: 'standard' | 'deep'; limit?: number }
) {
  return system.search.search(query, {
    mode: options?.mode ?? 'standard',
    limit: options?.limit ?? 10,
  });
}
