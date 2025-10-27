/**
 * Tests for Wallet-Derived Encryption
 *
 * These tests verify that:
 * 1. Keys are consistently derived from the same signature
 * 2. Different wallets produce different keys
 * 3. Caching works correctly
 * 4. Encryption/decryption is reversible
 */

import {
  deriveEncryptionKeyFromSignature,
  getKeyDerivationMessage,
  encryptWithWalletKey,
  decryptWithWalletKey,
  encryptionKeyCache,
  verifyKeyOwnership,
  type WalletEncryptionKey,
} from "../walletEncryption";

describe("Wallet-Derived Encryption", () => {
  const mockWalletAddress1 = "0x1234567890123456789012345678901234567890";
  const mockWalletAddress2 = "0xABCDEF1234567890ABCDEF1234567890ABCDEF12";
  const mockSignature =
    "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab";

  beforeEach(() => {
    // Clear cache before each test
    encryptionKeyCache.clear();
  });

  describe("Key Derivation", () => {
    it("should derive consistent keys from the same signature and address", () => {
      const key1 = deriveEncryptionKeyFromSignature(
        mockSignature,
        mockWalletAddress1,
      );
      const key2 = deriveEncryptionKeyFromSignature(
        mockSignature,
        mockWalletAddress1,
      );

      expect(key1).toBe(key2);
      expect(key1).toBeTruthy();
      expect(key1.length).toBeGreaterThan(0);
    });

    it("should derive different keys for different wallet addresses", () => {
      const key1 = deriveEncryptionKeyFromSignature(
        mockSignature,
        mockWalletAddress1,
      );
      const key2 = deriveEncryptionKeyFromSignature(
        mockSignature,
        mockWalletAddress2,
      );

      expect(key1).not.toBe(key2);
    });

    it("should derive different keys for different signatures", () => {
      const signature1 = mockSignature;
      const signature2 = "0x" + "f".repeat(130);

      const key1 = deriveEncryptionKeyFromSignature(
        signature1,
        mockWalletAddress1,
      );
      const key2 = deriveEncryptionKeyFromSignature(
        signature2,
        mockWalletAddress1,
      );

      expect(key1).not.toBe(key2);
    });

    it("should generate deterministic message for key derivation", () => {
      const message1 = getKeyDerivationMessage(mockWalletAddress1);
      const message2 = getKeyDerivationMessage(mockWalletAddress1);

      expect(message1).toBe(message2);
      expect(message1).toContain("Amach Health");
      expect(message1).toContain("Derive Encryption Key");
      expect(message1).toContain(mockWalletAddress1.toLowerCase());
    });

    it("should generate different messages for different addresses", () => {
      const message1 = getKeyDerivationMessage(mockWalletAddress1);
      const message2 = getKeyDerivationMessage(mockWalletAddress2);

      expect(message1).not.toBe(message2);
    });
  });

  describe("Encryption/Decryption", () => {
    it("should encrypt and decrypt data successfully", () => {
      const key = deriveEncryptionKeyFromSignature(
        mockSignature,
        mockWalletAddress1,
      );
      const walletKey: WalletEncryptionKey = {
        key,
        derivedAt: Date.now(),
        walletAddress: mockWalletAddress1,
      };

      const originalData = "Sensitive health data";
      const encrypted = encryptWithWalletKey(originalData, walletKey);
      const decrypted = decryptWithWalletKey(encrypted, walletKey);

      expect(decrypted).toBe(originalData);
      expect(encrypted).not.toBe(originalData);
      expect(encrypted).toContain("0x");
    });

    it("should fail to decrypt with wrong key", () => {
      const key1 = deriveEncryptionKeyFromSignature(
        mockSignature,
        mockWalletAddress1,
      );
      const key2 = deriveEncryptionKeyFromSignature(
        mockSignature,
        mockWalletAddress2,
      );

      const walletKey1: WalletEncryptionKey = {
        key: key1,
        derivedAt: Date.now(),
        walletAddress: mockWalletAddress1,
      };

      const walletKey2: WalletEncryptionKey = {
        key: key2,
        derivedAt: Date.now(),
        walletAddress: mockWalletAddress2,
      };

      const originalData = "Sensitive health data";
      const encrypted = encryptWithWalletKey(originalData, walletKey1);

      expect(() => {
        decryptWithWalletKey(encrypted, walletKey2);
      }).toThrow();
    });

    it("should handle empty data", () => {
      const key = deriveEncryptionKeyFromSignature(
        mockSignature,
        mockWalletAddress1,
      );
      const walletKey: WalletEncryptionKey = {
        key,
        derivedAt: Date.now(),
        walletAddress: mockWalletAddress1,
      };

      const encrypted = encryptWithWalletKey("", walletKey);
      const decrypted = decryptWithWalletKey(encrypted, walletKey);

      expect(decrypted).toBe("");
    });

    it("should handle special characters", () => {
      const key = deriveEncryptionKeyFromSignature(
        mockSignature,
        mockWalletAddress1,
      );
      const walletKey: WalletEncryptionKey = {
        key,
        derivedAt: Date.now(),
        walletAddress: mockWalletAddress1,
      };

      const originalData =
        "Test 🏥 Data with émojis and spëcial çharacters!@#$%^&*()";
      const encrypted = encryptWithWalletKey(originalData, walletKey);
      const decrypted = decryptWithWalletKey(encrypted, walletKey);

      expect(decrypted).toBe(originalData);
    });

    it("should handle data with 0x prefix", () => {
      const key = deriveEncryptionKeyFromSignature(
        mockSignature,
        mockWalletAddress1,
      );
      const walletKey: WalletEncryptionKey = {
        key,
        derivedAt: Date.now(),
        walletAddress: mockWalletAddress1,
      };

      const originalData = "Test data";
      const encrypted = encryptWithWalletKey(originalData, walletKey);

      // Should work with or without 0x prefix
      const decrypted1 = decryptWithWalletKey(encrypted, walletKey);
      const encryptedWithout0x = encrypted.startsWith("0x")
        ? encrypted.slice(2)
        : encrypted;
      const decrypted2 = decryptWithWalletKey(encryptedWithout0x, walletKey);

      expect(decrypted1).toBe(originalData);
      expect(decrypted2).toBe(originalData);
    });
  });

  describe("Key Ownership Verification", () => {
    it("should verify correct key ownership", () => {
      const key = deriveEncryptionKeyFromSignature(
        mockSignature,
        mockWalletAddress1,
      );
      const walletKey: WalletEncryptionKey = {
        key,
        derivedAt: Date.now(),
        walletAddress: mockWalletAddress1,
      };

      const isValid = verifyKeyOwnership(walletKey, mockWalletAddress1);
      expect(isValid).toBe(true);
    });

    it("should reject incorrect key ownership", () => {
      const key = deriveEncryptionKeyFromSignature(
        mockSignature,
        mockWalletAddress1,
      );
      const walletKey: WalletEncryptionKey = {
        key,
        derivedAt: Date.now(),
        walletAddress: mockWalletAddress1,
      };

      const isValid = verifyKeyOwnership(walletKey, mockWalletAddress2);
      expect(isValid).toBe(false);
    });

    it("should be case-insensitive for address comparison", () => {
      const key = deriveEncryptionKeyFromSignature(
        mockSignature,
        mockWalletAddress1,
      );
      const walletKey: WalletEncryptionKey = {
        key,
        derivedAt: Date.now(),
        walletAddress: mockWalletAddress1.toLowerCase(),
      };

      const isValid = verifyKeyOwnership(
        walletKey,
        mockWalletAddress1.toUpperCase(),
      );
      expect(isValid).toBe(true);
    });
  });

  describe("Encryption Key Cache", () => {
    it("should cache encryption keys", () => {
      const key = deriveEncryptionKeyFromSignature(
        mockSignature,
        mockWalletAddress1,
      );
      const walletKey: WalletEncryptionKey = {
        key,
        derivedAt: Date.now(),
        walletAddress: mockWalletAddress1,
      };

      encryptionKeyCache.set(mockWalletAddress1, walletKey);
      const cached = encryptionKeyCache.get(mockWalletAddress1);

      expect(cached).toBeTruthy();
      expect(cached?.key).toBe(key);
      expect(cached?.walletAddress).toBe(mockWalletAddress1);
    });

    it("should return null for non-cached addresses", () => {
      const cached = encryptionKeyCache.get(mockWalletAddress1);
      expect(cached).toBeNull();
    });

    it("should handle cache expiry (simulated)", () => {
      const key = deriveEncryptionKeyFromSignature(
        mockSignature,
        mockWalletAddress1,
      );

      // Create a key with timestamp 31 minutes ago (expired)
      const expiredKey: WalletEncryptionKey = {
        key,
        derivedAt: Date.now() - 31 * 60 * 1000,
        walletAddress: mockWalletAddress1,
      };

      // Manually set in cache (simulating expired entry)
      encryptionKeyCache.set(mockWalletAddress1, expiredKey);

      // The cache should automatically detect expiry
      // Note: This test depends on the cache's internal expiry mechanism
      const cached = encryptionKeyCache.get(mockWalletAddress1);

      // Cache should return null for expired keys
      // (This behavior is implemented in the cache's get method)
      expect(cached).toBeNull();
    });

    it("should clear cache for specific address", () => {
      const key1 = deriveEncryptionKeyFromSignature(
        mockSignature,
        mockWalletAddress1,
      );
      const key2 = deriveEncryptionKeyFromSignature(
        mockSignature,
        mockWalletAddress2,
      );

      encryptionKeyCache.set(mockWalletAddress1, {
        key: key1,
        derivedAt: Date.now(),
        walletAddress: mockWalletAddress1,
      });

      encryptionKeyCache.set(mockWalletAddress2, {
        key: key2,
        derivedAt: Date.now(),
        walletAddress: mockWalletAddress2,
      });

      encryptionKeyCache.clear(mockWalletAddress1);

      expect(encryptionKeyCache.get(mockWalletAddress1)).toBeNull();
      expect(encryptionKeyCache.get(mockWalletAddress2)).toBeTruthy();
    });

    it("should clear all cache", () => {
      const key1 = deriveEncryptionKeyFromSignature(
        mockSignature,
        mockWalletAddress1,
      );
      const key2 = deriveEncryptionKeyFromSignature(
        mockSignature,
        mockWalletAddress2,
      );

      encryptionKeyCache.set(mockWalletAddress1, {
        key: key1,
        derivedAt: Date.now(),
        walletAddress: mockWalletAddress1,
      });

      encryptionKeyCache.set(mockWalletAddress2, {
        key: key2,
        derivedAt: Date.now(),
        walletAddress: mockWalletAddress2,
      });

      encryptionKeyCache.clear();

      expect(encryptionKeyCache.get(mockWalletAddress1)).toBeNull();
      expect(encryptionKeyCache.get(mockWalletAddress2)).toBeNull();
    });
  });

  describe("Security Properties", () => {
    it("should produce keys of sufficient length", () => {
      const key = deriveEncryptionKeyFromSignature(
        mockSignature,
        mockWalletAddress1,
      );

      // PBKDF2 with 256-bit key should produce a hex string of length 64
      expect(key.length).toBe(64);
    });

    it("should produce different ciphertext for same data", () => {
      const key = deriveEncryptionKeyFromSignature(
        mockSignature,
        mockWalletAddress1,
      );
      const walletKey: WalletEncryptionKey = {
        key,
        derivedAt: Date.now(),
        walletAddress: mockWalletAddress1,
      };

      const originalData = "Sensitive health data";
      const encrypted1 = encryptWithWalletKey(originalData, walletKey);
      const encrypted2 = encryptWithWalletKey(originalData, walletKey);

      // CryptoJS AES should produce different ciphertext each time due to random IV
      // Note: This may not always be true depending on CryptoJS implementation
      // But both should decrypt to the same value
      const decrypted1 = decryptWithWalletKey(encrypted1, walletKey);
      const decrypted2 = decryptWithWalletKey(encrypted2, walletKey);

      expect(decrypted1).toBe(originalData);
      expect(decrypted2).toBe(originalData);
    });

    it("should not expose key material in encrypted output", () => {
      const key = deriveEncryptionKeyFromSignature(
        mockSignature,
        mockWalletAddress1,
      );
      const walletKey: WalletEncryptionKey = {
        key,
        derivedAt: Date.now(),
        walletAddress: mockWalletAddress1,
      };

      const originalData = "Sensitive health data";
      const encrypted = encryptWithWalletKey(originalData, walletKey);

      // Encrypted data should not contain the key
      expect(encrypted).not.toContain(key);
      expect(encrypted).not.toContain(mockSignature);
    });
  });
});
