/**
 * AppleHealthStorjService
 *
 * Handles the complete flow of:
 * 1. Aggregating ALL Apple Health metrics into daily summaries
 * 2. De-identifying the data
 * 3. Building a manifest with completeness scoring
 * 4. Encrypting and uploading to Storj (via API route)
 * 5. Creating on-chain attestation
 */

import type { HealthDataPoint } from "@/types/healthData";
import type { WalletEncryptionKey } from "@/utils/walletEncryption";
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
  constructor() {
    // No dependencies - uses API route for Storj operations
  }

  /**
   * Main entry point: Process health data and save to Storj (incremental).
   *
   * On successive uploads the service fetches the existing Storj payload,
   * merges new daily summaries into it (new data wins for the same day),
   * and overwrites the previous object so only one copy exists.
   */
  async saveToStorj(
    allMetricsData: Record<string, HealthDataPoint[]>,
    walletKey: WalletEncryptionKey,
    onProgress?: (progress: number, message: string) => void,
  ): Promise<AppleHealthStorjResult> {
    try {
      onProgress?.(5, "Checking for existing Storj data...");

      // 1. Look for a previous apple-health export on Storj
      const existing = await this.fetchExistingPayload(walletKey);

      onProgress?.(15, "Aggregating daily summaries...");

      // 2. Build daily summaries from the new upload
      const newDailySummaries = this.buildDailySummaries(allMetricsData);

      // 3. Merge with existing summaries (new data wins per day+metric)
      const mergedSummaries = existing
        ? this.mergeDailySummaries(
            existing.payload.dailySummaries,
            newDailySummaries,
          )
        : newDailySummaries;

      onProgress?.(40, "De-identifying data...");

      // 4. De-identify (already done during aggregation - no device names)

      onProgress?.(55, "Calculating completeness...");

      // 5. Build manifest over the full merged dataset
      const manifest = this.buildManifestFromSummaries(
        allMetricsData,
        mergedSummaries,
        existing?.payload.manifest,
      );

      onProgress?.(65, "Preparing payload...");

      // 6. Create payload
      const payload: AppleHealthStorjPayload = {
        manifest,
        dailySummaries: mergedSummaries,
      };

      onProgress?.(75, "Encrypting and uploading...");

      // 7. Calculate content hash before encryption
      const contentHash = await this.computeContentHash(payload);

      // 8. Save/update to Storj via API route
      const isUpdate = !!existing?.storjUri;
      const response = await fetch("/api/storj", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: isUpdate ? "storage/update" : "storage/store",
          userAddress: walletKey.walletAddress,
          encryptionKey: walletKey,
          data: payload,
          dataType: "apple-health-full-export",
          ...(isUpdate && { oldStorjUri: existing.storjUri }),
          options: {
            metadata: {
              version: "1",
              dateRange: `${manifest.dateRange.start}_${manifest.dateRange.end}`,
              metricsCount: String(manifest.metricsPresent.length),
              completenessScore: String(manifest.completeness.score),
              tier: manifest.completeness.tier,
            },
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `API request failed: ${response.status}`,
        );
      }

      const apiResult = await response.json();
      if (!apiResult.success || !apiResult.result?.storjUri) {
        throw new Error(
          apiResult.error ||
            apiResult.result?.error ||
            "Failed to save to Storj",
        );
      }

      onProgress?.(100, "Complete!");

      return {
        success: true,
        storjUri: apiResult.result.storjUri,
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
   * Fetch the most recent apple-health-full-export from Storj (if any).
   * Returns the payload and its URI so we can merge and update in-place.
   */
  private async fetchExistingPayload(walletKey: WalletEncryptionKey): Promise<{
    payload: AppleHealthStorjPayload;
    storjUri: string;
  } | null> {
    try {
      // List all apple-health exports for this user
      const listResponse = await fetch("/api/storj", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "storage/list",
          userAddress: walletKey.walletAddress,
          encryptionKey: walletKey,
          dataType: "apple-health-full-export",
        }),
      });

      if (!listResponse.ok) return null;

      const listResult = await listResponse.json();
      const items = listResult?.result as
        | Array<{ uri: string; uploadedAt: number }>
        | undefined;

      if (!items || items.length === 0) return null;

      // Pick the most recent export
      const latest = items.reduce((a, b) =>
        (a.uploadedAt || 0) > (b.uploadedAt || 0) ? a : b,
      );

      // Retrieve and decrypt it
      const retrieveResponse = await fetch("/api/storj", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "storage/retrieve",
          userAddress: walletKey.walletAddress,
          encryptionKey: walletKey,
          storjUri: latest.uri,
        }),
      });

      if (!retrieveResponse.ok) return null;

      const retrieveResult = await retrieveResponse.json();
      const payload = retrieveResult?.result?.data as
        | AppleHealthStorjPayload
        | undefined;

      if (
        !payload ||
        !payload.dailySummaries ||
        typeof payload.dailySummaries !== "object"
      ) {
        return null;
      }

      return { payload, storjUri: latest.uri };
    } catch (error) {
      console.warn(
        "[AppleHealthStorjService] Could not fetch existing Storj data, will create new:",
        error,
      );
      return null;
    }
  }

  /**
   * Merge two sets of daily summaries. For each day, metrics from `newer`
   * overwrite those in `existing`, but metrics only present in `existing`
   * are preserved. This ensures successive uploads build on prior data.
   */
  mergeDailySummaries(
    existing: Record<string, DailySummary>,
    newer: Record<string, DailySummary>,
  ): Record<string, DailySummary> {
    const merged: Record<string, DailySummary> = {};

    // Start with all existing days
    for (const [dateKey, summary] of Object.entries(existing)) {
      merged[dateKey] = { ...summary };
    }

    // Layer new data on top - new values win per metric within a day
    for (const [dateKey, newSummary] of Object.entries(newer)) {
      if (!merged[dateKey]) {
        merged[dateKey] = { ...newSummary };
      } else {
        for (const [metricKey, value] of Object.entries(newSummary)) {
          merged[dateKey][metricKey] = value;
        }
      }
    }

    return merged;
  }

  /**
   * Build manifest that accounts for both new raw data and merged summaries.
   * Extends date range and metrics list from a previous manifest if available.
   */
  private buildManifestFromSummaries(
    newMetricsData: Record<string, HealthDataPoint[]>,
    mergedSummaries: Record<string, DailySummary>,
    previousManifest?: AppleHealthManifest,
  ): AppleHealthManifest {
    // Get metrics present across merged summaries
    const metricsInSummaries = new Set<string>();
    for (const summary of Object.values(mergedSummaries)) {
      for (const key of Object.keys(summary)) {
        metricsInSummaries.add(key);
      }
    }

    // Also include raw metric keys from the new upload
    const rawMetricKeys = Object.keys(newMetricsData)
      .filter((k) => newMetricsData[k]?.length > 0)
      .map(normalizeMetricKey);
    for (const k of rawMetricKeys) {
      metricsInSummaries.add(k);
    }

    // Preserve any metrics from the previous manifest
    if (previousManifest) {
      for (const k of previousManifest.metricsPresent) {
        metricsInSummaries.add(k);
      }
    }

    // Date range from merged summaries
    const dateKeys = Object.keys(mergedSummaries).sort();
    const startDate = dateKeys[0] || new Date().toISOString().split("T")[0];
    const endDate =
      dateKeys[dateKeys.length - 1] || new Date().toISOString().split("T")[0];

    // Count sources from the new data
    let totalRecords = 0;
    let watchCount = 0;
    let phoneCount = 0;
    let otherCount = 0;

    for (const dataPoints of Object.values(newMetricsData)) {
      for (const point of dataPoints) {
        totalRecords++;
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

    // Use previous source ratios if no new data (shouldn't happen, but safe)
    const total = watchCount + phoneCount + otherCount || 1;

    // Calculate completeness over the merged date range
    const completeness = calculateAppleHealthCompleteness(
      Array.from(metricsInSummaries),
      new Date(startDate),
      new Date(endDate),
    );
    const tier = getAttestationTier(completeness);

    return {
      version: 1,
      exportDate: new Date().toISOString().split("T")[0],
      uploadDate: new Date().toISOString(),
      dateRange: { start: startDate, end: endDate },
      metricsPresent: Array.from(metricsInSummaries),
      completeness: {
        score: completeness.score,
        tier,
        coreComplete: completeness.coreComplete,
        daysCovered: dateKeys.length,
        recordCount:
          totalRecords + (previousManifest?.completeness.recordCount || 0),
      },
      sources: {
        watch: Math.round((watchCount / total) * 100),
        phone: Math.round((phoneCount / total) * 100),
        other: Math.round((otherCount / total) * 100),
      },
    };
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
