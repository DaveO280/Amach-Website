import type { MetricSample } from "@/agents/types";
import type { HealthGoal, HealthScore } from "../../types/HealthContext";
import type { DailyHealthScores } from "../../utils/dailyHealthScoreCalculator";
import {
  HealthDataResults,
  HealthMetric,
  MetricType,
} from "../types/healthMetrics";
import { HealthDataValidator } from "../validation/healthDataValidator";

const DB_NAME = "amach-health-db";
const DB_VERSION = 4; // Increment version to add parsedReports to uploaded files
const STORE_NAME = "health-data";
const GOALS_STORE = "goals";
const DAILY_SCORES_STORE = "daily-scores";
const UPLOADED_FILES_STORE = "uploaded-files";
const PROCESSED_DATA_STORE = "processed-data"; // New store for pre-aggregated data

// Keep raw IndexedDB samples recent for performance; long-range is preserved in processed aggregates.
const RAW_RETENTION_DAYS = 180; // ~6 months

function trimRawToRecentWindow(data: HealthDataResults): HealthDataResults {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RAW_RETENTION_DAYS);
  const cutoffMs = cutoff.getTime();

  const trimmed: HealthDataResults = {};

  for (const [metricType, metrics] of Object.entries(data)) {
    // Sleep and some records can straddle boundaries; include if either start OR end is within window.
    trimmed[metricType as keyof HealthDataResults] = (metrics || []).filter(
      (m) => {
        const startMs = new Date(m.startDate).getTime();
        const endMs = new Date((m.endDate as string) || m.startDate).getTime();
        if (Number.isNaN(startMs) && Number.isNaN(endMs)) return false;
        return (
          (Number.isNaN(startMs) ? false : startMs >= cutoffMs) ||
          (Number.isNaN(endMs) ? false : endMs >= cutoffMs)
        );
      },
    ) as HealthMetric[];
  }

  return trimmed;
}

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
  parsedReports?: Array<{
    report: unknown;
    extractedAt: string;
    storjUri?: string;
    savedToStorjAt?: string;
  }>; // Cached parsed reports to avoid re-parsing
  metadata?: Record<string, unknown>;
  pageCount?: number;
  uploadedAt: string;
  lastAccessed: string;
}

interface ProcessedDataStore {
  id: string;
  // Daily aggregates stored as serialized Map
  dailyAggregates: Record<
    string,
    Array<{
      dateKey: string;
      timestamp: string;
      value: number;
      unit: string;
      metadata?: Record<string, unknown>;
    }>
  >;
  // Processed sleep data
  sleepData: unknown[];
  // Date range
  dateRange: {
    start: string;
    end: string;
  };
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
        // Create processed data store if it doesn't exist
        if (!db.objectStoreNames.contains(PROCESSED_DATA_STORE)) {
          const processedDataStore = db.createObjectStore(
            PROCESSED_DATA_STORE,
            {
              keyPath: "id",
            },
          );
          processedDataStore.createIndex("lastUpdated", "lastUpdated", {
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
    console.log("💿 [IndexedDB Debug] saveHealthData called with:", {
      metrics: Object.keys(data),
      totalRecords: Object.values(data).reduce(
        (sum, arr) => sum + arr.length,
        0,
      ),
    });

    if (!this.isInitialized) {
      await this.initialize();
    }

    // Validate data before saving
    HealthDataValidator.validateResults(data);
    console.log("✅ [IndexedDB Debug] Data validation passed");

    const db = await this.initDB();

    // Get existing data first
    const existingData = (await this.getHealthData()) || {};

    console.log("🔍 [IndexedDB Debug] Existing data:", {
      metrics: Object.keys(existingData),
      counts: Object.entries(existingData).map(([k, v]) => `${k}: ${v.length}`),
    });

    // Merge and deduplicate OUTSIDE the transaction to avoid blocking UI
    const mergedData: HealthDataResults = { ...existingData };

    // Lightweight deduplication: Skip new records with dates that already exist
    // This prevents overlapping uploads from duplicating data
    console.log(
      "🔍 [IndexedDB Debug] Checking for overlapping dates in new data",
    );

    for (const [metricType, newMetrics] of Object.entries(data)) {
      const existingMetrics = existingData[metricType] || [];
      console.log(`📝 [IndexedDB Debug] Processing ${metricType}:`, {
        existing: existingMetrics.length,
        new: newMetrics.length,
      });

      // Build a Set of existing dates for fast lookup (O(1) instead of O(n))
      const existingDates = new Set(existingMetrics.map((m) => m.startDate));

      // Only add new metrics that don't have overlapping dates
      const nonOverlappingMetrics = newMetrics.filter(
        (m) => !existingDates.has(m.startDate),
      );

      console.log(
        `   🔍 Found ${newMetrics.length - nonOverlappingMetrics.length} overlapping records (skipped)`,
      );

      // Merge existing data with only non-overlapping new data
      mergedData[metricType] = [
        ...existingMetrics,
        ...nonOverlappingMetrics,
      ] as HealthMetric[];

      console.log(
        `   ✅ Merged: ${mergedData[metricType].length} total records`,
      );

      // Yield to UI thread every metric type
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    console.log("🔀 [IndexedDB Debug] Final merged data:", {
      metrics: Object.keys(mergedData),
      counts: Object.entries(mergedData).map(([k, v]) => `${k}: ${v.length}`),
    });

    // Trim raw samples to a recent window to keep IndexedDB lean and UI fast.
    const trimmedMergedData = trimRawToRecentWindow(mergedData);

    console.log("✂️ [IndexedDB Debug] Trimmed raw data window:", {
      retentionDays: RAW_RETENTION_DAYS,
      counts: Object.entries(trimmedMergedData).map(
        ([k, v]) => `${k}: ${v.length}`,
      ),
    });

    // Now save in a quick transaction
    return new Promise<void>((resolve, reject): void => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      const healthData: HealthDataStore = {
        id: "current",
        data: trimmedMergedData,
        lastUpdated: new Date().toISOString(),
      };

      const putRequest = store.put(healthData);
      putRequest.onsuccess = (): void => {
        console.log(
          "✅ [IndexedDB Debug] Data saved successfully to IndexedDB!",
        );
        resolve();
      };
      putRequest.onerror = (): void => {
        console.error(
          "❌ [IndexedDB Debug] Error saving to IndexedDB:",
          putRequest.error,
        );
        reject(putRequest.error);
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
    parsedReports?: Array<{
      report: unknown;
      extractedAt: string;
      storjUri?: string;
      savedToStorjAt?: string;
    }>,
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
        parsedReports, // Store parsed reports to avoid re-parsing
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

  // ============================================================================
  // Processed Data Methods
  // ============================================================================

  /**
   * Save processed health data (pre-aggregated)
   * This stores daily aggregates and processed sleep data
   */
  async saveProcessedData(processedData: {
    dailyAggregates: Record<string, Map<string, unknown>>;
    sleepData: unknown[];
    dateRange: { start: Date; end: Date };
  }): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    console.log("[IndexedDB] Saving processed data...");

    const db = await this.initDB();
    return new Promise<void>((resolve, reject): void => {
      const transaction = db.transaction([PROCESSED_DATA_STORE], "readwrite");
      const store = transaction.objectStore(PROCESSED_DATA_STORE);

      // Serialize Map to array for storage
      const serializedAggregates: Record<
        string,
        Array<{
          dateKey: string;
          timestamp: string;
          value: number;
          unit: string;
          metadata?: Record<string, unknown>;
        }>
      > = {};

      for (const [metricType, dailyMap] of Object.entries(
        processedData.dailyAggregates,
      )) {
        const entries = Array.from(dailyMap.entries()).map(
          ([dateKey, sample]) => {
            const metricSample = sample as MetricSample;
            return {
              dateKey,
              timestamp: metricSample.timestamp.toISOString(),
              value: metricSample.value,
              unit: metricSample.unit || "",
              metadata: metricSample.metadata,
            };
          },
        );
        serializedAggregates[metricType] = entries;
      }

      const dataToStore: ProcessedDataStore = {
        id: "current",
        dailyAggregates: serializedAggregates,
        sleepData: processedData.sleepData,
        dateRange: {
          start: processedData.dateRange.start.toISOString(),
          end: processedData.dateRange.end.toISOString(),
        },
        lastUpdated: new Date().toISOString(),
      };

      const request = store.put(dataToStore);

      request.onerror = (): void => {
        console.error(
          "[IndexedDB] Error saving processed data:",
          request.error,
        );
        reject(request.error);
      };

      request.onsuccess = (): void => {
        console.log("[IndexedDB] Processed data saved successfully");
        resolve();
      };
    });
  }

  /**
   * Get processed health data (pre-aggregated)
   */
  async getProcessedData(): Promise<{
    dailyAggregates: Record<string, Map<string, unknown>>;
    sleepData: unknown[];
    dateRange: { start: Date; end: Date };
    lastUpdated: Date;
  } | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const db = await this.initDB();
    return new Promise<{
      dailyAggregates: Record<string, Map<string, unknown>>;
      sleepData: unknown[];
      dateRange: { start: Date; end: Date };
      lastUpdated: Date;
    } | null>((resolve, reject): void => {
      const transaction = db.transaction([PROCESSED_DATA_STORE], "readonly");
      const store = transaction.objectStore(PROCESSED_DATA_STORE);
      const request = store.get("current");

      request.onerror = (): void => {
        reject(request.error);
      };

      request.onsuccess = (): void => {
        const result = request.result as ProcessedDataStore | undefined;

        if (!result) {
          resolve(null);
          return;
        }

        // Deserialize arrays back to Map
        const dailyAggregates: Record<string, Map<string, unknown>> = {};

        for (const [metricType, entries] of Object.entries(
          result.dailyAggregates,
        )) {
          const map = new Map<string, unknown>();
          for (const entry of entries) {
            map.set(entry.dateKey, {
              timestamp: new Date(entry.timestamp),
              value: entry.value,
              unit: entry.unit,
              metadata: entry.metadata,
            });
          }
          dailyAggregates[metricType] = map;
        }

        resolve({
          dailyAggregates,
          sleepData: result.sleepData,
          dateRange: {
            start: new Date(result.dateRange.start),
            end: new Date(result.dateRange.end),
          },
          lastUpdated: new Date(result.lastUpdated),
        });
      };
    });
  }

  /**
   * Clear processed data
   */
  async clearProcessedData(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const db = await this.initDB();
    return new Promise<void>((resolve, reject): void => {
      const transaction = db.transaction([PROCESSED_DATA_STORE], "readwrite");
      const store = transaction.objectStore(PROCESSED_DATA_STORE);
      const request = store.delete("current");

      request.onerror = (): void => {
        console.error(
          "[IndexedDB] Error clearing processed data:",
          request.error,
        );
        reject(request.error);
      };

      request.onsuccess = (): void => {
        console.log("[IndexedDB] Processed data cleared");
        resolve();
      };
    });
  }
}

// Export singleton instance
export const healthDataStore = new HealthDataStoreService();
