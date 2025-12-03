/**
 * StorjClient - S3-compatible client for Storj decentralized storage
 *
 * Handles encrypted health data uploads/downloads with integrity verification.
 * Uses AWS S3 SDK with Storj's S3-compatible gateway.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { createHash } from "crypto";

export interface StorjConfig {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  bucket: string;
  region?: string;
}

export interface StorageReference {
  uri: string;
  contentHash: string;
  size: number;
  uploadedAt: number;
  dataType: string;
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
 */
export class StorjClient {
  private client: S3Client;
  private bucket: string;

  constructor(config?: StorjConfig) {
    const resolvedConfig = config || this.getConfigFromEnv();

    this.client = new S3Client({
      endpoint: resolvedConfig.endpoint,
      region: resolvedConfig.region || "us-east-1",
      credentials: {
        accessKeyId: resolvedConfig.accessKeyId,
        secretAccessKey: resolvedConfig.secretAccessKey,
      },
      forcePathStyle: true, // Required for S3-compatible services
    });

    this.bucket = resolvedConfig.bucket;
  }

  /**
   * Get configuration from environment variables
   */
  private getConfigFromEnv(): StorjConfig {
    const accessKeyId = process.env.STORJ_ACCESS_KEY;
    const secretAccessKey = process.env.STORJ_SECRET_KEY;
    const endpoint =
      process.env.STORJ_ENDPOINT || "https://gateway.storjshare.io";
    const bucket = process.env.STORJ_BUCKET || "amach-health-encrypted";

    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        "Storj credentials not configured. Set STORJ_ACCESS_KEY and STORJ_SECRET_KEY environment variables.",
      );
    }

    return {
      accessKeyId,
      secretAccessKey,
      endpoint,
      bucket,
    };
  }

  /**
   * Generate a storage key for user data
   */
  private generateKey(
    userAddress: string,
    dataType: string,
    timestamp?: number,
  ): string {
    const ts = timestamp || Date.now();
    const normalizedAddress = userAddress.toLowerCase();
    return `${normalizedAddress}/${dataType}/${ts}.enc`;
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
   * @param userAddress - User's wallet address
   * @param encryptedData - Already encrypted data (Uint8Array)
   * @param options - Upload options including dataType and metadata
   * @returns Storage reference with URI and content hash
   */
  async uploadEncryptedData(
    userAddress: string,
    encryptedData: Uint8Array,
    options: UploadOptions,
  ): Promise<StorageReference> {
    const key = this.generateKey(userAddress, options.dataType);
    const contentHash = this.computeHash(encryptedData);

    const command = new PutObjectCommand({
      Bucket: this.bucket,
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

    const uri = `storj://${this.bucket}/${key}`;

    return {
      uri,
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
   * @returns Downloaded data with content hash and metadata
   */
  async downloadEncryptedData(uri: string): Promise<DownloadResult> {
    const key = this.parseUri(uri);

    const command = new GetObjectCommand({
      Bucket: this.bucket,
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
   */
  async deleteEncryptedData(uri: string): Promise<void> {
    const key = this.parseUri(uri);

    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.client.send(command);
  }

  /**
   * List all data for a user
   *
   * @param userAddress - User's wallet address
   * @param dataType - Optional filter by data type
   * @returns Array of storage references
   */
  async listUserData(
    userAddress: string,
    dataType?: string,
  ): Promise<StorageReference[]> {
    const prefix = dataType
      ? `${userAddress.toLowerCase()}/${dataType}/`
      : `${userAddress.toLowerCase()}/`;

    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix,
    });

    const response = await this.client.send(command);
    const references: StorageReference[] = [];

    if (response.Contents) {
      for (const obj of response.Contents) {
        if (obj.Key) {
          // Get metadata for each object
          const headCommand = new HeadObjectCommand({
            Bucket: this.bucket,
            Key: obj.Key,
          });

          try {
            const headResponse = await this.client.send(headCommand);
            references.push({
              uri: `storj://${this.bucket}/${obj.Key}`,
              contentHash: headResponse.Metadata?.contentHash || "",
              size: obj.Size || 0,
              uploadedAt: parseInt(
                headResponse.Metadata?.uploadedAt || "0",
                10,
              ),
              dataType: headResponse.Metadata?.dataType || "unknown",
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
    const key = this.parseUri(uri);

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client.send(command);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parse Storj URI to extract key
   */
  private parseUri(uri: string): string {
    // Format: storj://bucket/path/to/file.enc
    const match = uri.match(/^storj:\/\/[^/]+\/(.+)$/);
    if (!match) {
      throw new Error(`Invalid Storj URI: ${uri}`);
    }
    return match[1];
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
