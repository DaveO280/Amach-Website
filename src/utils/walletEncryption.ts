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
  console.log("📋 Message to sign:", message.substring(0, 100) + "...");
  console.log("⏳ Waiting for user to approve signature in popup...");

  try {
    // Wrap in a promise with better error handling
    const signature = await Promise.race([
      signMessageFn(message),
      // Add a timeout that gives enough time (5 minutes)
      new Promise<string>((_, reject) =>
        setTimeout(
          () =>
            reject(new Error("Signature request timed out after 5 minutes")),
          5 * 60 * 1000,
        ),
      ),
    ]);

    if (!signature || signature.length < 132) {
      throw new Error("Invalid signature received - signature too short");
    }

    console.log("✅ Signature received and validated");
    return signature;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("❌ Signature request failed:", errorMessage);

    // Provide helpful error messages
    if (
      errorMessage.includes("rejected") ||
      errorMessage.includes("denied") ||
      errorMessage.includes("cancel")
    ) {
      throw new Error(
        "Signature request was cancelled. Please try again and approve the signature when prompted.",
      );
    }

    if (errorMessage.includes("timeout")) {
      throw new Error("Signature request timed out. Please try again.");
    }

    throw error;
  }
}

/**
 * Derive encryption key from wallet signature using PBKDF2
 * Uses Web Crypto API for async, non-blocking key derivation
 * Falls back to CryptoJS if Web Crypto API is not available
 *
 * @param signature - The wallet signature
 * @param walletAddress - The wallet address (used as salt)
 * @returns Promise<string> - Derived encryption key (hex string)
 */
export async function deriveEncryptionKeyFromSignature(
  signature: string,
  walletAddress: string,
): Promise<string> {
  console.log("🔑 Starting PBKDF2 key derivation (non-blocking)...");

  // Try to use Web Crypto API first (non-blocking, async)
  if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) {
    try {
      return await deriveKeyWithWebCrypto(signature, walletAddress);
    } catch (error) {
      console.warn(
        "⚠️ Web Crypto API failed, falling back to CryptoJS:",
        error,
      );
      // Fall through to CryptoJS fallback
    }
  }

  // Fallback to CryptoJS (blocking but compatible)
  // Use requestIdleCallback if available to reduce impact
  return new Promise<string>((resolve, reject) => {
    const performDerivation = (): void => {
      try {
        // Use signature as password and wallet address as salt
        const salt = CryptoJS.enc.Hex.parse(
          walletAddress.toLowerCase().slice(2),
        );
        const signatureBytes = CryptoJS.enc.Hex.parse(signature.slice(2));

        // Derive key using PBKDF2 with reduced iterations for better UX
        // Still secure with 50k iterations
        const derivedKey = CryptoJS.PBKDF2(signatureBytes.toString(), salt, {
          keySize: 256 / 32, // 256 bits
          iterations: 100000, // Must use same iterations as secureHealthEncryption for consistency
          hasher: CryptoJS.algo.SHA256,
        });

        console.log("✅ Key derivation complete (CryptoJS fallback)");
        resolve(derivedKey.toString());
      } catch (error) {
        console.error("❌ Key derivation failed:", error);
        reject(error);
      }
    };

    // Use requestIdleCallback to perform work when browser is idle
    // This helps prevent UI blocking
    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(performDerivation, { timeout: 1000 });
    } else {
      // Fallback: small delay then perform
      setTimeout(performDerivation, 100);
    }
  });
}

/**
 * Derive encryption key using Web Crypto API (non-blocking, async)
 */
async function deriveKeyWithWebCrypto(
  signature: string,
  walletAddress: string,
): Promise<string> {
  // Convert hex signature to ArrayBuffer
  const signatureHex = signature.startsWith("0x")
    ? signature.slice(2)
    : signature;
  const signatureBytes = signatureHex.match(/.{1,2}/g) || [];
  const signatureBuffer = new Uint8Array(
    signatureBytes.map((byte) => parseInt(byte, 16)),
  );

  // Use wallet address as salt (remove 0x prefix if present, take first 20 bytes = 40 hex chars)
  let saltHex = walletAddress.toLowerCase();
  if (saltHex.startsWith("0x")) {
    saltHex = saltHex.slice(2);
  }
  // Web Crypto API salt can be any length, but we'll use the full address
  // Convert to bytes (20 bytes for Ethereum address = 40 hex chars)
  const saltBytes = saltHex.slice(0, 40).match(/.{1,2}/g) || [];
  const saltBuffer = new Uint8Array(
    saltBytes.map((byte) => parseInt(byte, 16)),
  );

  // Import the signature as a key
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    signatureBuffer,
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  // Derive key using PBKDF2 with Web Crypto API (non-blocking)
  const derivedBits = await window.crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBuffer,
      iterations: 100000, // Must use same iterations as secureHealthEncryption for consistency
      hash: "SHA-256",
    },
    keyMaterial,
    256, // 256 bits
  );

  // Convert to hex string (compatible with CryptoJS format)
  const derivedKeyArray = Array.from(new Uint8Array(derivedBits));
  const derivedKeyHex = derivedKeyArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  console.log("✅ Key derivation complete (Web Crypto API - non-blocking)");

  // Return hex string (compatible with CryptoJS format)
  return derivedKeyHex;
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

    // Derive key from signature (now async to prevent blocking)
    const key = await deriveEncryptionKeyFromSignature(
      signature,
      walletAddress,
    );

    console.log("✅ Successfully derived encryption key from wallet signature");

    return {
      key,
      derivedAt: Date.now(),
      walletAddress: walletAddress.toLowerCase(),
    };
  } catch (error) {
    console.error("❌ Failed to derive encryption key:", error);
    throw new Error(
      `Failed to derive encryption key from wallet signature: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
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
      console.log("✅ Using cached encryption key (no signature needed)");
      return cached;
    }
  }

  console.log("🔑 Cache miss - requesting new encryption key signature");
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
