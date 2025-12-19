/**
 * StorageService - Orchestrates encryption, Storj upload, and on-chain references
 *
 * This service handles the complete flow for storing health data:
 * 1. Encrypt data locally with wallet-derived key
 * 2. Upload encrypted data to Storj
 * 3. Return URI and content hash for on-chain storage
 *
 * For retrieval:
 * 1. Download encrypted data from Storj
 * 2. Verify content hash
 * 3. Decrypt with wallet-derived key
 */

import {
  WalletEncryptionKey,
  decryptWithWalletKey,
  encryptWithWalletKey,
} from "../utils/walletEncryption";
import { StorageReference, StorjClient } from "./StorjClient";

export interface StoredHealthData {
  storjUri: string;
  contentHash: string;
  size: number;
  uploadedAt: number;
  dataType: string;
}

export interface RetrievedHealthData<T = unknown> {
  data: T;
  storjUri: string;
  contentHash: string;
  verified: boolean;
}

export interface StoreOptions {
  dataType: string;
  metadata?: Record<string, string>;
  onProgress?: (progress: number) => void;
}

/**
 * Service for storing and retrieving encrypted health data via Storj
 * Uses strict bucket validation to ensure users can only access their own bucket
 */
export class StorageService {
  private storjClient: StorjClient;

  constructor(storjClient?: StorjClient) {
    // Use provided client or create one with strict validation
    this.storjClient = storjClient || StorjClient.createClient();
  }

  /**
   * Store health data: encrypt locally, upload to Storj
   *
   * @param data - Data to store (will be JSON serialized)
   * @param userAddress - User's wallet address
   * @param encryptionKey - Wallet-derived encryption key
   * @param options - Storage options
   * @returns Storage reference with URI and content hash
   */
  async storeHealthData<T>(
    data: T,
    userAddress: string,
    encryptionKey: WalletEncryptionKey,
    options: StoreOptions,
  ): Promise<StoredHealthData> {
    try {
      // 1. Serialize data to JSON
      const jsonData = JSON.stringify(data);

      // 2. Encrypt with wallet-derived key
      const encryptedData = encryptWithWalletKey(jsonData, encryptionKey);

      // 3. Convert to Uint8Array for Storj
      const encryptedBytes = new TextEncoder().encode(encryptedData);

      // 4. Upload to Storj (bucket validation happens inside)
      const reference = await this.storjClient.uploadEncryptedData(
        userAddress,
        encryptedBytes,
        encryptionKey,
        {
          dataType: options.dataType,
          metadata: {
            ...options.metadata,
            encryptionVersion: "1",
            encryptedAt: Date.now().toString(),
          },
          onProgress: options.onProgress,
        },
      );

      console.log(
        `✅ Stored health data: ${reference.uri} (${reference.size} bytes)`,
      );

      return {
        storjUri: reference.uri,
        contentHash: reference.contentHash,
        size: reference.size,
        uploadedAt: reference.uploadedAt,
        dataType: options.dataType,
      };
    } catch (error) {
      console.error("❌ Failed to store health data:", error);
      throw new Error(
        `Failed to store health data: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Retrieve health data: download from Storj, verify, decrypt
   *
   * @param storjUri - Storj URI of the data
   * @param encryptionKey - Wallet-derived encryption key
   * @param expectedHash - Optional expected content hash for verification
   * @returns Decrypted data with verification status
   */
  async retrieveHealthData<T>(
    storjUri: string,
    encryptionKey: WalletEncryptionKey,
    expectedHash?: string,
    userAddress?: string,
  ): Promise<RetrievedHealthData<T>> {
    try {
      // 1. Download encrypted data from Storj (bucket validation happens inside)
      const downloadResult = await this.storjClient.downloadEncryptedData(
        storjUri,
        userAddress,
        encryptionKey,
      );

      // 2. Verify content hash if provided
      let verified = true;
      if (expectedHash && downloadResult.contentHash) {
        // Normalize both hashes by removing '0x' prefix if present
        const normalizedExpected = expectedHash
          .toLowerCase()
          .replace(/^0x/, "");
        const normalizedGot = downloadResult.contentHash
          .toLowerCase()
          .replace(/^0x/, "");

        if (normalizedExpected !== normalizedGot) {
          console.warn(
            `⚠️ Content hash mismatch for ${storjUri}. Expected: ${expectedHash}, Got: ${downloadResult.contentHash}`,
          );
          verified = false;
        }
      }

      // 3. Convert Uint8Array back to string
      const encryptedData = new TextDecoder().decode(downloadResult.data);

      // 4. Decrypt with wallet-derived key
      const decryptedJson = decryptWithWalletKey(encryptedData, encryptionKey);

      // 5. Parse JSON
      const data = JSON.parse(decryptedJson) as T;

      console.log(`✅ Retrieved and decrypted data from ${storjUri}`);

      return {
        data,
        storjUri,
        contentHash: downloadResult.contentHash,
        verified,
      };
    } catch (error) {
      console.error(
        `❌ Failed to retrieve health data from ${storjUri}:`,
        error,
      );
      throw new Error(
        `Failed to retrieve health data: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Update existing health data (overwrites at same URI)
   *
   * @param oldUri - URI of existing data to overwrite
   * @param newData - New data to store
   * @param userAddress - User's wallet address
   * @param encryptionKey - Wallet-derived encryption key
   * @param options - Storage options
   * @returns Updated storage reference (same URI)
   */
  async updateHealthData<T>(
    oldUri: string,
    newData: T,
    userAddress: string,
    encryptionKey: WalletEncryptionKey,
    options: StoreOptions,
  ): Promise<StoredHealthData> {
    try {
      // 1. Serialize and encrypt new data
      const jsonData = JSON.stringify(newData);
      const encryptedData = encryptWithWalletKey(jsonData, encryptionKey);
      const encryptedBytes = new TextEncoder().encode(encryptedData);

      // 2. Overwrite the existing Storj file (keeps same URI)
      const reference = await this.storjClient.overwriteEncryptedData(
        oldUri,
        encryptedBytes,
        userAddress,
        encryptionKey,
        {
          dataType: options.dataType,
          metadata: {
            ...options.metadata,
            encryptionVersion: "1",
            encryptedAt: Date.now().toString(),
          },
          onProgress: options.onProgress,
        },
      );

      // 3. Verify encryption/decryption
      const decryptedData = decryptWithWalletKey(encryptedData, encryptionKey);
      if (decryptedData !== jsonData) {
        throw new Error("Encryption verification failed after update");
      }

      console.log(`✅ Updated data at ${reference.uri} (same URI preserved)`);

      return {
        storjUri: reference.uri,
        contentHash: reference.contentHash,
        size: reference.size,
        uploadedAt: reference.uploadedAt,
        dataType: reference.dataType,
      };
    } catch (error) {
      console.error("❌ Failed to update health data:", error);
      throw new Error(
        `Failed to update health data: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Delete health data (GDPR compliance)
   *
   * @param storjUri - URI of data to delete
   */
  async deleteHealthData(
    storjUri: string,
    userAddress: string,
    encryptionKey: WalletEncryptionKey,
  ): Promise<void> {
    try {
      await this.storjClient.deleteEncryptedData(
        storjUri,
        userAddress,
        encryptionKey,
      );
      console.log(`🗑️ Deleted health data at ${storjUri}`);
    } catch (error) {
      console.error(`❌ Failed to delete health data at ${storjUri}:`, error);
      throw new Error(
        `Failed to delete health data: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * List all stored data for a user
   *
   * @param userAddress - User's wallet address
   * @param dataType - Optional filter by data type
   * @returns Array of storage references
   */
  async listUserData(
    userAddress: string,
    encryptionKey: WalletEncryptionKey,
    dataType?: string,
  ): Promise<StorageReference[]> {
    // Bucket validation happens inside listUserData
    return this.storjClient.listUserData(userAddress, encryptionKey, dataType);
  }

  /**
   * Verify data integrity without downloading full content
   *
   * @param storjUri - URI to verify
   * @param expectedHash - Expected content hash
   * @returns True if hash matches
   */
  async verifyIntegrity(
    storjUri: string,
    expectedHash: string,
  ): Promise<boolean> {
    return this.storjClient.verifyIntegrity(storjUri, expectedHash);
  }

  /**
   * Check if data exists
   *
   * @param storjUri - URI to check
   * @returns True if exists
   */
  async exists(storjUri: string): Promise<boolean> {
    return this.storjClient.exists(storjUri);
  }

  /**
   * Batch retrieve multiple items
   *
   * @param items - Array of URIs and expected hashes
   * @param encryptionKey - Wallet-derived encryption key
   * @returns Array of retrieved data
   */
  async batchRetrieve<T>(
    items: Array<{ storjUri: string; expectedHash?: string }>,
    encryptionKey: WalletEncryptionKey,
  ): Promise<RetrievedHealthData<T>[]> {
    const results = await Promise.allSettled(
      items.map((item) =>
        this.retrieveHealthData<T>(
          item.storjUri,
          encryptionKey,
          item.expectedHash,
        ),
      ),
    );

    return results
      .filter(
        (result): result is PromiseFulfilledResult<RetrievedHealthData<T>> =>
          result.status === "fulfilled",
      )
      .map((result) => result.value);
  }
}

/**
 * Create a StorageService instance
 */
export function createStorageService(): StorageService {
  return new StorageService();
}

// Export singleton for convenience
let _storageService: StorageService | null = null;

export function getStorageService(): StorageService {
  if (!_storageService) {
    _storageService = createStorageService();
  }
  return _storageService;
}
