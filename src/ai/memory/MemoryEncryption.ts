/**
 * Memory Encryption Service
 * Wallet-derived key encryption for sensitive health data
 */

import {
  EncryptedData,
  EncryptionConfig,
  DEFAULT_ENCRYPTION_CONFIG,
} from './types';

export interface KeyDerivationInput {
  walletSignature: string;
  salt: Uint8Array;
}

export class MemoryEncryption {
  private config: EncryptionConfig;
  private derivedKey: CryptoKey | null = null;
  private keyCache: Map<string, CryptoKey> = new Map();

  constructor(config: Partial<EncryptionConfig> = {}) {
    this.config = { ...DEFAULT_ENCRYPTION_CONFIG, ...config };
  }

  /**
   * Initialize with wallet-derived key
   * Uses the first 32 bytes of a wallet signature as the key material
   */
  async initialize(walletSignature: string): Promise<void> {
    const encoder = new TextEncoder();
    const signatureData = encoder.encode(walletSignature);
    
    // Use first 32 bytes of signature for key material
    const keyMaterial = signatureData.slice(0, 32);
    
    // Derive a proper encryption key
    this.derivedKey = await this.deriveKey(keyMaterial);
  }

  /**
   * Derive encryption key from wallet signature material
   */
  private async deriveKey(keyMaterial: Uint8Array): Promise<CryptoKey> {
    const baseKey = await crypto.subtle.importKey(
      'raw',
      keyMaterial,
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    // Generate a consistent salt for this key derivation
    const salt = await crypto.subtle.digest('SHA-256', keyMaterial);

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: new Uint8Array(salt),
        iterations: this.config.iterations,
        hash: 'SHA-256',
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Generate random IV for encryption
   */
  private generateIV(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM
  }

  /**
   * Generate random salt
   */
  private generateSalt(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(16));
  }

  /**
   * Encrypt data
   */
  async encrypt<T>(data: T): Promise<EncryptedData> {
    if (!this.derivedKey) {
      throw new Error('MemoryEncryption not initialized. Call initialize() first.');
    }

    const iv = this.generateIV();
    const salt = this.generateSalt();
    
    const encoder = new TextEncoder();
    const plaintext = encoder.encode(JSON.stringify(data));

    const ciphertext = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      this.derivedKey,
      plaintext
    );

    return {
      ciphertext: this.arrayBufferToBase64(ciphertext),
      iv: this.arrayBufferToBase64(iv),
      salt: this.arrayBufferToBase64(salt),
      authTag: undefined, // GCM includes auth tag in ciphertext
      algorithm: this.config.algorithm,
    };
  }

  /**
   * Decrypt data
   */
  async decrypt<T>(encrypted: EncryptedData): Promise<T> {
    if (!this.derivedKey) {
      throw new Error('MemoryEncryption not initialized. Call initialize() first.');
    }

    const ciphertext = this.base64ToArrayBuffer(encrypted.ciphertext);
    const iv = this.base64ToArrayBuffer(encrypted.iv);

    try {
      const decrypted = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: new Uint8Array(iv),
        },
        this.derivedKey,
        ciphertext
      );

      const decoder = new TextDecoder();
      return JSON.parse(decoder.decode(decrypted));
    } catch (error) {
      throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Batch encrypt multiple items
   */
  async encryptBatch<T>(items: T[]): Promise<EncryptedData[]> {
    return Promise.all(items.map(item => this.encrypt(item)));
  }

  /**
   * Batch decrypt multiple items
   */
  async decryptBatch<T>(encryptedItems: EncryptedData[]): Promise<T[]> {
    return Promise.all(encryptedItems.map(item => this.decrypt<T>(item)));
  }

  /**
   * Check if encryption is initialized
   */
  isInitialized(): boolean {
    return this.derivedKey !== null;
  }

  /**
   * Clear the derived key from memory
   */
  clear(): void {
    this.derivedKey = null;
    this.keyCache.clear();
  }

  /**
   * Generate a secure hash of data for integrity checking
   */
  async hash(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    return this.arrayBufferToBase64(hashBuffer);
  }

  /**
   * Verify data integrity against hash
   */
  async verify(data: string, expectedHash: string): Promise<boolean> {
    const actualHash = await this.hash(data);
    return actualHash === expectedHash;
  }

  /**
   * Utility: Convert ArrayBuffer to base64
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Utility: Convert base64 to ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Get encryption statistics (for monitoring)
   */
  getStats(): {
    initialized: boolean;
    algorithm: string;
    keyDerivation: string;
    iterations: number;
    cacheSize: number;
  } {
    return {
      initialized: this.isInitialized(),
      algorithm: this.config.algorithm,
      keyDerivation: this.config.keyDerivation,
      iterations: this.config.iterations,
      cacheSize: this.keyCache.size,
    };
  }
}

// Singleton instance
let instance: MemoryEncryption | null = null;

export function getMemoryEncryption(): MemoryEncryption {
  if (!instance) {
    instance = new MemoryEncryption();
  }
  return instance;
}

export function resetMemoryEncryption(): void {
  instance?.clear();
  instance = null;
}
