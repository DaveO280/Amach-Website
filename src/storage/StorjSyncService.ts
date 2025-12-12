/**
 * StorjSyncService - Syncs local IndexedDB data with Storj
 *
 * Handles:
 * - Automatic sync of conversation memory to Storj
 * - Conflict resolution
 * - Background sync
 * - Sync status tracking
 */

import { conversationMemoryStore } from "../data/store/conversationMemoryStore";
import type { ConversationMemory } from "../types/conversationMemory";
import type { SyncStatus } from "../types/storjStorage";
import type { WalletEncryptionKey } from "../utils/walletEncryption";
import { getStorjConversationService } from "./StorjConversationService";
// Hash function that works in both Node.js and browser
async function computeHash(data: string): Promise<string> {
  if (typeof window !== "undefined" && window.crypto?.subtle) {
    // Browser environment
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } else {
    // Node.js environment
    const { createHash } = await import("crypto");
    return createHash("sha256").update(data).digest("hex");
  }
}

export interface SyncOptions {
  force?: boolean; // Force sync even if no changes detected
  onProgress?: (progress: number) => void;
  background?: boolean; // Run in background without blocking
}

export interface SyncResult {
  success: boolean;
  storjUri?: string;
  contentHash?: string;
  syncStatus?: SyncStatus;
  error?: string;
}

/**
 * Service for syncing local data with Storj
 */
export class StorjSyncService {
  private conversationService = getStorjConversationService();
  private syncInProgress = false;
  private lastSyncTime: Record<string, number> = {}; // userId -> timestamp

  /**
   * Compute hash of conversation memory for change detection
   */
  private async computeMemoryHash(memory: ConversationMemory): Promise<string> {
    const data = JSON.stringify({
      criticalFacts: memory.criticalFacts,
      importantSessions: memory.importantSessions,
      recentSessions: memory.recentSessions,
      preferences: memory.preferences,
      totalSessions: memory.totalSessions,
      totalFactsExtracted: memory.totalFactsExtracted,
    });

    return computeHash(data);
  }

  /**
   * Sync conversation memory from IndexedDB to Storj
   *
   * @param userId - User's wallet address
   * @param encryptionKey - Wallet-derived encryption key
   * @param options - Sync options
   * @returns Sync result
   */
  async syncConversationMemory(
    userId: string,
    encryptionKey: WalletEncryptionKey,
    options?: SyncOptions,
  ): Promise<SyncResult> {
    // Prevent concurrent syncs
    if (this.syncInProgress) {
      return {
        success: false,
        error: "Sync already in progress",
      };
    }

    try {
      this.syncInProgress = true;

      // 1. Load local memory from IndexedDB
      await conversationMemoryStore.initialize();
      const memory = await conversationMemoryStore.getMemory(userId);

      if (!memory) {
        console.log("ℹ️ No local conversation memory to sync");
        return {
          success: true,
          syncStatus: {
            pendingChanges: false,
            conflictDetected: false,
          },
        };
      }

      // 2. Check if sync is needed
      if (!options?.force) {
        const localHash = await this.computeMemoryHash(memory);
        const syncStatus = await this.conversationService.getSyncStatus(
          userId,
          encryptionKey,
          localHash,
        );

        if (!syncStatus.pendingChanges) {
          console.log("ℹ️ No changes detected, skipping sync");
          return {
            success: true,
            syncStatus,
          };
        }
      }

      // 3. Sync to Storj
      console.log(`🔄 Syncing conversation memory to Storj for ${userId}...`);
      const syncResult = await this.conversationService.syncMemoryToStorj(
        memory,
        userId,
        encryptionKey,
        {
          onProgress: options?.onProgress,
        },
      );

      if (syncResult.success) {
        this.lastSyncTime[userId] = Date.now();
        console.log(`✅ Conversation memory synced successfully`);
      }

      // 4. Get updated sync status
      const updatedSyncStatus = await this.conversationService.getSyncStatus(
        userId,
        encryptionKey,
      );

      return {
        success: syncResult.success,
        storjUri: syncResult.storjUri,
        contentHash: syncResult.contentHash,
        syncStatus: updatedSyncStatus,
        error: syncResult.error,
      };
    } catch (error) {
      console.error("❌ Failed to sync conversation memory:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Restore conversation memory from Storj to IndexedDB
   *
   * @param userId - User's wallet address
   * @param encryptionKey - Wallet-derived encryption key
   * @param storjUri - Optional specific Storj URI to restore from
   * @returns Restore result
   */
  async restoreConversationMemory(
    userId: string,
    encryptionKey: WalletEncryptionKey,
    storjUri?: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(
        `📥 Restoring conversation memory from Storj for ${userId}...`,
      );

      let history;

      if (storjUri) {
        // Restore from specific URI
        history = await this.conversationService.retrieveConversationHistory(
          storjUri,
          encryptionKey,
        );
      } else {
        // Get latest snapshot
        const snapshots =
          await this.conversationService.listUserConversationHistory(
            userId,
            encryptionKey,
          );

        if (snapshots.length === 0) {
          return {
            success: false,
            error: "No conversation history found on Storj",
          };
        }

        const latestSnapshot = snapshots.sort(
          (a, b) => b.uploadedAt - a.uploadedAt,
        )[0];

        history = await this.conversationService.retrieveConversationHistory(
          latestSnapshot.storjUri,
          encryptionKey,
        );
      }

      if (!history) {
        return {
          success: false,
          error: "Failed to retrieve conversation history from Storj",
        };
      }

      // Convert Storj history back to ConversationMemory format
      const memory: ConversationMemory = {
        userId: history.userId,
        criticalFacts: history.criticalFacts.map((f) => ({
          id: f.id,
          category:
            f.category as ConversationMemory["criticalFacts"][0]["category"],
          value: f.value,
          context: f.context,
          dateIdentified: f.dateIdentified,
          isActive: f.isActive,
          source: "blockchain" as const,
          storageLocation: f.storageLocation as "local" | "blockchain" | "both",
          blockchainTxHash: f.blockchainTxHash,
        })),
        importantSessions: history.sessions
          .filter((s) => s.importance === "critical" || s.importance === "high")
          .map((s) => ({
            id: s.id,
            date: new Date(s.startedAt).toISOString(),
            summary: s.summary || "",
            topics: s.topics,
            importance: s.importance,
            extractedFacts: s.extractedFacts || [],
            messageCount: s.messageCount,
          })),
        recentSessions: history.sessions
          .filter((s) => s.importance === "medium" || s.importance === "low")
          .map((s) => ({
            id: s.id,
            date: new Date(s.startedAt).toISOString(),
            summary: s.summary || "",
            topics: s.topics,
            importance: s.importance,
            extractedFacts: s.extractedFacts || [],
            messageCount: s.messageCount,
          })),
        preferences: history.preferences as ConversationMemory["preferences"],
        lastUpdated: new Date(history.lastSyncedAt).toISOString(),
        totalSessions: history.sessions.length,
        totalFactsExtracted: history.criticalFacts.length,
      };

      // Save to IndexedDB
      await conversationMemoryStore.initialize();
      await conversationMemoryStore.saveMemory(memory);

      console.log(`✅ Conversation memory restored from Storj`);

      return { success: true };
    } catch (error) {
      console.error("❌ Failed to restore conversation memory:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get sync status for a user
   *
   * @param userId - User's wallet address
   * @param encryptionKey - Wallet-derived encryption key (required for bucket access)
   * @returns Sync status
   */
  async getSyncStatus(
    userId: string,
    encryptionKey: WalletEncryptionKey,
  ): Promise<SyncStatus> {
    try {
      await conversationMemoryStore.initialize();
      const memory = await conversationMemoryStore.getMemory(userId);

      if (!memory) {
        return {
          pendingChanges: false,
          conflictDetected: false,
        };
      }

      const localHash = await this.computeMemoryHash(memory);
      return await this.conversationService.getSyncStatus(
        userId,
        encryptionKey,
        localHash,
      );
    } catch (error) {
      return {
        pendingChanges: true,
        conflictDetected: false,
        syncError: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Check if sync is needed (has pending changes)
   *
   * @param userId - User's wallet address
   * @param encryptionKey - Wallet-derived encryption key (required for bucket access)
   * @returns True if sync is needed
   */
  async needsSync(
    userId: string,
    encryptionKey: WalletEncryptionKey,
  ): Promise<boolean> {
    const status = await this.getSyncStatus(userId, encryptionKey);
    return status.pendingChanges || false;
  }

  /**
   * Get last sync time for a user
   *
   * @param userId - User's wallet address
   * @returns Last sync timestamp or undefined
   */
  getLastSyncTime(userId: string): number | undefined {
    return this.lastSyncTime[userId];
  }
}

/**
 * Create a StorjSyncService instance
 */
export function createStorjSyncService(): StorjSyncService {
  return new StorjSyncService();
}

// Export singleton for convenience
let _syncService: StorjSyncService | null = null;

export function getStorjSyncService(): StorjSyncService {
  if (!_syncService) {
    _syncService = createStorjSyncService();
  }
  return _syncService;
}
