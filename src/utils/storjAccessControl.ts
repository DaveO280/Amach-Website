/**
 * Storj Access Control - Bucket Ownership Validation
 *
 * Security Model:
 * 1. Server credentials (STORJ_ACCESS_KEY/SECRET_KEY) - Used for all S3 operations
 * 2. Bucket name validation - Ensures users can only access their own bucket
 * 3. Wallet-signature-derived bucket names - Requires wallet connection to generate
 *
 * CRITICAL SECURITY FIX:
 * - Bucket names are now derived from wallet address + encryption key
 * - Encryption key requires wallet signature (connection)
 * - This prevents: server credentials + public wallet address = bucket access
 * - Now requires: server credentials + wallet address + wallet connection = bucket access
 *
 * Note: Storj S3-compatible API requires real credentials. We use server credentials
 * with strict bucket validation. Users can only access buckets they can generate
 * names for (requires wallet address + wallet signature).
 */

import { createHash } from "crypto";
import type { WalletEncryptionKey } from "./walletEncryption";

/**
 * Generate bucket name from wallet address + encryption key
 *
 * SECURITY: Requires wallet connection because encryption key is derived from signature.
 * This prevents the attack: server credentials + public wallet address = bucket access.
 *
 * Now requires: server credentials + wallet address + wallet connection (signature).
 *
 * @param walletAddress - User's wallet address
 * @param encryptionKey - Wallet-derived encryption key (requires wallet signature)
 * @param bucketPrefix - Bucket name prefix (default: "amach-health")
 * @returns Bucket name (deterministic: same wallet + same signature = same bucket)
 */
export function generateBucketName(
  walletAddress: string,
  encryptionKey: WalletEncryptionKey,
  bucketPrefix: string = "amach-health",
): string {
  const normalizedAddress = walletAddress.toLowerCase();

  // Use encryption key (derived from wallet signature) as salt
  // This ensures bucket name requires wallet connection to generate
  const bucketMaterial = `${normalizedAddress}-${encryptionKey.key.substring(0, 32)}`;
  const bucketHash = createHash("sha256")
    .update(bucketMaterial)
    .digest("hex")
    .substring(0, 16);
  const bucketName = `${bucketPrefix}-${bucketHash}`;

  return bucketName;
}

/**
 * Legacy bucket name (v0) derived from wallet address only.
 * Used for recovery/migration of older test data.
 *
 * SECURITY: Only use in server routes that verify wallet ownership (signature).
 */
export function generateLegacyAddressBucketName(
  walletAddress: string,
  bucketPrefix: string = "amach-health",
): string {
  const normalizedAddress = walletAddress.toLowerCase();
  const bucketHash = createHash("sha256")
    .update(normalizedAddress)
    .digest("hex")
    .substring(0, 16);
  return `${bucketPrefix}-${bucketHash}`;
}

/**
 * Some legacy environments hashed the address *without* the 0x prefix.
 * We probe both variants during legacy recovery.
 */
export function generateLegacyAddressBucketNameNo0x(
  walletAddress: string,
  bucketPrefix: string = "amach-health",
): string {
  const normalized = walletAddress.toLowerCase().replace(/^0x/, "");
  const bucketHash = createHash("sha256")
    .update(normalized)
    .digest("hex")
    .substring(0, 16);
  return `${bucketPrefix}-${bucketHash}`;
}

/**
 * Legacy bucket variants that used wallet address + a key fragment, but not necessarily
 * the same fragment length as the current implementation.
 *
 * SECURITY: Only use in server routes that verify wallet ownership (signature).
 */
export function generateLegacyKeyedBucketName(
  walletAddress: string,
  keyMaterial: string,
  bucketPrefix: string = "amach-health",
): string {
  const normalizedAddress = walletAddress.toLowerCase();
  const bucketMaterial = `${normalizedAddress}-${keyMaterial}`;
  const bucketHash = createHash("sha256")
    .update(bucketMaterial)
    .digest("hex")
    .substring(0, 16);
  return `${bucketPrefix}-${bucketHash}`;
}

/**
 * Generate bucket name and validation info from wallet address + encryption key
 *
 * @param walletAddress - User's wallet address
 * @param encryptionKey - Wallet-derived encryption key (requires wallet signature)
 * @param bucketPrefix - Bucket name prefix (default: "amach-health")
 * @returns Bucket name and validation info
 */
export function getStorjBucketInfo(
  walletAddress: string,
  encryptionKey: WalletEncryptionKey,
  bucketPrefix: string = "amach-health",
): { bucketName: string } {
  const bucketName = generateBucketName(
    walletAddress,
    encryptionKey,
    bucketPrefix,
  );
  return { bucketName };
}

/**
 * Validate that a bucket name belongs to a specific wallet address + encryption key
 * This prevents users from accessing other users' buckets
 *
 * @param bucketName - Bucket name to validate
 * @param walletAddress - Expected wallet address
 * @param encryptionKey - Wallet-derived encryption key (requires wallet signature)
 * @param bucketPrefix - Bucket name prefix (default: "amach-health")
 * @returns True if bucket name matches wallet address + encryption key
 */
export function validateBucketOwnership(
  bucketName: string,
  walletAddress: string,
  encryptionKey: WalletEncryptionKey,
  bucketPrefix: string = "amach-health",
): boolean {
  const expectedBucketName = generateBucketName(
    walletAddress,
    encryptionKey,
    bucketPrefix,
  );
  return bucketName === expectedBucketName;
}

/**
 * Extract bucket name from Storj URI and validate ownership
 *
 * @param uri - Storj URI (storj://bucket/key)
 * @param walletAddress - Expected wallet address
 * @param encryptionKey - Wallet-derived encryption key (requires wallet signature)
 * @param bucketPrefix - Bucket name prefix (default: "amach-health")
 * @returns Bucket name if valid, throws error if invalid
 */
export function validateStorjUri(
  uri: string,
  walletAddress: string,
  encryptionKey: WalletEncryptionKey,
  bucketPrefix: string = "amach-health",
): string {
  const match = uri.match(/^storj:\/\/([^/]+)\//);
  if (!match) {
    throw new Error(`Invalid Storj URI format: ${uri}`);
  }

  const bucketName = match[1];
  if (
    !validateBucketOwnership(
      bucketName,
      walletAddress,
      encryptionKey,
      bucketPrefix,
    )
  ) {
    throw new Error(
      `Security violation: Bucket ${bucketName} does not belong to wallet ${walletAddress}`,
    );
  }

  return bucketName;
}
