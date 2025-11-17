import type { HealthGoal, HealthScore } from "../../types/HealthContext";
import type { DailyHealthScores } from "../../utils/dailyHealthScoreCalculator";
import {
  HealthDataResults,
  HealthMetric,
  MetricType,
} from "../types/healthMetrics";
import { HealthDataValidator } from "../validation/healthDataValidator";

const DB_NAME = "amach-health-db";
const DB_VERSION = 2; // Increment version for new store
const STORE_NAME = "health-data";
const GOALS_STORE = "goals";
const DAILY_SCORES_STORE = "daily-scores";
const UPLOADED_FILES_STORE = "uploaded-files";

interface HealthDataStore {
  id: string;
  data: HealthDataResults & { healthScores?: HealthScore[] };
  lastUpdated: string;
}

interface DailyScoresStore {
  id: string;
  dailyScores: DailyHealthScores[];
  lastUpdated: string;
}

interface UploadedFileStore {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  parsedContent: string;
  metadata?: Record<string, unknown>;
  pageCount?: number;
  uploadedAt: string;
  lastAccessed: string;
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

        // Create health data store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("lastUpdated", "lastUpdated", { unique: false });
        }
        // Create goals store if it doesn't exist
        if (!db.objectStoreNames.contains(GOALS_STORE)) {
          db.createObjectStore(GOALS_STORE, { keyPath: "id" });
        }
        // Create daily scores store if it doesn't exist
        if (!db.objectStoreNames.contains(DAILY_SCORES_STORE)) {
          const dailyScoresStore = db.createObjectStore(DAILY_SCORES_STORE, {
            keyPath: "id",
          });
          dailyScoresStore.createIndex("lastUpdated", "lastUpdated", {
            unique: false,
          });
        }
        // Create uploaded files store if it doesn't exist
        if (!db.objectStoreNames.contains(UPLOADED_FILES_STORE)) {
          const uploadedFilesStore = db.createObjectStore(
            UPLOADED_FILES_STORE,
            {
              keyPath: "id",
            },
          );
          uploadedFilesStore.createIndex("uploadedAt", "uploadedAt", {
            unique: false,
          });
          uploadedFilesStore.createIndex("fileName", "fileName", {
            unique: false,
          });
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
    return new Promise<void>((resolve, reject): void => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      // First, get existing data to merge with
      const getRequest = store.get("current");

      getRequest.onsuccess = (): void => {
        const existingResult = getRequest.result as HealthDataStore | undefined;
        const existingData = existingResult?.data || {};

        // Merge new data with existing data
        const mergedData: HealthDataResults = { ...existingData };

        // Process all metric types synchronously
        Object.entries(data).forEach(([metricType, newMetrics]) => {
          const existingMetrics = existingData[metricType] || [];
          const combinedMetrics = [...existingMetrics, ...newMetrics];

          // Efficient deduplication using Set for O(n) performance
          const seenKeys = new Set<string>();
          const uniqueMetrics = combinedMetrics.filter((metric) => {
            const key = `${metric.startDate}-${metric.value}-${metric.type}`;
            if (seenKeys.has(key)) {
              return false;
            }
            seenKeys.add(key);
            return true;
          });

          mergedData[metricType as keyof HealthDataResults] = uniqueMetrics;
        });

        // Save the merged data
        const healthData: HealthDataStore = {
          id: "current",
          data: mergedData,
          lastUpdated: new Date().toISOString(),
        };

        const putRequest = store.put(healthData);
        putRequest.onsuccess = (): void => {
          resolve();
        };
        putRequest.onerror = (): void => {
          reject(putRequest.error);
        };
      };

      getRequest.onerror = (): void => {
        reject(getRequest.error);
      };
    });
  }

  async getHealthData(): Promise<HealthDataResults | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const db = await this.initDB();
    return new Promise<HealthDataResults | null>((resolve, reject): void => {
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

    return new Promise<Date | null>((resolve, reject): void => {
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

    return new Promise<void>((resolve, reject): void => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete("current");

      request.onsuccess = (): void => resolve();
      request.onerror = (): void => reject(request.error);
    });
  }

  async clearDailyHealthScores(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    const db = await this.initDB();

    return new Promise<void>((resolve, reject): void => {
      const transaction = db.transaction([DAILY_SCORES_STORE], "readwrite");
      const store = transaction.objectStore(DAILY_SCORES_STORE);
      const request = store.delete("current");

      request.onsuccess = (): void => {
        console.log("✅ [IndexedDB] Daily health scores cleared");
        resolve();
      };
      request.onerror = (): void => {
        console.error(
          "❌ [IndexedDB] Error clearing daily health scores:",
          request.error,
        );
        reject(request.error);
      };
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

  // Save all goals (overwrites all existing goals)
  async saveGoals(goals: HealthGoal[]): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    const db = await this.initDB();
    return new Promise<void>((resolve, reject): void => {
      const transaction = db.transaction([GOALS_STORE], "readwrite");
      const store = transaction.objectStore(GOALS_STORE);
      // Clear all existing goals first
      const clearReq = store.clear();
      clearReq.onsuccess = (): void => {
        // Add new goals
        let completed = 0;
        if (goals.length === 0) resolve();
        goals.forEach((goal): void => {
          const req = store.put(goal);
          req.onsuccess = (): void => {
            completed++;
            if (completed === goals.length) resolve();
          };
          req.onerror = (): void => reject(req.error);
        });
      };
      clearReq.onerror = (): void => reject(clearReq.error);
    });
  }

  // Save health scores to IndexedDB
  async saveHealthScores(healthScores: HealthScore[]): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    const db = await this.initDB();
    return new Promise<void>((resolve, reject): void => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      // Get existing health data
      const getRequest = store.get("current");
      getRequest.onsuccess = (): void => {
        const existingResult = getRequest.result as HealthDataStore | undefined;
        const existingData = existingResult?.data || {};

        // Create updated data with health scores
        const updatedData = {
          ...existingData,
        } as HealthDataResults & { healthScores?: HealthScore[] };

        // Add health scores
        updatedData.healthScores = healthScores;

        // Save the updated data
        const healthData: HealthDataStore = {
          id: "current",
          data: updatedData,
          lastUpdated: new Date().toISOString(),
        };

        const putRequest = store.put(healthData);
        putRequest.onsuccess = (): void => {
          console.log("Health scores saved to IndexedDB:", healthScores);
          resolve();
        };
        putRequest.onerror = (): void => {
          reject(putRequest.error);
        };
      };
      getRequest.onerror = (): void => reject(getRequest.error);
    });
  }

  // Get all goals
  async getGoals(): Promise<HealthGoal[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    const db = await this.initDB();
    return new Promise<HealthGoal[]>((resolve, reject): void => {
      const transaction = db.transaction([GOALS_STORE], "readonly");
      const store = transaction.objectStore(GOALS_STORE);
      const req = store.getAll();
      req.onsuccess = (): void => {
        resolve(req.result as HealthGoal[]);
      };
      req.onerror = (): void => reject(req.error);
    });
  }

  // Save daily health scores to IndexedDB
  async saveDailyHealthScores(dailyScores: DailyHealthScores[]): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    const db = await this.initDB();

    return new Promise<void>((resolve, reject): void => {
      const transaction = db.transaction([DAILY_SCORES_STORE], "readwrite");
      const store = transaction.objectStore(DAILY_SCORES_STORE);

      // Get existing daily scores first
      const getRequest = store.get("current");
      getRequest.onsuccess = (): void => {
        const existingResult = getRequest.result as
          | DailyScoresStore
          | undefined;
        const existingScores = existingResult?.dailyScores || [];

        // Merge new scores with existing ones, preferring newer scores for duplicate dates
        const existingScoresMap = new Map<string, DailyHealthScores>();
        existingScores.forEach((score) => {
          existingScoresMap.set(score.date, score);
        });

        // Add new scores, overwriting existing ones for the same date
        dailyScores.forEach((newScore) => {
          existingScoresMap.set(newScore.date, newScore);
        });

        // Convert back to array and sort by date (newest first)
        const mergedScores = Array.from(existingScoresMap.values()).sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );

        const dailyScoresData: DailyScoresStore = {
          id: "current",
          dailyScores: mergedScores,
          lastUpdated: new Date().toISOString(),
        };

        const putRequest = store.put(dailyScoresData);
        putRequest.onsuccess = (): void => {
          console.log(
            `✅ [IndexedDB] Daily health scores saved: ${mergedScores.length} total scores`,
          );
          resolve();
        };
        putRequest.onerror = (): void => {
          console.error(
            "❌ [IndexedDB] Error saving daily health scores:",
            putRequest.error,
          );
          reject(putRequest.error);
        };
      };
      getRequest.onerror = (): void => reject(getRequest.error);
    });
  }

  // Get daily health scores from IndexedDB
  async getDailyHealthScores(): Promise<DailyHealthScores[] | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const db = await this.initDB();
    return new Promise<DailyHealthScores[] | null>((resolve, reject): void => {
      const transaction = db.transaction([DAILY_SCORES_STORE], "readonly");
      const store = transaction.objectStore(DAILY_SCORES_STORE);
      const request = store.get("current");

      request.onerror = (): void => {
        reject(request.error);
      };

      request.onsuccess = (): void => {
        const result = request.result as DailyScoresStore | undefined;
        resolve(result?.dailyScores || null);
      };
    });
  }

  // Uploaded Files Methods
  async saveUploadedFile(
    file: File,
    parsedContent: string,
    metadata?: Record<string, unknown>,
    pageCount?: number,
  ): Promise<string> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const db = await this.initDB();
    return new Promise<string>((resolve, reject): void => {
      const transaction = db.transaction([UPLOADED_FILES_STORE], "readwrite");
      const store = transaction.objectStore(UPLOADED_FILES_STORE);

      const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date().toISOString();

      const fileData: UploadedFileStore = {
        id: fileId,
        fileName: file.name,
        fileType: file.type || file.name.split(".").pop() || "unknown",
        fileSize: file.size,
        parsedContent,
        metadata,
        pageCount,
        uploadedAt: now,
        lastAccessed: now,
      };

      const request = store.put(fileData);

      request.onerror = (): void => {
        reject(request.error);
      };

      request.onsuccess = (): void => {
        resolve(fileId);
      };
    });
  }

  async getUploadedFile(fileId: string): Promise<UploadedFileStore | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const db = await this.initDB();
    return new Promise<UploadedFileStore | null>((resolve, reject): void => {
      const transaction = db.transaction([UPLOADED_FILES_STORE], "readwrite");
      const store = transaction.objectStore(UPLOADED_FILES_STORE);
      const request = store.get(fileId);

      request.onerror = (): void => {
        reject(request.error);
      };

      request.onsuccess = (): void => {
        const result = request.result as UploadedFileStore | undefined;
        if (result) {
          // Update last accessed time
          result.lastAccessed = new Date().toISOString();
          store.put(result);
        }
        resolve(result || null);
      };
    });
  }

  async getAllUploadedFiles(): Promise<UploadedFileStore[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const db = await this.initDB();
    return new Promise<UploadedFileStore[]>((resolve, reject): void => {
      const transaction = db.transaction([UPLOADED_FILES_STORE], "readonly");
      const store = transaction.objectStore(UPLOADED_FILES_STORE);
      const request = store.getAll();

      request.onerror = (): void => {
        reject(request.error);
      };

      request.onsuccess = (): void => {
        const results = request.result as UploadedFileStore[];
        // Sort by upload date, newest first
        results.sort(
          (a, b) =>
            new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
        );
        resolve(results);
      };
    });
  }

  async deleteUploadedFile(fileId: string): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const db = await this.initDB();
    return new Promise<void>((resolve, reject): void => {
      const transaction = db.transaction([UPLOADED_FILES_STORE], "readwrite");
      const store = transaction.objectStore(UPLOADED_FILES_STORE);
      const request = store.delete(fileId);

      request.onerror = (): void => {
        reject(request.error);
      };

      request.onsuccess = (): void => {
        resolve();
      };
    });
  }

  async clearAllUploadedFiles(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const db = await this.initDB();
    return new Promise<void>((resolve, reject): void => {
      const transaction = db.transaction([UPLOADED_FILES_STORE], "readwrite");
      const store = transaction.objectStore(UPLOADED_FILES_STORE);
      const request = store.clear();

      request.onerror = (): void => {
        reject(request.error);
      };

      request.onsuccess = (): void => {
        resolve();
      };
    });
  }
}

// Export singleton instance
export const healthDataStore = new HealthDataStoreService();
