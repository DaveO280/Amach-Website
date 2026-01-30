/**
 * IndexedDB cache for Storj items
 * Provides fast local access to Storj items without hitting the API every time
 */

const DB_NAME = "amach-health-db";
const DB_VERSION = 5; // Increment to add storj-items-cache store
const STORJ_ITEMS_STORE = "storj-items-cache";

export interface StorjItemCache {
  uri: string; // Primary key
  contentHash: string;
  size: number;
  uploadedAt: number;
  dataType: string;
  metadata?: Record<string, string>;
  cachedAt: number; // When this was cached from Storj
  userAddress: string; // Which user's items these are
}

export class StorjItemsCache {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async initialize(): Promise<void> {
    if (typeof window === "undefined") return;
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error);
      req.onupgradeneeded = (event): void => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORJ_ITEMS_STORE)) {
          const store = db.createObjectStore(STORJ_ITEMS_STORE, {
            keyPath: "uri",
          });
          store.createIndex("dataType", "dataType", { unique: false });
          store.createIndex("userAddress", "userAddress", { unique: false });
          store.createIndex("uploadedAt", "uploadedAt", { unique: false });
          store.createIndex("cachedAt", "cachedAt", { unique: false });
        }
      };
      req.onsuccess = (): void => {
        this.db = req.result;
        resolve();
      };
    });

    return this.initPromise;
  }

  private async getDb(): Promise<IDBDatabase> {
    await this.initialize();
    if (!this.db) throw new Error("IndexedDB not initialized");
    return this.db;
  }

  /**
   * Cache Storj items for a user
   */
  async cacheItems(
    userAddress: string,
    items: Array<{
      uri: string;
      contentHash: string;
      size: number;
      uploadedAt: number;
      dataType: string;
      metadata?: Record<string, string>;
    }>,
  ): Promise<void> {
    const db = await this.getDb();
    const transaction = db.transaction([STORJ_ITEMS_STORE], "readwrite");
    const store = transaction.objectStore(STORJ_ITEMS_STORE);

    // First, remove old items for this user
    const index = store.index("userAddress");
    const range = IDBKeyRange.only(userAddress.toLowerCase());
    const clearRequest = index.openCursor(range);
    await new Promise<void>((resolve, reject) => {
      clearRequest.onsuccess = (event): void => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      clearRequest.onerror = () => reject(clearRequest.error);
    });

    // Then, add new items
    const now = Date.now();
    for (const item of items) {
      const cacheItem: StorjItemCache = {
        ...item,
        cachedAt: now,
        userAddress: userAddress.toLowerCase(),
      };
      await new Promise<void>((resolve, reject) => {
        const request = store.put(cacheItem);
        request.onsuccess = (): void => {
          resolve();
        };
        request.onerror = (): void => {
          reject(request.error);
        };
      });
    }
  }

  /**
   * Get cached items for a user, optionally filtered by dataType
   */
  async getCachedItems(
    userAddress: string,
    dataType?: string,
  ): Promise<StorjItemCache[]> {
    const db = await this.getDb();
    const transaction = db.transaction([STORJ_ITEMS_STORE], "readonly");
    const store = transaction.objectStore(STORJ_ITEMS_STORE);

    const userAddressLower = userAddress.toLowerCase();
    const index = store.index("userAddress");
    const range = IDBKeyRange.only(userAddressLower);

    return new Promise((resolve, reject) => {
      const items: StorjItemCache[] = [];
      const request = index.openCursor(range);

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const item = cursor.value as StorjItemCache;
          if (!dataType || item.dataType === dataType) {
            items.push(item);
          }
          cursor.continue();
        } else {
          // Sort by uploadedAt, newest first
          items.sort((a, b) => b.uploadedAt - a.uploadedAt);
          resolve(items);
        }
      };

      request.onerror = (): void => {
        reject(request.error);
      };
    });
  }

  /**
   * Add a single item to cache (e.g., when a new file is saved to Storj)
   */
  async cacheItem(
    userAddress: string,
    item: {
      uri: string;
      contentHash: string;
      size: number;
      uploadedAt: number;
      dataType: string;
      metadata?: Record<string, string>;
    },
  ): Promise<void> {
    const db = await this.getDb();
    const transaction = db.transaction([STORJ_ITEMS_STORE], "readwrite");
    const store = transaction.objectStore(STORJ_ITEMS_STORE);

    const cacheItem: StorjItemCache = {
      ...item,
      cachedAt: Date.now(),
      userAddress: userAddress.toLowerCase(),
    };

    return new Promise((resolve, reject) => {
      const request = store.put(cacheItem);
      request.onsuccess = (): void => {
        resolve();
      };
      request.onerror = (): void => {
        reject(request.error);
      };
    });
  }

  /**
   * Remove an item from cache (e.g., when deleted from Storj)
   */
  async removeItem(uri: string): Promise<void> {
    const db = await this.getDb();
    const transaction = db.transaction([STORJ_ITEMS_STORE], "readwrite");
    const store = transaction.objectStore(STORJ_ITEMS_STORE);

    return new Promise((resolve, reject) => {
      const request = store.delete(uri);
      request.onsuccess = (): void => {
        resolve();
      };
      request.onerror = (): void => {
        reject(request.error);
      };
    });
  }

  /**
   * Clear all cached items for a user
   */
  async clearUserCache(userAddress: string): Promise<void> {
    const db = await this.getDb();
    const transaction = db.transaction([STORJ_ITEMS_STORE], "readwrite");
    const store = transaction.objectStore(STORJ_ITEMS_STORE);

    const index = store.index("userAddress");
    const range = IDBKeyRange.only(userAddress.toLowerCase());

    return new Promise((resolve, reject) => {
      const request = index.openCursor(range);
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = (): void => {
        reject(request.error);
      };
    });
  }
}

// Singleton instance
export const storjItemsCache = new StorjItemsCache();
