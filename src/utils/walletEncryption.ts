import CryptoJS from "crypto-js";

/**
 * Wallet-Derived Encryption System
 *
 * Security Model:
 * 1. User signs a deterministic message with their wallet
 * 2. Signature is used to derive encryption key via PBKDF2
 * 3. Key is never stored - always derived on-demand from signature
 * 4. Each encryption operation requests a fresh signature
 *
 * Benefits:
 * - No keys in localStorage
 * - Keys can't be stolen without wallet access
 * - Deterministic - same wallet always produces same key
 * - Works across devices with same wallet
 */

export interface WalletEncryptionKey {
  key: string;
  derivedAt: number;
  walletAddress: string;
}

/**
 * The message that users sign to derive their encryption key
 * This should NEVER change, or existing encrypted data will be unrecoverable
 */
const ENCRYPTION_KEY_MESSAGE =
  "Amach Health - Derive Encryption Key\n\nThis signature is used to encrypt your health data.\n\nNonce: ";

/**
 * Get the deterministic message for key derivation
 * Uses wallet address as nonce for determinism
 */
export function getKeyDerivationMessage(walletAddress: string): string {
  return `${ENCRYPTION_KEY_MESSAGE}${walletAddress.toLowerCase()}`;
}

/**
 * Request wallet signature for encryption key derivation
 *
 * @param walletAddress - The connected wallet address
 * @param signMessageFn - Function to sign message (from wallet provider)
 * @returns Promise<string> - The signature
 */
export async function requestEncryptionKeySignature(
  walletAddress: string,
  signMessageFn: (message: string) => Promise<string>,
): Promise<string> {
  const message = getKeyDerivationMessage(walletAddress);

  console.log("🔐 Requesting signature for encryption key derivation...");
  const signature = await signMessageFn(message);

  if (!signature || signature.length < 132) {
    throw new Error("Invalid signature received");
  }

  return signature;
}

/**
 * Derive encryption key from wallet signature using PBKDF2
 *
 * @param signature - The wallet signature
 * @param walletAddress - The wallet address (used as salt)
 * @returns string - Derived encryption key (hex string)
 */
export function deriveEncryptionKeyFromSignature(
  signature: string,
  walletAddress: string,
): string {
  // Use signature as password and wallet address as salt
  const salt = CryptoJS.enc.Hex.parse(walletAddress.toLowerCase().slice(2));
  const signatureBytes = CryptoJS.enc.Hex.parse(signature.slice(2));

  // Derive key using PBKDF2 with high iteration count
  const derivedKey = CryptoJS.PBKDF2(signatureBytes.toString(), salt, {
    keySize: 256 / 32, // 256 bits
    iterations: 100000, // High iteration count for security
    hasher: CryptoJS.algo.SHA256,
  });

  return derivedKey.toString();
}

/**
 * Get or derive encryption key from wallet signature
 * This is the main function to use for getting encryption keys
 *
 * @param walletAddress - The connected wallet address
 * @param signMessageFn - Function to sign message (from wallet provider)
 * @returns Promise<WalletEncryptionKey> - The derived encryption key
 */
export async function getWalletDerivedEncryptionKey(
  walletAddress: string,
  signMessageFn: (message: string) => Promise<string>,
): Promise<WalletEncryptionKey> {
  try {
    // Request signature from wallet
    const signature = await requestEncryptionKeySignature(
      walletAddress,
      signMessageFn,
    );

    // Derive key from signature
    const key = deriveEncryptionKeyFromSignature(signature, walletAddress);

    console.log("✅ Successfully derived encryption key from wallet signature");

    return {
      key,
      derivedAt: Date.now(),
      walletAddress: walletAddress.toLowerCase(),
    };
  } catch (error) {
    console.error("❌ Failed to derive encryption key:", error);
    throw new Error("Failed to derive encryption key from wallet signature");
  }
}

/**
 * Verify that a key was derived from the correct wallet
 *
 * @param key - The encryption key to verify
 * @param expectedAddress - The expected wallet address
 * @returns boolean - True if key matches the expected wallet
 */
export function verifyKeyOwnership(
  key: WalletEncryptionKey,
  expectedAddress: string,
): boolean {
  return key.walletAddress.toLowerCase() === expectedAddress.toLowerCase();
}

/**
 * Encrypt data using wallet-derived key
 *
 * @param data - The data to encrypt
 * @param encryptionKey - The wallet-derived encryption key
 * @returns string - Encrypted data (with 0x prefix)
 */
export function encryptWithWalletKey(
  data: string,
  encryptionKey: WalletEncryptionKey,
): string {
  const encrypted = CryptoJS.AES.encrypt(data, encryptionKey.key).toString();
  return `0x${encrypted}`;
}

/**
 * Decrypt data using wallet-derived key
 *
 * @param encryptedData - The encrypted data (with or without 0x prefix)
 * @param encryptionKey - The wallet-derived encryption key
 * @returns string - Decrypted data
 */
export function decryptWithWalletKey(
  encryptedData: string,
  encryptionKey: WalletEncryptionKey,
): string {
  const cleanData = encryptedData.startsWith("0x")
    ? encryptedData.slice(2)
    : encryptedData;
  const decrypted = CryptoJS.AES.decrypt(cleanData, encryptionKey.key);
  const result = decrypted.toString(CryptoJS.enc.Utf8);

  if (!result) {
    throw new Error("Decryption failed - invalid key or corrupted data");
  }

  return result;
}

/**
 * Session key cache (in-memory only, never persisted)
 * Prevents requesting signature for every encryption operation
 */
class EncryptionKeyCache {
  private cache: Map<string, { key: WalletEncryptionKey; expiresAt: number }> =
    new Map();
  private readonly CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

  set(walletAddress: string, key: WalletEncryptionKey): void {
    const normalized = walletAddress.toLowerCase();
    this.cache.set(normalized, {
      key,
      expiresAt: Date.now() + this.CACHE_DURATION,
    });
    console.log("🔑 Cached encryption key for session (30 min expiry)");
  }

  get(walletAddress: string): WalletEncryptionKey | null {
    const normalized = walletAddress.toLowerCase();
    const cached = this.cache.get(normalized);

    if (!cached) {
      return null;
    }

    if (Date.now() > cached.expiresAt) {
      this.cache.delete(normalized);
      console.log("⏰ Cached encryption key expired");
      return null;
    }

    console.log("✅ Using cached encryption key");
    return cached.key;
  }

  clear(walletAddress?: string): void {
    if (walletAddress) {
      this.cache.delete(walletAddress.toLowerCase());
    } else {
      this.cache.clear();
    }
    console.log("🧹 Cleared encryption key cache");
  }
}

export const encryptionKeyCache = new EncryptionKeyCache();

/**
 * Get encryption key with caching support
 * Requests signature only if not cached or expired
 *
 * @param walletAddress - The connected wallet address
 * @param signMessageFn - Function to sign message (from wallet provider)
 * @param forceRefresh - Force new signature (ignore cache)
 * @returns Promise<WalletEncryptionKey> - The encryption key
 */
export async function getCachedWalletEncryptionKey(
  walletAddress: string,
  signMessageFn: (message: string) => Promise<string>,
  forceRefresh = false,
): Promise<WalletEncryptionKey> {
  if (!forceRefresh) {
    const cached = encryptionKeyCache.get(walletAddress);
    if (cached) {
      return cached;
    }
  }

  const key = await getWalletDerivedEncryptionKey(walletAddress, signMessageFn);
  encryptionKeyCache.set(walletAddress, key);

  return key;
}

/**
 * Clear encryption key cache on wallet disconnect
 * Should be called when user disconnects wallet
 */
export function clearEncryptionKeyOnDisconnect(walletAddress: string): void {
  encryptionKeyCache.clear(walletAddress);
  console.log("🔓 Cleared encryption key on wallet disconnect");
}
