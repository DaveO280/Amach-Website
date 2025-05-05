import {
  HealthDataResults,
  HealthMetric,
  MetricType,
} from "../types/healthMetrics";
import { HealthDataValidator } from "../validation/healthDataValidator";

const DB_NAME = "amach-health-db";
const DB_VERSION = 1;
const STORE_NAME = "health-data";

interface HealthDataStore {
  id: string;
  data: HealthDataResults;
  lastUpdated: string;
}

class HealthDataStoreService {
  private db: IDBDatabase | null = null;
  private dbPromise: Promise<IDBDatabase> | null = null;
  private isInitialized = false;

  private async initDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (): void => {
        reject(request.error);
      };

      request.onsuccess = (): void => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event): void => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("lastUpdated", "lastUpdated", { unique: false });
        }
      };
    });

    return this.dbPromise;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this.initDB();
      this.isInitialized = true;
    } catch (error) {
      throw error;
    }
  }

  async saveHealthData(data: HealthDataResults): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Validate data before saving
    HealthDataValidator.validateResults(data);

    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      const healthData: HealthDataStore = {
        id: "current",
        data,
        lastUpdated: new Date().toISOString(),
      };

      const request = store.put(healthData);
      request.onsuccess = (): void => {
        resolve();
      };
      request.onerror = (): void => {
        reject(request.error);
      };
    });
  }

  async getHealthData(): Promise<HealthDataResults | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get("current");

      request.onsuccess = (): void => {
        const result = request.result as HealthDataStore | undefined;
        resolve(result?.data || null);
      };

      request.onerror = (): void => {
        reject(request.error);
      };
    });
  }

  async getLastUpdated(): Promise<Date | null> {
    const db = await this.initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get("current");

      request.onsuccess = (): void => {
        const result = request.result as HealthDataStore | undefined;
        resolve(result?.lastUpdated ? new Date(result.lastUpdated) : null);
      };

      request.onerror = (): void => reject(request.error);
    });
  }

  async clearHealthData(): Promise<void> {
    const db = await this.initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete("current");

      request.onsuccess = (): void => resolve();
      request.onerror = (): void => reject(request.error);
    });
  }

  async updateMetricData(
    metricType: MetricType,
    data: HealthMetric[],
  ): Promise<void> {
    // Validate metric data before updating
    HealthDataValidator.validateMetricData(metricType, data);

    const currentData = (await this.getHealthData()) || {};
    const updatedData = {
      ...currentData,
      [metricType]: data,
    };
    await this.saveHealthData(updatedData);
  }

  async getMetricData(metricType: MetricType): Promise<HealthMetric[] | null> {
    const data = await this.getHealthData();
    return data?.[metricType] || null;
  }

  // Add backup/restore functionality
  async exportData(): Promise<string> {
    const data = await this.getHealthData();
    if (!data) {
      throw new Error("No data to export");
    }
    return JSON.stringify(data, null, 2);
  }

  async importData(jsonString: string): Promise<void> {
    try {
      const data = JSON.parse(jsonString);
      HealthDataValidator.validateResults(data);
      await this.saveHealthData(data);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error("Invalid JSON format");
      }
      throw error;
    }
  }
}

// Export singleton instance
export const healthDataStore = new HealthDataStoreService();
