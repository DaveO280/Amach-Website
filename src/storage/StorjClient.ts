/**
 * @module StorjClient
 * @description S3-compatible client for Storj decentralized storage
 *
 * ## Security Model
 * - Each wallet gets deterministic bucket (address + encryption key hash)
 * - All data encrypted client-side before upload (walletEncryption)
 * - Bucket validation prevents cross-user access
 * - Server credentials used for S3 operations (Storj requirement)
 *
 * ## Usage
 * ```typescript
 * const client = StorjClient.createClient();
 * const ref = await client.uploadEncryptedData(address, data, encryptionKey, options);
 * const result = await client.downloadEncryptedData(ref.uri, address, encryptionKey);
 * ```
 *
 * @see walletEncryption.ts for encryption
 * @see storjAccessControl.ts for bucket validation
 */

import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createHash } from "crypto";
import {
  generateBucketName,
  validateBucketOwnership,
  validateStorjUri,
} from "../utils/storjAccessControl";
import type { WalletEncryptionKey } from "../utils/walletEncryption";

export interface StorjConfig {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  bucketPrefix?: string; // Optional prefix for bucket names (default: "amach-health")
  region?: string;
  // For testing: allow operations without strict validation (NOT for production)
  allowUnvalidatedAccess?: boolean;
}

export interface StorageReference {
  uri: string;
  contentHash: string;
  size: number;
  uploadedAt: number;
  dataType: string;
  metadata?: Record<string, string>;
}

export interface UploadOptions {
  dataType: string;
  metadata?: Record<string, string>;
  onProgress?: (progress: number) => void;
}

export interface DownloadResult {
  data: Uint8Array;
  contentHash: string;
  metadata: Record<string, string>;
}

/**
 * Client for interacting with Storj decentralized storage
 * Each wallet address gets its own discrete bucket for better isolation
 *
 * Security Model:
 * - Server credentials: Used for all S3 operations (Storj S3-compatible requirement)
 * - Bucket validation: Every operation validates bucket ownership
 * - Wallet-derived bucket names: Deterministic based on wallet address
 * - Security: Users can only access buckets they can generate names for (requires wallet)
 */
export class StorjClient {
  private client: S3Client;
  private bucketPrefix: string;
  private bucketCache: Set<string> = new Set(); // Cache of buckets we've verified exist
  private allowUnvalidatedAccess: boolean;

  constructor(config?: StorjConfig) {
    const resolvedConfig = config || this.getConfigFromEnv();

    // Trim credentials to remove any whitespace (Vercel env var issue)
    const accessKeyId = resolvedConfig.accessKeyId.trim();
    const secretAccessKey = resolvedConfig.secretAccessKey.trim();

    console.log("🔧 StorjClient initialization:");
    console.log(
      `  - Access Key ID: ${accessKeyId ? `${accessKeyId.substring(0, 4)}... (length: ${accessKeyId.length})` : "EMPTY"}`,
    );
    console.log(
      `  - Secret Key: ${secretAccessKey ? "***SET*** (length: " + secretAccessKey.length + ")" : "EMPTY"}`,
    );
    console.log(`  - Endpoint: ${resolvedConfig.endpoint}`);
    console.log(`  - Region: ${resolvedConfig.region || "us-east-1"}`);

    this.client = new S3Client({
      endpoint: resolvedConfig.endpoint,
      region: resolvedConfig.region || "us-east-1",
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true, // Required for S3-compatible services
    });

    this.bucketPrefix = resolvedConfig.bucketPrefix || "amach-health";
    this.allowUnvalidatedAccess =
      resolvedConfig.allowUnvalidatedAccess || false;
  }

  /**
   * Create a client instance with strict validation (production mode)
   * All operations will validate bucket ownership
   */
  static createClient(config?: Partial<StorjConfig>): StorjClient {
    const baseConfig: StorjConfig = {
      accessKeyId: config?.accessKeyId || process.env.STORJ_ACCESS_KEY || "",
      secretAccessKey:
        config?.secretAccessKey || process.env.STORJ_SECRET_KEY || "",
      endpoint:
        config?.endpoint ||
        process.env.STORJ_ENDPOINT ||
        "https://gateway.storjshare.io",
      bucketPrefix:
        config?.bucketPrefix ||
        process.env.STORJ_BUCKET_PREFIX ||
        "amach-health",
      allowUnvalidatedAccess: config?.allowUnvalidatedAccess ?? false, // Strict validation
    };
    return new StorjClient(baseConfig);
  }

  /**
   * Create a client instance without validation (testing/visibility mode)
   * WARNING: Only use for testing! Not secure for production.
   */
  static createTestClient(config?: Partial<StorjConfig>): StorjClient {
    const baseConfig: StorjConfig = {
      accessKeyId: config?.accessKeyId || process.env.STORJ_ACCESS_KEY || "",
      secretAccessKey:
        config?.secretAccessKey || process.env.STORJ_SECRET_KEY || "",
      endpoint:
        config?.endpoint ||
        process.env.STORJ_ENDPOINT ||
        "https://gateway.storjshare.io",
      bucketPrefix:
        config?.bucketPrefix ||
        process.env.STORJ_BUCKET_PREFIX ||
        "amach-health",
      allowUnvalidatedAccess: config?.allowUnvalidatedAccess ?? true, // Allow unvalidated access for testing
    };
    return new StorjClient(baseConfig);
  }

  /**
   * Get configuration from environment variables
   */
  private getConfigFromEnv(): StorjConfig {
    const accessKeyId = process.env.STORJ_ACCESS_KEY;
    const secretAccessKey = process.env.STORJ_SECRET_KEY;
    const endpoint =
      process.env.STORJ_ENDPOINT || "https://gateway.storjshare.io";
    const bucketPrefix = process.env.STORJ_BUCKET_PREFIX || "amach-health";

    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        "Storj credentials not configured. Set STORJ_ACCESS_KEY and STORJ_SECRET_KEY environment variables.",
      );
    }

    return {
      accessKeyId,
      secretAccessKey,
      endpoint,
      bucketPrefix,
    };
  }

  /**
   * Generate a bucket name for a wallet address + encryption key
   *
   * SECURITY: Requires encryption key (derived from wallet signature) to generate bucket name.
   * This prevents: server credentials + public wallet address = bucket access.
   * Now requires: server credentials + wallet address + wallet connection (signature).
   *
   * @param userAddress - User's wallet address
   * @param encryptionKey - Wallet-derived encryption key (requires wallet signature)
   * @returns Bucket name
   */
  private generateBucketName(
    userAddress: string,
    encryptionKey: WalletEncryptionKey,
  ): string {
    return generateBucketName(userAddress, encryptionKey, this.bucketPrefix);
  }

  /**
   * Ensure a bucket exists for a user, creating it if necessary
   *
   * Note: Storj S3-compatible API may not support HeadBucketCommand.
   * We use ListObjectsV2 to check existence, or just try to create directly.
   */
  private async ensureBucketExists(bucketName: string): Promise<void> {
    // Check cache first
    if (this.bucketCache.has(bucketName)) {
      return;
    }

    // Try to list objects in the bucket to check if it exists
    // This is more compatible with Storj's S3 API than HeadBucketCommand
    try {
      const listCommand = new ListObjectsV2Command({
        Bucket: bucketName,
        MaxKeys: 1, // Just check if bucket exists, don't need all objects
      });
      await this.client.send(listCommand);
      // Bucket exists, add to cache
      this.bucketCache.add(bucketName);
      return;
    } catch (error: unknown) {
      // Bucket doesn't exist or access denied - try to create it
      const errorObj = error as {
        name?: string;
        Code?: string;
        message?: string;
        $metadata?: { httpStatusCode?: number };
      };
      const errorCode = errorObj.name || errorObj.Code;
      const statusCode = errorObj.$metadata?.httpStatusCode;

      if (
        errorCode === "NoSuchBucket" ||
        statusCode === 404 ||
        statusCode === 403 // Sometimes 403 means bucket doesn't exist
      ) {
        // Create the bucket
        try {
          const createCommand = new CreateBucketCommand({
            Bucket: bucketName,
          });
          await this.client.send(createCommand);
          this.bucketCache.add(bucketName);
          console.log(`✅ Created Storj bucket: ${bucketName}`);
        } catch (createError: unknown) {
          // If bucket was created between check and create, that's fine
          const createErrorObj = createError as {
            name?: string;
            Code?: string;
            message?: string;
          };
          const createErrorCode = createErrorObj.name || createErrorObj.Code;
          if (
            createErrorCode === "BucketAlreadyOwnedByYou" ||
            createErrorCode === "BucketAlreadyExists"
          ) {
            // Bucket exists now, add to cache
            this.bucketCache.add(bucketName);
            console.log(`ℹ️  Bucket ${bucketName} already exists`);
          } else {
            console.error(
              `❌ Failed to create bucket ${bucketName}:`,
              createError,
            );
            throw new Error(
              `Failed to create Storj bucket: ${createErrorObj.message || createErrorCode || "Unknown error"}`,
            );
          }
        }
      } else {
        // For other errors, try creating anyway (might be a permission issue)
        const errorMessage =
          (error as { message?: string }).message || String(error);
        console.warn(
          `⚠️  Error checking bucket ${bucketName} (${errorCode}), attempting to create:`,
          errorMessage,
        );
        try {
          const createCommand = new CreateBucketCommand({
            Bucket: bucketName,
          });
          await this.client.send(createCommand);
          this.bucketCache.add(bucketName);
          console.log(`✅ Created Storj bucket: ${bucketName}`);
        } catch (createError: unknown) {
          const createErrorObj = createError as {
            name?: string;
            Code?: string;
            message?: string;
          };
          const createErrorCode = createErrorObj.name || createErrorObj.Code;
          if (
            createErrorCode === "BucketAlreadyOwnedByYou" ||
            createErrorCode === "BucketAlreadyExists"
          ) {
            this.bucketCache.add(bucketName);
            console.log(`ℹ️  Bucket ${bucketName} already exists`);
          } else {
            console.error(
              `❌ Failed to create bucket ${bucketName}:`,
              createError,
            );
            throw new Error(
              `Failed to create or access Storj bucket: ${createErrorObj.message || createErrorCode || "Unknown error"}. Original error: ${errorCode || "Unknown"}`,
            );
          }
        }
      }
    }
  }

  /**
   * Get the bucket name for a user address + encryption key
   * Validates ownership unless in test mode
   *
   * @param userAddress - User's wallet address
   * @param encryptionKey - Wallet-derived encryption key (requires wallet signature)
   * @returns Bucket name
   */
  private async getBucketForUser(
    userAddress: string,
    encryptionKey: WalletEncryptionKey,
  ): Promise<string> {
    const bucketName = this.generateBucketName(userAddress, encryptionKey);

    // Validate bucket ownership (unless in test mode)
    if (!this.allowUnvalidatedAccess) {
      if (
        !validateBucketOwnership(
          bucketName,
          userAddress,
          encryptionKey,
          this.bucketPrefix,
        )
      ) {
        throw new Error(
          `Security violation: Cannot access bucket ${bucketName} for wallet ${userAddress}`,
        );
      }
    }

    // Ensure bucket exists (creates if needed)
    await this.ensureBucketExists(bucketName);

    return bucketName;
  }

  /**
   * Generate a storage key for user data
   * Since each user has their own bucket, we don't need user address in the key
   */
  private generateKey(dataType: string, timestamp?: number): string {
    const ts = timestamp || Date.now();
    const uuid = createHash("sha256")
      .update(`${ts}-${Math.random()}`)
      .digest("hex")
      .substring(0, 8);
    return `${dataType}/${ts}-${uuid}.enc`;
  }

  /**
   * Compute SHA-256 hash of data
   */
  private computeHash(data: Uint8Array): string {
    return createHash("sha256").update(data).digest("hex");
  }

  /**
   * Upload encrypted data to Storj
   *
   * @param userAddress - User's wallet address (determines which bucket to use)
   * @param encryptedData - Already encrypted data (Uint8Array)
   * @param encryptionKey - Wallet-derived encryption key (required for bucket name generation)
   * @param options - Upload options including dataType and metadata
   * @returns Storage reference with URI and content hash
   */
  async uploadEncryptedData(
    userAddress: string,
    encryptedData: Uint8Array,
    encryptionKey: WalletEncryptionKey,
    options: UploadOptions,
  ): Promise<StorageReference> {
    const bucketName = await this.getBucketForUser(userAddress, encryptionKey);
    const key = this.generateKey(options.dataType);
    const contentHash = this.computeHash(encryptedData);

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: encryptedData,
      ContentType: "application/octet-stream",
      Metadata: {
        ...options.metadata,
        contentHash,
        dataType: options.dataType,
        userAddress: userAddress.toLowerCase(),
        uploadedAt: Date.now().toString(),
      },
    });

    await this.client.send(command);

    const uri = `storj://${bucketName}/${key}`;

    return {
      uri,
      contentHash,
      size: encryptedData.length,
      uploadedAt: Date.now(),
      dataType: options.dataType,
    };
  }

  /**
   * Overwrite existing encrypted data at the same URI (in-place update)
   *
   * @param existingUri - Existing Storj URI to overwrite
   * @param encryptedData - New encrypted data to store
   * @param userAddress - User's wallet address (for validation)
   * @param encryptionKey - Wallet-derived encryption key (required for validation)
   * @param options - Upload options
   * @returns Updated storage reference with same URI
   */
  async overwriteEncryptedData(
    existingUri: string,
    encryptedData: Uint8Array,
    userAddress: string,
    encryptionKey: WalletEncryptionKey,
    options: UploadOptions,
  ): Promise<StorageReference> {
    // Parse the existing URI to get bucket and key
    const { bucket, key } = this.parseUri(existingUri);

    // Validate bucket access
    const expectedBucket = await this.getBucketForUser(
      userAddress,
      encryptionKey,
    );
    if (bucket !== expectedBucket) {
      throw new Error(
        `Bucket mismatch: expected ${expectedBucket}, got ${bucket}`,
      );
    }

    const contentHash = this.computeHash(encryptedData);

    // Overwrite the existing object at the same key
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key, // Use the SAME key from existing URI
      Body: encryptedData,
      ContentType: "application/octet-stream",
      Metadata: {
        ...options.metadata,
        contentHash,
        dataType: options.dataType,
        userAddress: userAddress.toLowerCase(),
        uploadedAt: Date.now().toString(),
        updated: "true", // Flag to indicate this was an update
      },
    });

    await this.client.send(command);

    // Return the SAME URI (no change)
    return {
      uri: existingUri,
      contentHash,
      size: encryptedData.length,
      uploadedAt: Date.now(),
      dataType: options.dataType,
    };
  }

  /**
   * Download encrypted data from Storj
   *
   * @param uri - Storj URI (storj://bucket/key)
   * @param userAddress - User's wallet address (for validation)
   * @param encryptionKey - Wallet-derived encryption key (required for validation)
   * @returns Downloaded data with content hash and metadata
   */
  async downloadEncryptedData(
    uri: string,
    userAddress?: string,
    encryptionKey?: WalletEncryptionKey,
  ): Promise<DownloadResult> {
    const { bucket, key } = this.parseUri(uri);

    // Validate bucket ownership if user address and encryption key provided
    if (userAddress && encryptionKey) {
      validateStorjUri(uri, userAddress, encryptionKey, this.bucketPrefix);
    }

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const response = await this.client.send(command);

    if (!response.Body) {
      throw new Error(`No data found at ${uri}`);
    }

    // Convert stream to Uint8Array
    const data = await this.streamToUint8Array(response.Body);
    const contentHash = this.computeHash(data);

    return {
      data,
      contentHash,
      metadata: response.Metadata || {},
    };
  }

  /**
   * Delete encrypted data from Storj (GDPR compliance)
   *
   * @param uri - Storj URI to delete
   * @param userAddress - User's wallet address (for validation)
   * @param encryptionKey - Wallet-derived encryption key (required for validation)
   */
  async deleteEncryptedData(
    uri: string,
    userAddress?: string,
    encryptionKey?: WalletEncryptionKey,
  ): Promise<void> {
    const { bucket, key } = this.parseUri(uri);

    // Validate bucket ownership if user address and encryption key provided
    if (userAddress && encryptionKey) {
      validateStorjUri(uri, userAddress, encryptionKey, this.bucketPrefix);
    }

    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    await this.client.send(command);
  }

  /**
   * List all data for a user
   *
   * @param userAddress - User's wallet address
   * @param encryptionKey - Wallet-derived encryption key (required for bucket name generation)
   * @param dataType - Optional filter by data type
   * @returns Array of storage references
   */
  async listUserData(
    userAddress: string,
    encryptionKey: WalletEncryptionKey,
    dataType?: string,
  ): Promise<StorageReference[]> {
    const bucketName = await this.getBucketForUser(userAddress, encryptionKey);
    const prefix = dataType ? `${dataType}/` : "";

    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
    });

    const response = await this.client.send(command);
    const references: StorageReference[] = [];

    if (response.Contents) {
      for (const obj of response.Contents) {
        if (obj.Key) {
          // Get metadata for each object
          const headCommand = new HeadObjectCommand({
            Bucket: bucketName,
            Key: obj.Key,
          });

          try {
            const headResponse = await this.client.send(headCommand);
            const md = headResponse.Metadata || {};
            // S3 metadata keys are normalized to lowercase by most SDKs/providers.
            // Support both legacy camelCase and normalized lowercase variants.
            const contentHash = md.contenthash || md.contentHash || "";
            const uploadedAtRaw = md.uploadedat || md.uploadedAt || "0";
            const dataTypeValue = md.datatype || md.dataType || "unknown";
            references.push({
              uri: `storj://${bucketName}/${obj.Key}`,
              contentHash,
              size: obj.Size || 0,
              uploadedAt: parseInt(uploadedAtRaw, 10),
              dataType: dataTypeValue,
              metadata: md,
            });
          } catch {
            // Skip objects we can't get metadata for
            continue;
          }
        }
      }
    }

    return references;
  }

  /**
   * List objects from a specific bucket by name (used for legacy migration / diagnostics).
   *
   * SECURITY NOTE:
   * - This does NOT validate bucket ownership.
   * - It must only be used in server routes that independently verify wallet ownership.
   */
  async listBucketByName(
    bucketName: string,
    dataType?: string,
  ): Promise<StorageReference[]> {
    const prefix = dataType ? `${dataType}/` : "";

    try {
      const command = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
      });

      const response = await this.client.send(command);
      const references: StorageReference[] = [];

      if (response.Contents) {
        for (const obj of response.Contents) {
          if (!obj.Key) continue;
          const headCommand = new HeadObjectCommand({
            Bucket: bucketName,
            Key: obj.Key,
          });
          try {
            const headResponse = await this.client.send(headCommand);
            const md = headResponse.Metadata || {};
            const contentHash = md.contenthash || md.contentHash || "";
            const uploadedAtRaw = md.uploadedat || md.uploadedAt || "0";
            const dataTypeValue = md.datatype || md.dataType || "unknown";
            references.push({
              uri: `storj://${bucketName}/${obj.Key}`,
              contentHash,
              size: obj.Size || 0,
              uploadedAt: parseInt(uploadedAtRaw, 10),
              dataType: dataTypeValue,
              metadata: md,
            });
          } catch {
            continue;
          }
        }
      }

      return references;
    } catch {
      // Missing bucket or access error -> treat as empty for legacy probing.
      return [];
    }
  }

  /**
   * Verify integrity of stored data
   *
   * @param uri - Storj URI
   * @param expectedHash - Expected content hash
   * @returns True if hash matches
   */
  async verifyIntegrity(uri: string, expectedHash: string): Promise<boolean> {
    const result = await this.downloadEncryptedData(uri);
    return result.contentHash === expectedHash;
  }

  /**
   * Check if data exists at URI
   *
   * @param uri - Storj URI
   * @returns True if exists
   */
  async exists(uri: string): Promise<boolean> {
    const { bucket, key } = this.parseUri(uri);

    try {
      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      await this.client.send(command);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parse Storj URI to extract bucket and key
   * Format: storj://bucket/path/to/file.enc
   */
  private parseUri(uri: string): { bucket: string; key: string } {
    const match = uri.match(/^storj:\/\/([^/]+)\/(.+)$/);
    if (!match) {
      throw new Error(`Invalid Storj URI: ${uri}`);
    }
    return {
      bucket: match[1],
      key: match[2],
    };
  }

  /**
   * Convert readable stream to Uint8Array
   */
  private async streamToUint8Array(
    stream: NodeJS.ReadableStream | ReadableStream | Blob,
  ): Promise<Uint8Array> {
    // Handle Blob (browser)
    if (stream instanceof Blob) {
      const arrayBuffer = await stream.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    }

    // Handle ReadableStream (fetch API)
    if ("getReader" in stream) {
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;

      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }

      return result;
    }

    // Handle Node.js ReadableStream
    const chunks: Buffer[] = [];

    for await (const chunk of stream as AsyncIterable<Buffer>) {
      chunks.push(Buffer.from(chunk));
    }

    return new Uint8Array(Buffer.concat(chunks));
  }
}

/**
 * Create a StorjClient instance from environment variables
 */
export function createStorjClient(): StorjClient {
  return new StorjClient();
}
