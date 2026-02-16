/**
 * Feature Flags Configuration
 * AI Memory System toggles
 */

import type { MemoryFeatureFlags } from '../ai/memory/types';

export const DEFAULT_MEMORY_FLAGS: MemoryFeatureFlags = {
  memoryEnabled: true,
  encryptionEnabled: true,
  tieredStorageEnabled: true,
  deepSearchEnabled: false,
  autoDailyLogEnabled: true,
  autoArchiveEnabled: true,
  cloudArchiveEnabled: false,
  hotStorageDays: 30,
  warmStorageDays: 60,
  bm25Params: { k1: 1.5, b: 0.75 },
};

/**
 * Load feature flags from environment or use defaults
 */
export function loadFeatureFlags(): MemoryFeatureFlags {
  // Could extend to load from env, remote config, etc.
  return { ...DEFAULT_MEMORY_FLAGS };
}
