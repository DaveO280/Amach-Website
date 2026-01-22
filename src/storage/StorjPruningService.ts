/**
 * Storj Pruning Service
 *
 * Handles cleanup of old/outdated data in Storj while respecting encryption
 *
 * Challenges:
 * - Data is encrypted (can't read content without decrypting)
 * - Need to avoid deleting important historical data
 * - Must prevent duplicates from accumulating
 *
 * Strategy:
 * - Use metadata (timestamps, types, sizes) for pruning decisions
 * - Keep "golden snapshots" (monthly/quarterly)
 * - Deduplicate by content hash
 * - Enforce retention policies by data type
 */

import type { StorjStorageMetadata } from "@/types/storjStorage";

export interface PruningPolicy {
  /**
   * Maximum age in days before data is eligible for pruning
   */
  maxAgeDays: number;

  /**
   * Minimum number of recent items to keep (even if old)
   */
  minKeepCount: number;

  /**
   * Whether to keep monthly snapshots indefinitely
   */
  keepMonthlySnapshots: boolean;

  /**
   * Maximum total size in bytes (prune oldest when exceeded)
   */
  maxTotalSizeBytes?: number;
}

export interface PruningResult {
  itemsScanned: number;
  itemsDeleted: number;
  bytesFreed: number;
  duplicatesRemoved: number;
  errors: string[];
}

/**
 * Default pruning policies by data type
 */
const DEFAULT_POLICIES: Record<string, PruningPolicy> = {
  // Chat conversations: Keep recent, prune old duplicates
  "conversation-session": {
    maxAgeDays: 90, // 3 months
    minKeepCount: 50, // Always keep 50 most recent
    keepMonthlySnapshots: true,
    maxTotalSizeBytes: 100 * 1024 * 1024, // 100MB
  },

  // Context vaults: Keep more historical snapshots
  "context-vault": {
    maxAgeDays: 365, // 1 year
    minKeepCount: 12, // Keep at least 12 snapshots
    keepMonthlySnapshots: true,
    maxTotalSizeBytes: 50 * 1024 * 1024, // 50MB
  },

  // Raw health data: Keep quarterly snapshots for seasonal/YoY comparisons
  "health-raw": {
    maxAgeDays: 365, // 1 year (but quarterly snapshots kept longer)
    minKeepCount: 10, // Keep at least 10 most recent uploads
    keepMonthlySnapshots: true, // Enables quarterly snapshot protection
    maxTotalSizeBytes: 300 * 1024 * 1024, // 300MB (increased for quarterly retention)
  },

  // Health reports: Keep indefinitely (important documents)
  "health-report": {
    maxAgeDays: Number.MAX_SAFE_INTEGER, // Never prune by age
    minKeepCount: Number.MAX_SAFE_INTEGER,
    keepMonthlySnapshots: true,
  },

  // Monthly aggregates: Keep all (small, important for trends)
  "monthly-aggregate": {
    maxAgeDays: Number.MAX_SAFE_INTEGER,
    minKeepCount: Number.MAX_SAFE_INTEGER,
    keepMonthlySnapshots: true,
  },

  // Quarterly aggregates: Keep all (pre-computed seasonal summaries for YoY analysis)
  "quarterly-aggregate": {
    maxAgeDays: Number.MAX_SAFE_INTEGER, // Never delete
    minKeepCount: Number.MAX_SAFE_INTEGER,
    keepMonthlySnapshots: true,
  },
};

export interface StorjItem {
  uri: string;
  metadata: StorjStorageMetadata;
  contentHash: string;
  uploadedAt: Date;
  sizeBytes: number;
}

/**
 * Determine if an item is a "golden snapshot" (monthly/quarterly)
 *
 * Golden snapshots are preserved indefinitely for:
 * - Year-over-year comparisons (e.g., Jan 2024 vs Jan 2025)
 * - Seasonal analysis (e.g., Winter activity vs Summer activity)
 * - Long-term trend tracking
 *
 * Quarterly snapshots (Jan 1, Apr 1, Jul 1, Oct 1) are especially valuable
 * for raw health data to enable seasonal comparisons:
 * - Q1 (Winter): Jan-Mar baseline
 * - Q2 (Spring): Apr-Jun activity increase
 * - Q3 (Summer): Jul-Sep peak performance
 * - Q4 (Fall): Oct-Dec trends
 */
function isGoldenSnapshot(item: StorjItem): boolean {
  const date = item.uploadedAt;
  const dayOfMonth = date.getDate();

  // Monthly snapshot: first day of month
  if (dayOfMonth === 1) {
    return true;
  }

  // Quarterly snapshot: first day of Q1, Q2, Q3, Q4
  // These are ESPECIALLY protected for seasonal/YoY analysis
  const month = date.getMonth();
  if (dayOfMonth === 1 && [0, 3, 6, 9].includes(month)) {
    return true;
  }

  return false;
}

/**
 * Check if an item is a quarterly snapshot (Q1, Q2, Q3, Q4)
 */
export function isQuarterlySnapshot(item: StorjItem): boolean {
  const date = item.uploadedAt;
  const dayOfMonth = date.getDate();
  const month = date.getMonth();

  return dayOfMonth === 1 && [0, 3, 6, 9].includes(month);
}

/**
 * Group items by content hash to detect duplicates
 */
function groupByContentHash(items: StorjItem[]): Map<string, StorjItem[]> {
  const groups = new Map<string, StorjItem[]>();

  for (const item of items) {
    const hash = item.contentHash;
    if (!groups.has(hash)) {
      groups.set(hash, []);
    }
    groups.get(hash)!.push(item);
  }

  return groups;
}

/**
 * Select items to keep from a duplicate group
 * Strategy: Keep oldest (original) and newest (most recent)
 */
function selectItemsToKeep(duplicates: StorjItem[]): StorjItem[] {
  if (duplicates.length <= 1) {
    return duplicates;
  }

  // Sort by upload date
  const sorted = [...duplicates].sort(
    (a, b) => a.uploadedAt.getTime() - b.uploadedAt.getTime(),
  );

  // Keep first (oldest) and last (newest)
  return [sorted[0], sorted[sorted.length - 1]];
}

/**
 * Determine which items should be pruned based on policy
 */
export function selectItemsToPrune(
  items: StorjItem[],
  dataType: string,
  customPolicy?: Partial<PruningPolicy>,
): StorjItem[] {
  const policy: PruningPolicy = {
    ...(DEFAULT_POLICIES[dataType] || DEFAULT_POLICIES["conversation-session"]),
    ...customPolicy,
  };

  const now = new Date();
  const maxAgeMs = policy.maxAgeDays * 24 * 60 * 60 * 1000;

  // Step 1: Remove duplicates (keep oldest + newest of each hash group)
  const hashGroups = groupByContentHash(items);
  const itemsToKeep = new Set<string>();
  const duplicatesToRemove: StorjItem[] = [];

  for (const [hash, group] of hashGroups.entries()) {
    if (group.length > 1) {
      console.log(
        `[Pruning] Found ${group.length} duplicates for hash ${hash.substring(0, 8)}...`,
      );
      const keepItems = selectItemsToKeep(group);
      keepItems.forEach((item) => itemsToKeep.add(item.uri));

      // Mark others for removal
      group.forEach((item) => {
        if (!itemsToKeep.has(item.uri)) {
          duplicatesToRemove.push(item);
        }
      });
    } else {
      itemsToKeep.add(group[0].uri);
    }
  }

  // Step 2: Apply age-based pruning
  const remainingItems = items.filter(
    (item) => itemsToKeep.has(item.uri) && !duplicatesToRemove.includes(item),
  );

  // Sort by age (oldest first)
  const sortedByAge = [...remainingItems].sort(
    (a, b) => a.uploadedAt.getTime() - b.uploadedAt.getTime(),
  );

  const agePruneTargets: StorjItem[] = [];

  for (let i = 0; i < sortedByAge.length; i++) {
    const item = sortedByAge[i];
    const age = now.getTime() - item.uploadedAt.getTime();
    const isOld = age > maxAgeMs;
    const isProtected = isGoldenSnapshot(item) && policy.keepMonthlySnapshots;
    const isWithinMinCount = i >= sortedByAge.length - policy.minKeepCount;

    // Prune if: old AND not protected AND not within min keep count
    if (isOld && !isProtected && !isWithinMinCount) {
      agePruneTargets.push(item);
    }
  }

  // Step 3: Apply size-based pruning if total size exceeds limit
  const sizePruneTargets: StorjItem[] = [];

  if (policy.maxTotalSizeBytes) {
    const totalSize = remainingItems.reduce(
      (sum, item) => sum + item.sizeBytes,
      0,
    );

    if (totalSize > policy.maxTotalSizeBytes) {
      console.log(
        `[Pruning] Total size ${totalSize} exceeds limit ${policy.maxTotalSizeBytes}`,
      );

      // Remove oldest items until under limit
      let currentSize = totalSize;
      const sortedByAgeAsc = [...remainingItems].sort(
        (a, b) => a.uploadedAt.getTime() - b.uploadedAt.getTime(),
      );

      for (const item of sortedByAgeAsc) {
        if (currentSize <= policy.maxTotalSizeBytes) {
          break;
        }

        // Don't remove if already marked for other pruning
        if (
          agePruneTargets.includes(item) ||
          duplicatesToRemove.includes(item)
        ) {
          continue;
        }

        // Don't remove if protected
        if (isGoldenSnapshot(item) && policy.keepMonthlySnapshots) {
          continue;
        }

        // Don't remove if within min keep count
        const indexFromEnd =
          sortedByAgeAsc.length - sortedByAgeAsc.indexOf(item) - 1;
        if (indexFromEnd < policy.minKeepCount) {
          continue;
        }

        sizePruneTargets.push(item);
        currentSize -= item.sizeBytes;
      }
    }
  }

  // Combine all prune targets (deduplicate)
  const allPruneTargets = new Set([
    ...duplicatesToRemove,
    ...agePruneTargets,
    ...sizePruneTargets,
  ]);

  return Array.from(allPruneTargets);
}

/**
 * Execute pruning by deleting selected items from Storj
 *
 * Note: This requires the StorageService to support deletion
 * You'll need to implement a delete method in StorageService
 */
export async function executePruning(
  itemsToPrune: StorjItem[],
  deleteFunction: (uri: string) => Promise<boolean>,
): Promise<PruningResult> {
  const result: PruningResult = {
    itemsScanned: itemsToPrune.length,
    itemsDeleted: 0,
    bytesFreed: 0,
    duplicatesRemoved: 0,
    errors: [],
  };

  console.log(`[Pruning] Executing pruning for ${itemsToPrune.length} items`);

  for (const item of itemsToPrune) {
    try {
      const deleted = await deleteFunction(item.uri);

      if (deleted) {
        result.itemsDeleted++;
        result.bytesFreed += item.sizeBytes;

        // Count duplicates (items with same content hash as others in prune list)
        const isDuplicate = itemsToPrune.some(
          (other) => other !== item && other.contentHash === item.contentHash,
        );
        if (isDuplicate) {
          result.duplicatesRemoved++;
        }

        console.log(`[Pruning] Deleted: ${item.uri} (${item.sizeBytes} bytes)`);
      } else {
        result.errors.push(`Failed to delete ${item.uri}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      result.errors.push(`Error deleting ${item.uri}: ${errorMsg}`);
      console.error(`[Pruning] Error deleting ${item.uri}:`, error);
    }
  }

  console.log(`[Pruning] Complete:`, result);

  return result;
}

/**
 * Build a pruning summary for user display
 */
export function buildPruningSummary(result: PruningResult): string {
  const mbFreed = (result.bytesFreed / (1024 * 1024)).toFixed(2);

  return `
Pruning Complete:
- Scanned: ${result.itemsScanned} items
- Deleted: ${result.itemsDeleted} items
- Space freed: ${mbFreed} MB
- Duplicates removed: ${result.duplicatesRemoved}
${result.errors.length > 0 ? `- Errors: ${result.errors.length}` : ""}
  `.trim();
}
