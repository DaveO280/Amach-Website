/**
 * IHealthDataStore - Abstract interface for local health data persistence
 *
 * Implementations:
 * - IndexedDBHealthDataStore (web): Current IndexedDB implementation
 * - HealthKitDataStore (iOS): Future native iOS HealthKit + CoreData
 * - MockHealthDataStore (tests): In-memory storage for unit tests
 *
 * This abstraction allows:
 * - Easy testing with mock implementations
 * - Platform-specific storage (IndexedDB vs CoreData/HealthKit)
 * - Consistent API for health data operations
 */

import type { HealthDataResults } from "@/data/types/healthMetrics";
import type { HealthGoal, HealthScore } from "@/types/HealthContext";
import type { DailyHealthScores } from "@/utils/dailyHealthScoreCalculator";

export interface DateRange {
  start: Date;
  end: Date;
}

export interface UploadedFile {
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
  }>;
  metadata?: Record<string, unknown>;
  pageCount?: number;
  uploadedAt: string;
  lastAccessed: string;
}

export interface ProcessedData {
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
  sleepData: unknown[];
  rawHeartRateSamples?: Array<{
    startDate: string;
    value: string;
    unit: string;
    source?: string;
    device?: string;
    type?: string;
    endDate?: string;
  }>;
  dateRange: DateRange;
  lastUpdated: string;
}

export interface MergeOptions {
  /** If true, replace existing data instead of merging */
  replace?: boolean;
  /** If true, skip deduplication (data already deduped) */
  skipDedup?: boolean;
}

/**
 * Abstract interface for local health data persistence
 *
 * Handles raw health data, processed aggregates, goals, and scores.
 * Implementations should handle data retention policies.
 */
export interface IHealthDataStore {
  // ============ Core Health Data ============

  /**
   * Save raw health data (merges with existing by default)
   * @param data - Health data organized by metric type
   * @param options - Merge options
   */
  saveHealthData(
    data: HealthDataResults,
    options?: MergeOptions,
  ): Promise<void>;

  /**
   * Get all raw health data
   * @returns Health data organized by metric type
   */
  getHealthData(): Promise<HealthDataResults | null>;

  /**
   * Clear all raw health data
   */
  clearHealthData(): Promise<void>;

  /**
   * Check if any health data exists
   */
  hasHealthData(): Promise<boolean>;

  // ============ Processed Data (Aggregates) ============

  /**
   * Save pre-processed/aggregated data
   * @param data - Processed data with daily aggregates
   */
  saveProcessedData(data: ProcessedData): Promise<void>;

  /**
   * Get processed data
   */
  getProcessedData(): Promise<ProcessedData | null>;

  /**
   * Clear processed data
   */
  clearProcessedData(): Promise<void>;

  // ============ Health Goals ============

  /**
   * Save user health goals
   * @param goals - Array of health goals
   */
  saveGoals(goals: HealthGoal[]): Promise<void>;

  /**
   * Get user health goals
   */
  getGoals(): Promise<HealthGoal[]>;

  // ============ Health Scores ============

  /**
   * Save health scores (associated with health data)
   * @param scores - Array of health scores
   */
  saveHealthScores(scores: HealthScore[]): Promise<void>;

  /**
   * Get health scores
   */
  getHealthScores(): Promise<HealthScore[]>;

  /**
   * Save daily health scores
   * @param scores - Daily scores array
   */
  saveDailyScores(scores: DailyHealthScores[]): Promise<void>;

  /**
   * Get daily health scores
   */
  getDailyScores(): Promise<DailyHealthScores[]>;

  // ============ Uploaded Files ============

  /**
   * Save uploaded file metadata
   * @param file - File metadata
   */
  saveUploadedFile(file: UploadedFile): Promise<void>;

  /**
   * Get uploaded file by ID
   * @param id - File ID
   */
  getUploadedFile(id: string): Promise<UploadedFile | null>;

  /**
   * Get all uploaded files
   */
  getAllUploadedFiles(): Promise<UploadedFile[]>;

  /**
   * Delete uploaded file
   * @param id - File ID
   */
  deleteUploadedFile(id: string): Promise<void>;

  // ============ Utility ============

  /**
   * Get the date range of stored data
   * @param metricType - Optional specific metric type
   */
  getDateRange(metricType?: string): Promise<DateRange | null>;

  /**
   * Get last update timestamp
   */
  getLastUpdated(): Promise<Date | null>;

  /**
   * Clear all data (factory reset)
   */
  clearAll(): Promise<void>;

  /**
   * Initialize the data store (create tables/stores if needed)
   */
  initialize(): Promise<void>;
}

/**
 * Factory function type for creating health data store instances
 */
export type HealthDataStoreFactory = () => IHealthDataStore;
