/**
 * AppleHealthStorjService
 *
 * Handles the complete flow of:
 * 1. Aggregating ALL Apple Health metrics into daily summaries
 * 2. De-identifying the data
 * 3. Building a manifest with completeness scoring
 * 4. Encrypting and uploading to Storj
 * 5. Creating on-chain attestation
 */

import type { HealthDataPoint } from "@/types/healthData";
import type { WalletEncryptionKey } from "@/utils/walletEncryption";
import { StorageService } from "../StorageService";
import {
  getAggregationStrategy,
  normalizeMetricKey,
  type AggregationType,
} from "./metricAggregationStrategies";
import {
  calculateAppleHealthCompleteness,
  getAttestationTier,
} from "@/types/healthDataAttestation";

// ============================================
// TYPES
// ============================================

export interface DailySummaryValue {
  // For sum/count metrics
  total?: number;
  // For avg metrics
  avg?: number;
  // For avg_min_max metrics
  min?: number;
  max?: number;
  // Sample count for the day
  count?: number;
}

export interface SleepSummary {
  total: number; // Total sleep time in minutes
  inBed: number; // Time in bed
  awake: number; // Awake time during night
  core: number; // Light/core sleep
  deep: number; // Deep sleep
  rem: number; // REM sleep
  efficiency?: number; // sleep/inBed ratio
}

export interface DailySummary {
  [metricKey: string]: DailySummaryValue | SleepSummary | number;
}

export interface AppleHealthManifest {
  version: 1;
  exportDate: string;
  uploadDate: string;
  dateRange: {
    start: string;
    end: string;
  };
  metricsPresent: string[];
  completeness: {
    score: number;
    tier: string;
    coreComplete: boolean;
    daysCovered: number;
    recordCount: number;
  };
  sources: {
    watch: number;
    phone: number;
    other: number;
  };
}

export interface AppleHealthStorjPayload {
  manifest: AppleHealthManifest;
  dailySummaries: Record<string, DailySummary>;
}

export interface AppleHealthStorjResult {
  success: boolean;
  storjUri?: string;
  contentHash?: string;
  manifest?: AppleHealthManifest;
  error?: string;
}

// ============================================
// SERVICE
// ============================================

export class AppleHealthStorjService {
  private storageService: StorageService;

  constructor(storageService?: StorageService) {
    this.storageService = storageService || new StorageService();
  }

  /**
   * Main entry point: Process health data and save to Storj
   */
  async saveToStorj(
    allMetricsData: Record<string, HealthDataPoint[]>,
    walletKey: WalletEncryptionKey,
    onProgress?: (progress: number, message: string) => void,
  ): Promise<AppleHealthStorjResult> {
    try {
      onProgress?.(10, "Aggregating daily summaries...");

      // 1. Build daily summaries from all metrics
      const dailySummaries = this.buildDailySummaries(allMetricsData);

      onProgress?.(30, "De-identifying data...");

      // 2. De-identify (already done during aggregation - no device names)
      // Additional de-identification could go here

      onProgress?.(50, "Calculating completeness...");

      // 3. Build manifest with completeness scoring
      const manifest = this.buildManifest(allMetricsData, dailySummaries);

      onProgress?.(60, "Preparing payload...");

      // 4. Create payload
      const payload: AppleHealthStorjPayload = {
        manifest,
        dailySummaries,
      };

      onProgress?.(70, "Encrypting and uploading...");

      // 5. Calculate content hash before encryption
      const contentHash = await this.computeContentHash(payload);

      // 6. Save to Storj using the correct StorageService API
      const storjResult = await this.storageService.storeHealthData(
        payload,
        walletKey.walletAddress,
        walletKey,
        {
          dataType: "apple-health-full-export",
          metadata: {
            version: "1",
            dateRange: `${manifest.dateRange.start}_${manifest.dateRange.end}`,
            metricsCount: String(manifest.metricsPresent.length),
            completenessScore: String(manifest.completeness.score),
            tier: manifest.completeness.tier,
          },
        },
      );

      onProgress?.(100, "Complete!");

      return {
        success: true,
        storjUri: storjResult.storjUri,
        contentHash,
        manifest,
      };
    } catch (error) {
      console.error("[AppleHealthStorjService] Error saving to Storj:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Build daily summaries from all metrics data
   */
  buildDailySummaries(
    allMetricsData: Record<string, HealthDataPoint[]>,
  ): Record<string, DailySummary> {
    const dailySummaries: Record<string, DailySummary> = {};

    for (const [metricType, dataPoints] of Object.entries(allMetricsData)) {
      if (!dataPoints || dataPoints.length === 0) continue;

      const strategy = getAggregationStrategy(metricType);
      const metricKey = normalizeMetricKey(metricType);

      // Special handling for sleep
      if (metricType === "HKCategoryTypeIdentifierSleepAnalysis") {
        this.aggregateSleepData(dataPoints, dailySummaries);
        continue;
      }

      // Group data points by date
      const byDate = this.groupByDate(dataPoints);

      for (const [dateKey, points] of Object.entries(byDate)) {
        if (!dailySummaries[dateKey]) {
          dailySummaries[dateKey] = {};
        }

        const values = points
          .map((p) => parseFloat(p.value))
          .filter((v) => !isNaN(v));

        if (values.length === 0) continue;

        const summary = this.aggregateValues(values, strategy.aggregationType);
        dailySummaries[dateKey][metricKey] = summary;
      }
    }

    return dailySummaries;
  }

  /**
   * Group data points by date (YYYY-MM-DD)
   */
  private groupByDate(
    dataPoints: HealthDataPoint[],
  ): Record<string, HealthDataPoint[]> {
    const grouped: Record<string, HealthDataPoint[]> = {};

    for (const point of dataPoints) {
      const date = new Date(point.startDate);
      const dateKey = this.formatDateKey(date);

      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(point);
    }

    return grouped;
  }

  /**
   * Aggregate values based on strategy
   */
  private aggregateValues(
    values: number[],
    aggregationType: AggregationType,
  ): DailySummaryValue | number {
    if (values.length === 0) {
      return { count: 0 };
    }

    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    switch (aggregationType) {
      case "sum":
        return { total: Math.round(sum * 100) / 100, count: values.length };

      case "avg":
        return { avg: Math.round(avg * 100) / 100, count: values.length };

      case "avg_min_max":
        return {
          avg: Math.round(avg * 100) / 100,
          min: Math.round(min * 100) / 100,
          max: Math.round(max * 100) / 100,
          count: values.length,
        };

      case "latest":
        // For "latest", we just return the last value
        // In real usage, we'd sort by timestamp first
        return Math.round(values[values.length - 1] * 100) / 100;

      case "count":
        return { total: values.length, count: values.length };

      case "duration":
        // Duration metrics: sum the durations
        return { total: Math.round(sum * 100) / 100, count: values.length };

      default:
        return { avg: Math.round(avg * 100) / 100, count: values.length };
    }
  }

  /**
   * Special aggregation for sleep data
   * Note: Sleep is grouped by END date (when you wake up) since sleep spans midnight
   */
  private aggregateSleepData(
    dataPoints: HealthDataPoint[],
    dailySummaries: Record<string, DailySummary>,
  ): void {
    // Group by END date (when sleep session ends/you wake up)
    const byDate: Record<string, HealthDataPoint[]> = {};
    for (const point of dataPoints) {
      const date = new Date(point.endDate);
      const dateKey = this.formatDateKey(date);
      if (!byDate[dateKey]) {
        byDate[dateKey] = [];
      }
      byDate[dateKey].push(point);
    }

    for (const [dateKey, points] of Object.entries(byDate)) {
      if (!dailySummaries[dateKey]) {
        dailySummaries[dateKey] = {};
      }

      const sleepSummary: SleepSummary = {
        total: 0,
        inBed: 0,
        awake: 0,
        core: 0,
        deep: 0,
        rem: 0,
      };

      for (const point of points) {
        // Calculate duration in minutes
        const start = new Date(point.startDate).getTime();
        const end = new Date(point.endDate).getTime();
        const durationMin = (end - start) / (1000 * 60);

        // The value field contains the sleep stage
        const stage = point.value.toLowerCase();

        if (stage.includes("inbed") || stage === "0") {
          sleepSummary.inBed += durationMin;
        } else if (stage.includes("awake") || stage === "2") {
          sleepSummary.awake += durationMin;
        } else if (stage.includes("core") || stage === "3") {
          sleepSummary.core += durationMin;
          sleepSummary.total += durationMin;
        } else if (stage.includes("deep") || stage === "4") {
          sleepSummary.deep += durationMin;
          sleepSummary.total += durationMin;
        } else if (stage.includes("rem") || stage === "5") {
          sleepSummary.rem += durationMin;
          sleepSummary.total += durationMin;
        } else if (stage.includes("asleep") || stage === "1") {
          // Generic "asleep" goes to core
          sleepSummary.core += durationMin;
          sleepSummary.total += durationMin;
        }
      }

      // Calculate efficiency
      if (sleepSummary.inBed > 0) {
        sleepSummary.efficiency =
          Math.round((sleepSummary.total / sleepSummary.inBed) * 100) / 100;
      }

      // Round all values
      sleepSummary.total = Math.round(sleepSummary.total);
      sleepSummary.inBed = Math.round(sleepSummary.inBed);
      sleepSummary.awake = Math.round(sleepSummary.awake);
      sleepSummary.core = Math.round(sleepSummary.core);
      sleepSummary.deep = Math.round(sleepSummary.deep);
      sleepSummary.rem = Math.round(sleepSummary.rem);

      dailySummaries[dateKey]["sleep"] = sleepSummary;
    }
  }

  /**
   * Build manifest with completeness scoring
   */
  private buildManifest(
    allMetricsData: Record<string, HealthDataPoint[]>,
    dailySummaries: Record<string, DailySummary>,
  ): AppleHealthManifest {
    // Get all metric types present
    const metricsPresent = Object.keys(allMetricsData).filter(
      (k) => allMetricsData[k]?.length > 0,
    );

    // Calculate date range
    let minDate = new Date();
    let maxDate = new Date(0);
    let totalRecords = 0;
    let watchCount = 0;
    let phoneCount = 0;
    let otherCount = 0;

    for (const dataPoints of Object.values(allMetricsData)) {
      for (const point of dataPoints) {
        totalRecords++;

        const date = new Date(point.startDate);
        if (date < minDate) minDate = date;
        if (date > maxDate) maxDate = date;

        // Count sources (de-identified)
        const source = (point.source || point.device || "").toLowerCase();
        if (source.includes("watch")) {
          watchCount++;
        } else if (source.includes("iphone") || source.includes("phone")) {
          phoneCount++;
        } else {
          otherCount++;
        }
      }
    }

    // Calculate completeness
    const completeness = calculateAppleHealthCompleteness(
      metricsPresent,
      minDate,
      maxDate,
    );
    const tier = getAttestationTier(completeness);

    // Calculate source percentages
    const total = watchCount + phoneCount + otherCount || 1;

    return {
      version: 1,
      exportDate: new Date().toISOString().split("T")[0],
      uploadDate: new Date().toISOString(),
      dateRange: {
        start: this.formatDateKey(minDate),
        end: this.formatDateKey(maxDate),
      },
      metricsPresent: metricsPresent.map(normalizeMetricKey),
      completeness: {
        score: completeness.score,
        tier,
        coreComplete: completeness.coreComplete,
        daysCovered: Object.keys(dailySummaries).length,
        recordCount: totalRecords,
      },
      sources: {
        watch: Math.round((watchCount / total) * 100),
        phone: Math.round((phoneCount / total) * 100),
        other: Math.round((otherCount / total) * 100),
      },
    };
  }

  /**
   * Format date as YYYY-MM-DD
   */
  private formatDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  /**
   * Compute SHA256 hash of payload using Web Crypto API
   */
  private async computeContentHash(
    payload: AppleHealthStorjPayload,
  ): Promise<string> {
    const json = JSON.stringify(payload);
    const encoder = new TextEncoder();
    const data = encoder.encode(json);

    // Use Web Crypto API for browser compatibility
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return `0x${hashHex}`;
  }
}
