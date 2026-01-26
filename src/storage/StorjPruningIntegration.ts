/**
 * Integration layer between existing StorageService and new Pruning system
 *
 * Converts StorageReference → StorjItem for pruning analysis
 * Wraps deleteHealthData for pruning execution
 */

import type { StorageReference } from "./StorjClient";
import type { PruningResult, StorjItem } from "./StorjPruningService";
import type { StorageService } from "./StorageService";
import type { WalletEncryptionKey } from "@/utils/walletEncryption";

/**
 * Convert StorageReference to StorjItem for pruning analysis
 */
export function convertToStorjItem(
  ref: StorageReference,
  userId: string = "unknown",
): StorjItem {
  return {
    uri: ref.uri,
    metadata: {
      userId,
      dataType: ref.dataType as
        | "timeline-event"
        | "conversation-session"
        | "conversation-history"
        | "conversation-message",
      storjUri: ref.uri,
      contentHash: ref.contentHash,
      size: ref.size,
      uploadedAt: ref.uploadedAt,
      isActive: true,
      version: 1,
    },
    contentHash: ref.contentHash,
    uploadedAt: new Date(ref.uploadedAt),
    sizeBytes: ref.size,
  };
}

/**
 * Fetch all items for a user (for pruning analysis)
 */
export async function fetchAllStorjItems(
  storageService: StorageService,
  userAddress: string,
  encryptionKey: WalletEncryptionKey,
  dataType?: string,
): Promise<StorjItem[]> {
  try {
    console.log(
      `[Pruning] Fetching all items for user ${userAddress.substring(0, 8)}...`,
    );

    const references = await storageService.listUserData(
      userAddress,
      encryptionKey,
      dataType,
    );

    console.log(`[Pruning] Found ${references.length} items`);

    return references.map((ref) => convertToStorjItem(ref, userAddress));
  } catch (error) {
    console.error("[Pruning] Failed to fetch items:", error);
    throw error;
  }
}

/**
 * Delete function wrapper for pruning execution
 */
export function createDeleteFunction(
  storageService: StorageService,
  userAddress: string,
  encryptionKey: WalletEncryptionKey,
): (uri: string) => Promise<boolean> {
  return async (uri: string): Promise<boolean> => {
    try {
      console.log(`[Pruning] Deleting ${uri}...`);

      await storageService.deleteHealthData(uri, userAddress, encryptionKey);

      console.log(`[Pruning] ✅ Deleted ${uri}`);
      return true;
    } catch (error) {
      console.error(`[Pruning] ❌ Failed to delete ${uri}:`, error);
      return false;
    }
  };
}

/**
 * Complete pruning workflow helper
 *
 * Example usage:
 * ```typescript
 * const result = await performPruning(
 *   storageService,
 *   userAddress,
 *   encryptionKey,
 *   "conversation-session"
 * );
 * console.log(`Freed ${result.bytesFreed} bytes`);
 * ```
 */
export async function performPruning(
  storageService: StorageService,
  userAddress: string,
  encryptionKey: WalletEncryptionKey,
  dataType: string,
): Promise<PruningResult> {
  const { selectItemsToPrune, executePruning } =
    await import("./StorjPruningService");

  // Step 1: Fetch all items
  const allItems = await fetchAllStorjItems(
    storageService,
    userAddress,
    encryptionKey,
    dataType,
  );

  console.log(
    `[Pruning] Analyzing ${allItems.length} items of type ${dataType}`,
  );

  // Step 2: Select items to prune
  const itemsToPrune = selectItemsToPrune(allItems, dataType);

  console.log(`[Pruning] Selected ${itemsToPrune.length} items for pruning`);

  if (itemsToPrune.length === 0) {
    console.log("[Pruning] Nothing to prune");
    return {
      itemsScanned: allItems.length,
      itemsDeleted: 0,
      bytesFreed: 0,
      duplicatesRemoved: 0,
      errors: [],
    };
  }

  // Step 3: Execute pruning
  const deleteFunction = createDeleteFunction(
    storageService,
    userAddress,
    encryptionKey,
  );

  const result = await executePruning(itemsToPrune, deleteFunction);

  console.log("[Pruning] Complete:", result);

  return result;
}

/**
 * Calculate storage statistics without pruning
 */
export async function getStorageStats(
  storageService: StorageService,
  userAddress: string,
  encryptionKey: WalletEncryptionKey,
  dataType?: string,
): Promise<{
  totalItems: number;
  totalSizeBytes: number;
  byDataType: Record<string, { count: number; sizeBytes: number }>;
  oldestItem?: Date;
  newestItem?: Date;
}> {
  const items = await fetchAllStorjItems(
    storageService,
    userAddress,
    encryptionKey,
    dataType,
  );

  const byDataType: Record<string, { count: number; sizeBytes: number }> = {};

  let oldestTimestamp = Number.MAX_SAFE_INTEGER;
  let newestTimestamp = 0;

  for (const item of items) {
    const type = item.metadata.dataType;

    if (!byDataType[type]) {
      byDataType[type] = { count: 0, sizeBytes: 0 };
    }

    byDataType[type].count++;
    byDataType[type].sizeBytes += item.sizeBytes;

    const timestamp = item.uploadedAt.getTime();
    if (timestamp < oldestTimestamp) oldestTimestamp = timestamp;
    if (timestamp > newestTimestamp) newestTimestamp = timestamp;
  }

  return {
    totalItems: items.length,
    totalSizeBytes: items.reduce((sum, item) => sum + item.sizeBytes, 0),
    byDataType,
    oldestItem:
      oldestTimestamp < Number.MAX_SAFE_INTEGER
        ? new Date(oldestTimestamp)
        : undefined,
    newestItem: newestTimestamp > 0 ? new Date(newestTimestamp) : undefined,
  };
}

/**
 * Format storage stats for display
 */
export function formatStorageStats(
  stats: Awaited<ReturnType<typeof getStorageStats>>,
): string {
  const totalMB = (stats.totalSizeBytes / (1024 * 1024)).toFixed(2);

  let output = `Storage Statistics:
Total Items: ${stats.totalItems}
Total Size: ${totalMB} MB
`;

  if (stats.oldestItem) {
    output += `Oldest: ${stats.oldestItem.toLocaleDateString()}\n`;
  }

  if (stats.newestItem) {
    output += `Newest: ${stats.newestItem.toLocaleDateString()}\n`;
  }

  output += "\nBy Data Type:\n";

  for (const [type, data] of Object.entries(stats.byDataType)) {
    const sizeMB = (data.sizeBytes / (1024 * 1024)).toFixed(2);
    output += `  ${type}: ${data.count} items (${sizeMB} MB)\n`;
  }

  return output;
}

/**
 * Get detailed snapshot information (monthly/quarterly protected items)
 */
export async function getSnapshotInfo(
  storageService: StorageService,
  userAddress: string,
  encryptionKey: WalletEncryptionKey,
  dataType: string = "health-raw",
): Promise<{
  quarterly: StorjItem[];
  monthly: StorjItem[];
  regular: StorjItem[];
}> {
  const items = await fetchAllStorjItems(
    storageService,
    userAddress,
    encryptionKey,
    dataType,
  );

  const quarterly: StorjItem[] = [];
  const monthly: StorjItem[] = [];
  const regular: StorjItem[] = [];

  for (const item of items) {
    const date = item.uploadedAt;
    const dayOfMonth = date.getDate();
    const month = date.getMonth();

    if (dayOfMonth === 1 && [0, 3, 6, 9].includes(month)) {
      // Quarterly snapshot
      quarterly.push(item);
    } else if (dayOfMonth === 1) {
      // Monthly snapshot (but not quarterly)
      monthly.push(item);
    } else {
      // Regular item
      regular.push(item);
    }
  }

  return { quarterly, monthly, regular };
}

/**
 * Format snapshot info for display
 */
export function formatSnapshotInfo(
  snapshots: Awaited<ReturnType<typeof getSnapshotInfo>>,
): string {
  let output = `\n📸 Protected Snapshots:\n`;

  if (snapshots.quarterly.length > 0) {
    output += `\n🌍 Quarterly Snapshots (for seasonal/YoY analysis):\n`;
    const sorted = [...snapshots.quarterly].sort(
      (a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime(),
    );
    sorted.forEach((item) => {
      const date = item.uploadedAt;
      const quarter = Math.floor(date.getMonth() / 3) + 1;
      const season = ["Winter", "Spring", "Summer", "Fall"][quarter - 1];
      const sizeMB = (item.sizeBytes / (1024 * 1024)).toFixed(2);
      output += `  • Q${quarter} ${date.getFullYear()} (${season}): ${date.toLocaleDateString()} - ${sizeMB} MB\n`;
    });
  }

  if (snapshots.monthly.length > 0) {
    output += `\n📅 Monthly Snapshots:\n`;
    const sorted = [...snapshots.monthly].sort(
      (a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime(),
    );
    sorted.slice(0, 5).forEach((item) => {
      const sizeMB = (item.sizeBytes / (1024 * 1024)).toFixed(2);
      output += `  • ${item.uploadedAt.toLocaleDateString()} - ${sizeMB} MB\n`;
    });
    if (sorted.length > 5) {
      output += `  ... and ${sorted.length - 5} more\n`;
    }
  }

  output += `\n📦 Regular Items: ${snapshots.regular.length}\n`;

  return output;
}
