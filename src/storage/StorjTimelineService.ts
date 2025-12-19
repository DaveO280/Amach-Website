/**
 * StorjTimelineService - Unified service for storing timeline events on Storj
 *
 * Handles:
 * - Encrypted storage of timeline events
 * - Batch operations for multiple events
 * - Integration with blockchain for on-chain references
 * - Event versioning and updates
 */

import type {
  StorjStorageMetadata,
  StorjTimelineEvent,
} from "../types/storjStorage";
import type { WalletEncryptionKey } from "../utils/walletEncryption";
import { StorageService, createStorageService } from "./StorageService";

export interface TimelineEventOptions {
  metadata?: Record<string, string>;
  onProgress?: (progress: number) => void;
}

export interface TimelineEventResult {
  success: boolean;
  storjUri?: string;
  contentHash?: string;
  eventId?: string;
  error?: string;
}

export interface BatchTimelineEventResult {
  success: boolean;
  results: Array<{
    eventId: string;
    storjUri?: string;
    contentHash?: string;
    error?: string;
  }>;
  totalUploaded: number;
  totalFailed: number;
}

/**
 * Service for managing timeline events on Storj
 */
export class StorjTimelineService {
  private storageService: StorageService;

  constructor(storageService?: StorageService) {
    this.storageService = storageService || createStorageService();
  }

  /**
   * Store a single timeline event on Storj
   *
   * @param event - Timeline event to store
   * @param userAddress - User's wallet address
   * @param encryptionKey - Wallet-derived encryption key
   * @param options - Storage options
   * @returns Storage result with URI and content hash
   */
  async storeTimelineEvent(
    event: StorjTimelineEvent,
    userAddress: string,
    encryptionKey: WalletEncryptionKey,
    options?: TimelineEventOptions,
  ): Promise<TimelineEventResult> {
    try {
      console.log(
        `💾 Storing timeline event: ${event.eventType} (${event.id})`,
      );

      const stored = await this.storageService.storeHealthData(
        event,
        userAddress,
        encryptionKey,
        {
          dataType: "timeline-event",
          metadata: {
            eventId: event.id,
            eventType: event.eventType,
            timestamp: event.timestamp.toString(),
            ...options?.metadata,
          },
          onProgress: options?.onProgress,
        },
      );

      console.log(`✅ Timeline event stored: ${stored.storjUri}`);

      return {
        success: true,
        storjUri: stored.storjUri,
        contentHash: stored.contentHash,
        eventId: event.id,
      };
    } catch (error) {
      console.error("❌ Failed to store timeline event:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Retrieve a timeline event from Storj
   *
   * @param storjUri - Storj URI of the event
   * @param encryptionKey - Wallet-derived encryption key
   * @param expectedHash - Optional expected content hash for verification
   * @returns Decrypted timeline event
   */
  async retrieveTimelineEvent(
    storjUri: string,
    encryptionKey: WalletEncryptionKey,
    expectedHash?: string,
  ): Promise<StorjTimelineEvent | null> {
    console.log(`🔍 Retrieving timeline event from: ${storjUri}`);
    try {
      const result =
        await this.storageService.retrieveHealthData<StorjTimelineEvent>(
          storjUri,
          encryptionKey,
          expectedHash,
        );

      if (!result.verified && expectedHash) {
        console.warn(`⚠️ Timeline event hash mismatch: ${storjUri}`);
      }

      console.log(
        `✅ Retrieved timeline event from ${storjUri}, hasData: ${!!result.data}`,
      );
      return result.data;
    } catch (error) {
      console.error(
        `❌ Failed to retrieve timeline event from ${storjUri}:`,
        error instanceof Error ? error.message : error,
      );
      return null;
    }
  }

  /**
   * Store multiple timeline events in batch
   *
   * @param events - Array of timeline events to store
   * @param userAddress - User's wallet address
   * @param encryptionKey - Wallet-derived encryption key
   * @param options - Storage options
   * @returns Batch result with individual results
   */
  async storeTimelineEventsBatch(
    events: StorjTimelineEvent[],
    userAddress: string,
    encryptionKey: WalletEncryptionKey,
    options?: TimelineEventOptions,
  ): Promise<BatchTimelineEventResult> {
    console.log(`💾 Storing ${events.length} timeline events in batch...`);

    const results = await Promise.allSettled(
      events.map((event) =>
        this.storeTimelineEvent(event, userAddress, encryptionKey, options),
      ),
    );

    const processedResults = results.map((result, index) => {
      if (result.status === "fulfilled") {
        return {
          eventId: events[index].id,
          storjUri: result.value.storjUri,
          contentHash: result.value.contentHash,
          error: result.value.error,
        };
      } else {
        return {
          eventId: events[index].id,
          error: result.reason?.message || "Unknown error",
        };
      }
    });

    const totalUploaded = processedResults.filter((r) => r.storjUri).length;
    const totalFailed = processedResults.length - totalUploaded;

    console.log(
      `✅ Batch upload complete: ${totalUploaded} succeeded, ${totalFailed} failed`,
    );

    return {
      success: totalFailed === 0,
      results: processedResults,
      totalUploaded,
      totalFailed,
    };
  }

  /**
   * Retrieve multiple timeline events from Storj
   *
   * @param storjUris - Array of Storj URIs to retrieve
   * @param encryptionKey - Wallet-derived encryption key
   * @returns Array of retrieved events (null for failed retrievals)
   */
  async retrieveTimelineEventsBatch(
    storjUris: string[],
    encryptionKey: WalletEncryptionKey,
  ): Promise<Array<StorjTimelineEvent | null>> {
    console.log(
      `📖 Retrieving ${storjUris.length} timeline events from Storj...`,
    );

    const results = await Promise.allSettled(
      storjUris.map((uri) => this.retrieveTimelineEvent(uri, encryptionKey)),
    );

    return results.map((result) =>
      result.status === "fulfilled" ? result.value : null,
    );
  }

  /**
   * List all timeline events for a user
   *
   * @param userAddress - User's wallet address
   * @param encryptionKey - Wallet-derived encryption key (required for bucket access)
   * @returns Array of storage references
   */
  async listUserTimelineEvents(
    userAddress: string,
    encryptionKey: WalletEncryptionKey,
  ): Promise<StorjStorageMetadata[]> {
    const references = await this.storageService.listUserData(
      userAddress,
      encryptionKey,
      "timeline-event",
    );

    return references.map((ref) => ({
      userId: userAddress,
      dataType: "timeline-event" as const,
      storjUri: ref.uri,
      contentHash: ref.contentHash,
      size: ref.size,
      uploadedAt: ref.uploadedAt,
      isActive: true,
      version: 1,
    }));
  }

  /**
   * Delete a timeline event from Storj
   *
   * @param storjUri - Storj URI to delete
   * @param userAddress - User's wallet address
   * @param encryptionKey - Wallet-derived encryption key
   */
  async deleteTimelineEvent(
    storjUri: string,
    userAddress: string,
    encryptionKey: WalletEncryptionKey,
  ): Promise<void> {
    await this.storageService.deleteHealthData(
      storjUri,
      userAddress,
      encryptionKey,
    );
    console.log(`🗑️ Deleted timeline event: ${storjUri}`);
  }
}

/**
 * Create a StorjTimelineService instance
 */
export function createStorjTimelineService(): StorjTimelineService {
  return new StorjTimelineService();
}

// Export singleton for convenience
let _timelineService: StorjTimelineService | null = null;

export function getStorjTimelineService(): StorjTimelineService {
  if (!_timelineService) {
    _timelineService = createStorjTimelineService();
  }
  return _timelineService;
}
