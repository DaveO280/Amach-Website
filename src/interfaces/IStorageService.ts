/**
 * IStorageService - Abstract interface for encrypted health data storage
 *
 * Implementations:
 * - StorjStorageService (web): Current Storj + wallet encryption
 * - CloudKitStorageService (iOS): Future native iOS CloudKit implementation
 * - MockStorageService (tests): In-memory storage for unit tests
 *
 * This abstraction allows:
 * - Easy testing with mock implementations
 * - Platform-specific storage backends (web vs native iOS)
 * - Consistent API across the application
 */

export interface StorageReference {
  uri: string;
  contentHash: string;
  size: number;
  uploadedAt: number;
  dataType: string;
  metadata?: Record<string, string>;
}

export interface StoredData<T = unknown> {
  data: T;
  uri: string;
  contentHash: string;
  verified: boolean;
}

export interface StoreOptions {
  dataType: string;
  metadata?: Record<string, string>;
  onProgress?: (progress: number) => void;
}

export interface ListOptions {
  dataType?: string;
  limit?: number;
  offset?: number;
}

/**
 * Abstract interface for encrypted health data storage
 *
 * All methods are async and handle encryption/decryption transparently.
 * Implementations must ensure data is encrypted at rest.
 */
export interface IStorageService {
  /**
   * Store health data with encryption
   * @param data - Data to store (will be serialized)
   * @param userId - User identifier (wallet address or user ID)
   * @param options - Storage options including data type and metadata
   * @returns Storage reference with URI and content hash
   */
  store<T>(
    data: T,
    userId: string,
    options: StoreOptions,
  ): Promise<StorageReference>;

  /**
   * Retrieve and decrypt stored data
   * @param uri - Storage URI
   * @param expectedHash - Optional hash for verification
   * @returns Decrypted data with verification status
   */
  retrieve<T>(uri: string, expectedHash?: string): Promise<StoredData<T>>;

  /**
   * Update existing data (overwrites at same URI)
   * @param uri - Existing URI to update
   * @param data - New data
   * @param userId - User identifier
   * @param options - Storage options
   * @returns Updated storage reference
   */
  update<T>(
    uri: string,
    data: T,
    userId: string,
    options: StoreOptions,
  ): Promise<StorageReference>;

  /**
   * Delete stored data
   * @param uri - URI to delete
   */
  delete(uri: string): Promise<void>;

  /**
   * List stored items for a user
   * @param userId - User identifier
   * @param options - List options (filter, pagination)
   * @returns Array of storage references
   */
  list(userId: string, options?: ListOptions): Promise<StorageReference[]>;

  /**
   * Check if data exists at URI
   * @param uri - URI to check
   */
  exists(uri: string): Promise<boolean>;

  /**
   * Verify data integrity without full download
   * @param uri - URI to verify
   * @param expectedHash - Expected content hash
   */
  verifyIntegrity(uri: string, expectedHash: string): Promise<boolean>;
}

/**
 * Factory function type for creating storage service instances
 */
export type StorageServiceFactory = () => IStorageService;
