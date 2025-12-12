/**
 * StorjConversationService - Service for storing conversation history on Storj
 *
 * Handles:
 * - Encrypted storage of conversation sessions
 * - Full conversation history snapshots
 * - Individual message storage
 * - Sync with local IndexedDB conversation memory
 */

import type { ConversationMemory } from "../types/conversationMemory";
import type {
  StorjConversationHistory,
  StorjConversationMessage,
  StorjConversationSession,
  StorjStorageMetadata,
  SyncStatus,
} from "../types/storjStorage";
import type { WalletEncryptionKey } from "../utils/walletEncryption";
import { StorageService, createStorageService } from "./StorageService";

export interface ConversationStorageOptions {
  metadata?: Record<string, string>;
  onProgress?: (progress: number) => void;
}

export interface ConversationStorageResult {
  success: boolean;
  storjUri?: string;
  contentHash?: string;
  sessionId?: string;
  error?: string;
}

/**
 * Service for managing conversation history on Storj
 */
export class StorjConversationService {
  private storageService: StorageService;

  constructor(storageService?: StorageService) {
    this.storageService = storageService || createStorageService();
  }

  /**
   * Store a conversation session on Storj
   *
   * @param session - Conversation session to store
   * @param messages - Messages in the session
   * @param userAddress - User's wallet address
   * @param encryptionKey - Wallet-derived encryption key
   * @param options - Storage options
   * @returns Storage result with URI and content hash
   */
  async storeConversationSession(
    session: StorjConversationSession,
    messages: StorjConversationMessage[],
    userAddress: string,
    encryptionKey: WalletEncryptionKey,
    options?: ConversationStorageOptions,
  ): Promise<ConversationStorageResult> {
    try {
      console.log(`💾 Storing conversation session: ${session.id}`);

      const sessionData = {
        session,
        messages,
      };

      const stored = await this.storageService.storeHealthData(
        sessionData,
        userAddress,
        encryptionKey,
        {
          dataType: "conversation-session",
          metadata: {
            sessionId: session.id,
            messageCount: messages.length.toString(),
            importance: session.importance,
            startedAt: session.startedAt.toString(),
            ...options?.metadata,
          },
          onProgress: options?.onProgress,
        },
      );

      console.log(`✅ Conversation session stored: ${stored.storjUri}`);

      return {
        success: true,
        storjUri: stored.storjUri,
        contentHash: stored.contentHash,
        sessionId: session.id,
      };
    } catch (error) {
      console.error("❌ Failed to store conversation session:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Retrieve a conversation session from Storj
   *
   * @param storjUri - Storj URI of the session
   * @param encryptionKey - Wallet-derived encryption key
   * @returns Session data with messages
   */
  async retrieveConversationSession(
    storjUri: string,
    encryptionKey: WalletEncryptionKey,
  ): Promise<{
    session: StorjConversationSession;
    messages: StorjConversationMessage[];
  } | null> {
    try {
      const result = await this.storageService.retrieveHealthData<{
        session: StorjConversationSession;
        messages: StorjConversationMessage[];
      }>(storjUri, encryptionKey);

      return result.data;
    } catch (error) {
      console.error(
        `❌ Failed to retrieve conversation session from ${storjUri}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Store full conversation history snapshot on Storj
   * This is a complete backup of all conversation memory
   *
   * @param history - Full conversation history
   * @param userAddress - User's wallet address
   * @param encryptionKey - Wallet-derived encryption key
   * @param options - Storage options
   * @returns Storage result
   */
  async storeConversationHistory(
    history: StorjConversationHistory,
    userAddress: string,
    encryptionKey: WalletEncryptionKey,
    options?: ConversationStorageOptions,
  ): Promise<ConversationStorageResult> {
    try {
      console.log(
        `💾 Storing conversation history snapshot for user: ${userAddress}`,
      );

      const stored = await this.storageService.storeHealthData(
        history,
        userAddress,
        encryptionKey,
        {
          dataType: "conversation-history",
          metadata: {
            version: history.version.toString(),
            sessionCount: history.sessions.length.toString(),
            factCount: history.criticalFacts.length.toString(),
            lastSyncedAt: history.lastSyncedAt.toString(),
            ...options?.metadata,
          },
          onProgress: options?.onProgress,
        },
      );

      console.log(`✅ Conversation history stored: ${stored.storjUri}`);

      return {
        success: true,
        storjUri: stored.storjUri,
        contentHash: stored.contentHash,
      };
    } catch (error) {
      console.error("❌ Failed to store conversation history:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Retrieve conversation history from Storj
   *
   * @param storjUri - Storj URI of the history
   * @param encryptionKey - Wallet-derived encryption key
   * @returns Conversation history
   */
  async retrieveConversationHistory(
    storjUri: string,
    encryptionKey: WalletEncryptionKey,
  ): Promise<StorjConversationHistory | null> {
    try {
      const result =
        await this.storageService.retrieveHealthData<StorjConversationHistory>(
          storjUri,
          encryptionKey,
        );

      return result.data;
    } catch (error) {
      console.error(
        `❌ Failed to retrieve conversation history from ${storjUri}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Convert local ConversationMemory to StorjConversationHistory format
   *
   * @param memory - Local conversation memory from IndexedDB
   * @param sessions - Optional additional sessions to include
   * @returns Storj conversation history format
   */
  convertMemoryToHistory(
    memory: ConversationMemory,
    sessions?: StorjConversationSession[],
  ): StorjConversationHistory {
    return {
      userId: memory.userId,
      version: 1,
      lastSyncedAt: Date.now(),
      sessions:
        sessions ||
        ([
          ...memory.importantSessions.map((s) => ({
            id: s.id,
            userId: memory.userId,
            startedAt: new Date(s.date).getTime(),
            messageCount: s.messageCount,
            summary: s.summary,
            importance: s.importance,
            topics: s.topics,
            extractedFacts: s.extractedFacts,
          })),
          ...memory.recentSessions.map((s) => ({
            id: s.id,
            userId: memory.userId,
            startedAt: new Date(s.date).getTime(),
            messageCount: s.messageCount,
            summary: s.summary,
            importance: s.importance,
            topics: s.topics,
            extractedFacts: s.extractedFacts,
          })),
        ] as StorjConversationSession[]),
      criticalFacts: memory.criticalFacts.map((f) => ({
        id: f.id,
        category: f.category,
        value: f.value,
        context: f.context,
        dateIdentified: f.dateIdentified,
        isActive: f.isActive,
        storageLocation: f.storageLocation,
        blockchainTxHash: f.blockchainTxHash,
      })),
      preferences: memory.preferences as Record<string, unknown>,
    };
  }

  /**
   * Sync local conversation memory to Storj
   *
   * @param memory - Local conversation memory
   * @param userAddress - User's wallet address
   * @param encryptionKey - Wallet-derived encryption key
   * @param options - Storage options
   * @returns Sync result with Storj URI
   */
  async syncMemoryToStorj(
    memory: ConversationMemory,
    userAddress: string,
    encryptionKey: WalletEncryptionKey,
    options?: ConversationStorageOptions,
  ): Promise<ConversationStorageResult> {
    try {
      console.log(
        `🔄 Syncing conversation memory to Storj for user: ${userAddress}`,
      );

      const history = this.convertMemoryToHistory(memory);
      const result = await this.storeConversationHistory(
        history,
        userAddress,
        encryptionKey,
        options,
      );

      if (result.success) {
        console.log(
          `✅ Conversation memory synced to Storj: ${result.storjUri}`,
        );
      }

      return result;
    } catch (error) {
      console.error("❌ Failed to sync conversation memory to Storj:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * List all conversation sessions for a user
   *
   * @param userAddress - User's wallet address
   * @param encryptionKey - Wallet-derived encryption key (required for bucket access)
   * @returns Array of storage metadata
   */
  async listUserConversationSessions(
    userAddress: string,
    encryptionKey: WalletEncryptionKey,
  ): Promise<StorjStorageMetadata[]> {
    const references = await this.storageService.listUserData(
      userAddress,
      encryptionKey,
      "conversation-session",
    );

    return references.map((ref) => ({
      userId: userAddress,
      dataType: "conversation-session" as const,
      storjUri: ref.uri,
      contentHash: ref.contentHash,
      size: ref.size,
      uploadedAt: ref.uploadedAt,
      isActive: true,
      version: 1,
    }));
  }

  /**
   * List all conversation history snapshots for a user
   *
   * @param userAddress - User's wallet address
   * @param encryptionKey - Wallet-derived encryption key (required for bucket access)
   * @returns Array of storage metadata
   */
  async listUserConversationHistory(
    userAddress: string,
    encryptionKey: WalletEncryptionKey,
  ): Promise<StorjStorageMetadata[]> {
    const references = await this.storageService.listUserData(
      userAddress,
      encryptionKey,
      "conversation-history",
    );

    return references.map((ref) => ({
      userId: userAddress,
      dataType: "conversation-history" as const,
      storjUri: ref.uri,
      contentHash: ref.contentHash,
      size: ref.size,
      uploadedAt: ref.uploadedAt,
      isActive: true,
      version: 1,
    }));
  }

  /**
   * Get sync status for a user's conversation data
   *
   * @param userAddress - User's wallet address
   * @param encryptionKey - Wallet-derived encryption key (required for bucket access)
   * @param localMemoryHash - Hash of local memory for comparison
   * @returns Sync status
   */
  async getSyncStatus(
    userAddress: string,
    encryptionKey: WalletEncryptionKey,
    localMemoryHash?: string,
  ): Promise<SyncStatus> {
    try {
      const historySnapshots = await this.listUserConversationHistory(
        userAddress,
        encryptionKey,
      );

      if (historySnapshots.length === 0) {
        return {
          pendingChanges: true,
          conflictDetected: false,
        };
      }

      // Get the most recent snapshot
      const latestSnapshot = historySnapshots.sort(
        (a, b) => b.uploadedAt - a.uploadedAt,
      )[0];

      return {
        lastSyncAt: latestSnapshot.uploadedAt,
        lastSyncHash: latestSnapshot.contentHash,
        pendingChanges: localMemoryHash
          ? localMemoryHash !== latestSnapshot.contentHash
          : false,
        conflictDetected: false,
      };
    } catch (error) {
      return {
        pendingChanges: true,
        conflictDetected: false,
        syncError: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Delete a conversation session from Storj
   *
   * @param storjUri - Storj URI to delete
   * @param userAddress - User's wallet address
   * @param encryptionKey - Wallet-derived encryption key
   */
  async deleteConversationSession(
    storjUri: string,
    userAddress: string,
    encryptionKey: WalletEncryptionKey,
  ): Promise<void> {
    await this.storageService.deleteHealthData(
      storjUri,
      userAddress,
      encryptionKey,
    );
    console.log(`🗑️ Deleted conversation session: ${storjUri}`);
  }
}

/**
 * Create a StorjConversationService instance
 */
export function createStorjConversationService(): StorjConversationService {
  return new StorjConversationService();
}

// Export singleton for convenience
let _conversationService: StorjConversationService | null = null;

export function getStorjConversationService(): StorjConversationService {
  if (!_conversationService) {
    _conversationService = createStorjConversationService();
  }
  return _conversationService;
}
