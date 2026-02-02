/**
 * LocalStorage Adapter
 * Tiered storage management: Hot (localStorage), Warm (IndexedDB), Cold (Storj)
 */

import {
  StorageTier,
  TierMigrationResult,
  StorageStats,
  LocalStorageEntry,
  DailyHealthLog,
} from './types';
import { MemoryEncryption } from './MemoryEncryption';

const DB_NAME = 'CosaintMemory';
const DB_VERSION = 1;
const WARM_STORE = 'warmStorage';

export interface LocalStorageAdapterConfig {
  hotStorageDays: number;
  warmStorageDays: number;
  encryptionEnabled: boolean;
  cloudArchiveEnabled: boolean;
  storjConfig?: {
    bucket: string;
    endpoint: string;
    accessKey: string;
    secretKey: string;
  };
}

export class LocalStorageAdapter {
  private config: LocalStorageAdapterConfig;
  private encryption: MemoryEncryption;
  private db: IDBDatabase | null = null;
  private initialized = false;

  constructor(
    config: Partial<LocalStorageAdapterConfig> = {},
    encryption: MemoryEncryption
  ) {
    this.config = {
      hotStorageDays: 30,
      warmStorageDays: 60,
      encryptionEnabled: true,
      cloudArchiveEnabled: false,
      ...config,
    };
    this.encryption = encryption;
  }

  /**
   * Initialize the storage adapter
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize IndexedDB for warm storage
    this.db = await this.openIndexedDB();
    this.initialized = true;

    // Run migration check
    await this.migrateTiers();
  }

  /**
   * Open IndexedDB connection
   */
  private openIndexedDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(WARM_STORE)) {
          const store = db.createObjectStore(WARM_STORE, { keyPath: 'key' });
          store.createIndex('date', 'createdAt', { unique: false });
          store.createIndex('tier', 'tier', { unique: false });
        }
      };
    });
  }

  /**
   * Get the storage tier for a given date
   */
  getTierForDate(date: string): StorageTier {
    const logDate = new Date(date);
    const now = new Date();
    const ageDays = Math.floor((now.getTime() - logDate.getTime()) / (1000 * 60 * 60 * 24));

    if (ageDays <= this.config.hotStorageDays) return 'hot';
    if (ageDays <= this.config.hotStorageDays + this.config.warmStorageDays) return 'warm';
    return 'cold';
  }

  /**
   * Store a daily log
   */
  async storeLog(log: DailyHealthLog): Promise<void> {
    const tier = this.getTierForDate(log.date);
    const key = `log:${log.userId}:${log.date}`;

    const entry: LocalStorageEntry<DailyHealthLog> = {
      key,
      value: log,
      createdAt: new Date().toISOString(),
      accessedAt: new Date().toISOString(),
      accessCount: 0,
      tier,
      encrypted: this.config.encryptionEnabled,
    };

    switch (tier) {
      case 'hot':
        await this.storeHot(key, entry);
        break;
      case 'warm':
        await this.storeWarm(key, entry);
        break;
      case 'cold':
        if (this.config.cloudArchiveEnabled) {
          await this.archiveToCold(key, entry);
        } else {
          // Keep in warm if cold not configured
          await this.storeWarm(key, entry);
        }
        break;
    }
  }

  /**
   * Retrieve a daily log
   */
  async retrieveLog(userId: string, date: string): Promise<DailyHealthLog | null> {
    const key = `log:${userId}:${date}`;
    const tier = this.getTierForDate(date);

    let entry: LocalStorageEntry<DailyHealthLog> | null = null;

    switch (tier) {
      case 'hot':
        entry = await this.retrieveHot(key);
        break;
      case 'warm':
        entry = await this.retrieveWarm(key);
        break;
      case 'cold':
        entry = await this.retrieveFromCold(key);
        break;
    }

    if (entry) {
      // Update access metadata
      entry.accessedAt = new Date().toISOString();
      entry.accessCount++;
      
      // Re-store to update metadata
      await this.storeLog(entry.value);
    }

    return entry?.value ?? null;
  }

  /**
   * Store in hot tier (localStorage)
   */
  private async storeHot(key: string, entry: LocalStorageEntry<DailyHealthLog>): Promise<void> {
    let dataToStore: string;

    if (this.config.encryptionEnabled && this.encryption.isInitialized()) {
      const encrypted = await this.encryption.encrypt(entry);
      dataToStore = JSON.stringify(encrypted);
    } else {
      dataToStore = JSON.stringify(entry);
    }

    try {
      localStorage.setItem(key, dataToStore);
    } catch (e) {
      // localStorage quota exceeded - migrate oldest to warm
      await this.migrateOldestHotToWarm();
      localStorage.setItem(key, dataToStore);
    }
  }

  /**
   * Retrieve from hot tier
   */
  private async retrieveHot(key: string): Promise<LocalStorageEntry<DailyHealthLog> | null> {
    const data = localStorage.getItem(key);
    if (!data) return null;

    try {
      const parsed = JSON.parse(data);
      
      // Check if encrypted
      if (parsed.ciphertext) {
        if (!this.encryption.isInitialized()) {
          throw new Error('Encryption key required to decrypt data');
        }
        return await this.encryption.decrypt(parsed);
      }
      
      return parsed;
    } catch (e) {
      console.error('Failed to parse hot storage entry:', e);
      return null;
    }
  }

  /**
   * Store in warm tier (IndexedDB)
   */
  private async storeWarm(key: string, entry: LocalStorageEntry<DailyHealthLog>): Promise<void> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    // Remove from hot if present
    localStorage.removeItem(key);

    const transaction = this.db.transaction([WARM_STORE], 'readwrite');
    const store = transaction.objectStore(WARM_STORE);

    let dataToStore: LocalStorageEntry<DailyHealthLog> | { encrypted: boolean; data: unknown } = entry;

    if (this.config.encryptionEnabled && this.encryption.isInitialized()) {
      const encrypted = await this.encryption.encrypt(entry.value);
      dataToStore = {
        ...entry,
        value: encrypted as unknown as DailyHealthLog,
        encrypted: true,
      };
    }

    return new Promise((resolve, reject) => {
      const request = store.put(dataToStore);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Retrieve from warm tier
   */
  private async retrieveWarm(key: string): Promise<LocalStorageEntry<DailyHealthLog> | null> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    const transaction = this.db.transaction([WARM_STORE], 'readonly');
    const store = transaction.objectStore(WARM_STORE);

    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = async () => {
        const entry = request.result as LocalStorageEntry<DailyHealthLog> & { encrypted?: boolean };
        if (!entry) {
          resolve(null);
          return;
        }

        if (entry.encrypted && this.config.encryptionEnabled) {
          if (!this.encryption.isInitialized()) {
            reject(new Error('Encryption key required'));
            return;
          }
          const decrypted = await this.encryption.decrypt(entry.value as unknown as { ciphertext: string; iv: string; salt: string; algorithm: string });
          entry.value = decrypted;
        }

        resolve(entry);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Archive to cold storage (Storj)
   */
  private async archiveToCold(key: string, entry: LocalStorageEntry<DailyHealthLog>): Promise<void> {
    if (!this.config.cloudArchiveEnabled || !this.config.storjConfig) {
      console.warn('Cold storage not configured, keeping in warm tier');
      await this.storeWarm(key, entry);
      return;
    }

    // Remove from warm storage
    if (this.db) {
      const transaction = this.db.transaction([WARM_STORE], 'readwrite');
      const store = transaction.objectStore(WARM_STORE);
      store.delete(key);
    }

    // TODO: Implement Storj upload
    // This would typically use the Storj S3-compatible API
    console.log('Archiving to Storj:', key);
    
    // Store archive metadata
    const archiveMeta = {
      key,
      archivedAt: new Date().toISOString(),
      bucket: this.config.storjConfig.bucket,
    };
    localStorage.setItem(`archive:${key}`, JSON.stringify(archiveMeta));
  }

  /**
   * Retrieve from cold storage
   */
  private async retrieveFromCold(key: string): Promise<LocalStorageEntry<DailyHealthLog> | null> {
    const archiveMeta = localStorage.getItem(`archive:${key}`);
    if (!archiveMeta) {
      // Try warm storage as fallback
      return this.retrieveWarm(key);
    }

    // TODO: Implement Storj download
    console.log('Retrieving from Storj:', key);
    
    // For now, return null - would restore to warm tier on retrieval
    return null;
  }

  /**
   * Migrate old entries to appropriate tiers
   */
  async migrateTiers(): Promise<TierMigrationResult> {
    const result: TierMigrationResult = {
      success: true,
      migrated: [],
      failed: [],
      bytesMoved: 0,
    };

    // Migrate hot entries that should be warm
    const hotKeys = this.listHotKeys();
    for (const key of hotKeys) {
      const entry = await this.retrieveHot(key);
      if (entry) {
        const correctTier = this.getTierForDate(entry.value.date);
        if (correctTier !== 'hot') {
          try {
            localStorage.removeItem(key);
            await this.storeWarm(key, entry);
            result.migrated.push(key);
          } catch (e) {
            result.failed.push(key);
          }
        }
      }
    }

    // Migrate warm entries that should be cold
    if (this.config.cloudArchiveEnabled) {
      const warmEntries = await this.listWarmKeys();
      for (const key of warmEntries) {
        const entry = await this.retrieveWarm(key);
        if (entry) {
          const correctTier = this.getTierForDate(entry.value.date);
          if (correctTier === 'cold') {
            try {
              await this.archiveToCold(key, entry);
              result.migrated.push(key);
            } catch (e) {
              result.failed.push(key);
            }
          }
        }
      }
    }

    result.success = result.failed.length === 0;
    return result;
  }

  /**
   * List all keys in hot storage
   */
  private listHotKeys(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('log:')) {
        keys.push(key);
      }
    }
    return keys;
  }

  /**
   * List all keys in warm storage
   */
  private async listWarmKeys(): Promise<string[]> {
    if (!this.db) return [];

    const transaction = this.db.transaction([WARM_STORE], 'readonly');
    const store = transaction.objectStore(WARM_STORE);

    return new Promise((resolve, reject) => {
      const keys: string[] = [];
      const request = store.openCursor();
      
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result as IDBCursorWithValue;
        if (cursor) {
          keys.push(cursor.key as string);
          cursor.continue();
        } else {
          resolve(keys);
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Migrate oldest hot entries to warm when quota exceeded
   */
  private async migrateOldestHotToWarm(): Promise<void> {
    const keys = this.listHotKeys();
    if (keys.length === 0) return;

    // Find oldest entry
    let oldestKey = keys[0];
    let oldestDate = new Date();

    for (const key of keys) {
      const data = localStorage.getItem(key);
      if (data) {
        try {
          const parsed = JSON.parse(data);
          const entryDate = new Date(parsed.createdAt || parsed.value?.createdAt);
          if (entryDate < oldestDate) {
            oldestDate = entryDate;
            oldestKey = key;
          }
        } catch {
          // Skip invalid entries
        }
      }
    }

    // Migrate oldest to warm
    const entry = await this.retrieveHot(oldestKey);
    if (entry) {
      localStorage.removeItem(oldestKey);
      await this.storeWarm(oldestKey, entry);
    }
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<StorageStats> {
    const hotKeys = this.listHotKeys();
    let hotSize = 0;
    let oldestHotDate: string | null = null;

    for (const key of hotKeys) {
      const data = localStorage.getItem(key);
      if (data) {
        hotSize += data.length * 2; // Approximate UTF-16 size
        try {
          const parsed = JSON.parse(data);
          const date = parsed.value?.date;
          if (date && (!oldestHotDate || date < oldestHotDate)) {
            oldestHotDate = date;
          }
        } catch {
          // Skip invalid entries
        }
      }
    }

    const warmKeys = await this.listWarmKeys();

    return {
      hot: {
        count: hotKeys.length,
        sizeBytes: hotSize,
        oldestDate: oldestHotDate,
      },
      warm: {
        count: warmKeys.length,
        sizeBytes: 0, // Would need to query IndexedDB for size
        oldestDate: null,
      },
      cold: {
        count: 0, // Would query Storj
        sizeBytes: 0,
      },
    };
  }

  /**
   * Clear all storage (use with caution!)
   */
  async clear(): Promise<void> {
    // Clear hot
    const hotKeys = this.listHotKeys();
    for (const key of hotKeys) {
      localStorage.removeItem(key);
    }

    // Clear warm
    if (this.db) {
      const transaction = this.db.transaction([WARM_STORE], 'readwrite');
      const store = transaction.objectStore(WARM_STORE);
      await new Promise<void>((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
  }
}
