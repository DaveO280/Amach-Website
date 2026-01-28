/**
 * PreComputedMetrics - Generates metric summaries on data load
 *
 * Instead of requiring tool calls to query metrics, we pre-compute:
 * - 7/30/90 day summaries with avg, min, max, trend
 * - Comparison to user's historical baseline
 * - A prompt-ready text snippet
 *
 * This eliminates most tool calls, reducing round-trips to Venice API.
 */

import type { HealthDataByType } from "@/types/healthData";
import { DataHasher, type DataFingerprint } from "./DataHasher";
import { getFeatureFlags } from "@/config/featureFlags";

export interface MetricSummary {
  avg: number;
  min: number;
  max: number;
  count: number;
  trend: "improving" | "declining" | "stable";
  percentChange: number;
}

export interface BaselineComparison {
  percentChange: number;
  direction: "up" | "down" | "stable";
  significance: "significant" | "minor" | "none";
}

export interface PreComputedMetrics {
  dataFingerprint: DataFingerprint;
  computedAt: string;
  dateRange: { start: string; end: string };

  // Time-window summaries
  last7Days: Record<string, MetricSummary>;
  last30Days: Record<string, MetricSummary>;
  last90Days: Record<string, MetricSummary>;
  allTime: Record<string, MetricSummary>;

  // Comparison to baseline (all-time average)
  recentVsBaseline: Record<string, BaselineComparison>;

  // Ready-to-use prompt snippet (compact, <500 chars)
  promptSummary: string;

  // For debugging
  generationTimeMs: number;
}

// Metric display names for prompt
const METRIC_NAMES: Record<string, string> = {
  HKQuantityTypeIdentifierStepCount: "Steps",
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: "HRV",
  HKQuantityTypeIdentifierRestingHeartRate: "Resting HR",
  HKQuantityTypeIdentifierActiveEnergyBurned: "Active Energy",
  HKQuantityTypeIdentifierAppleExerciseTime: "Exercise",
  HKCategoryTypeIdentifierSleepAnalysis: "Sleep",
  HKQuantityTypeIdentifierHeartRate: "Heart Rate",
  HKQuantityTypeIdentifierRespiratoryRate: "Respiratory Rate",
  HKQuantityTypeIdentifierVO2Max: "VO2 Max",
};

// Metrics where higher values are worse (invert trend interpretation)
const HIGHER_IS_WORSE = new Set(["HKQuantityTypeIdentifierRestingHeartRate"]);

const STORAGE_KEY = "amach_precomputed_metrics";

export class PreComputedMetricsGenerator {
  /**
   * Generate pre-computed metrics from health data (instance method)
   */
  generate(data: HealthDataByType | undefined): PreComputedMetrics {
    return PreComputedMetricsGenerator.generate(data);
  }

  /**
   * Generate pre-computed metrics from health data
   */
  static generate(data: HealthDataByType | undefined): PreComputedMetrics {
    const startTime = performance.now();
    const flags = getFeatureFlags();

    const fingerprint = DataHasher.hashHealthData(data);

    if (!data || Object.keys(data).length === 0) {
      return {
        dataFingerprint: fingerprint,
        computedAt: new Date().toISOString(),
        dateRange: { start: "", end: "" },
        last7Days: {},
        last30Days: {},
        last90Days: {},
        allTime: {},
        recentVsBaseline: {},
        promptSummary: "No health data available.",
        generationTimeMs: performance.now() - startTime,
      };
    }

    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    const windows = {
      last7Days: now - 7 * day,
      last30Days: now - 30 * day,
      last90Days: now - 90 * day,
      allTime: 0,
    };

    const result: PreComputedMetrics = {
      dataFingerprint: fingerprint,
      computedAt: new Date().toISOString(),
      dateRange: this.getDateRange(data),
      last7Days: {},
      last30Days: {},
      last90Days: {},
      allTime: {},
      recentVsBaseline: {},
      promptSummary: "",
      generationTimeMs: 0,
    };

    // Compute summaries for each metric and time window
    for (const [metricType, points] of Object.entries(data)) {
      if (!points || !Array.isArray(points) || points.length === 0) continue;

      // Parse all values with timestamps
      const parsed: Array<{ value: number; timestamp: number }> = [];
      for (const point of points) {
        const value = parseFloat(point.value);
        const timestamp = new Date(point.startDate).getTime();
        if (!isNaN(value) && !isNaN(timestamp)) {
          parsed.push({ value, timestamp });
        }
      }

      if (parsed.length === 0) continue;

      // Sort by timestamp for trend calculation
      parsed.sort((a, b) => a.timestamp - b.timestamp);

      // Compute for each window
      for (const [windowName, windowStart] of Object.entries(windows)) {
        const filtered = parsed.filter((p) => p.timestamp >= windowStart);

        if (filtered.length > 0) {
          const values = filtered.map((p) => p.value);
          const summary = this.computeSummary(values, metricType);
          result[windowName as keyof typeof windows][metricType] = summary;
        }
      }

      // Compute recent vs baseline comparison
      const recent = result.last30Days[metricType];
      const baseline = result.allTime[metricType];

      if (recent && baseline && baseline.avg !== 0) {
        const change = ((recent.avg - baseline.avg) / baseline.avg) * 100;
        result.recentVsBaseline[metricType] = {
          percentChange: Math.round(change * 10) / 10,
          direction: change > 2 ? "up" : change < -2 ? "down" : "stable",
          significance:
            Math.abs(change) > 15
              ? "significant"
              : Math.abs(change) > 5
                ? "minor"
                : "none",
        };
      }
    }

    // Generate prompt-ready summary
    result.promptSummary = this.generatePromptSummary(result);
    result.generationTimeMs = performance.now() - startTime;

    if (flags.logMemoryOperations) {
      console.log("[PreComputedMetrics] Generated in", {
        timeMs: result.generationTimeMs.toFixed(1),
        metrics: Object.keys(result.last30Days).length,
        promptLength: result.promptSummary.length,
      });
    }

    return result;
  }

  /**
   * Compute summary statistics for a set of values
   */
  private static computeSummary(
    values: number[],
    metricType: string,
  ): MetricSummary {
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    // Trend detection: compare first half to second half
    const mid = Math.floor(values.length / 2);
    const firstHalf = values.slice(0, mid);
    const secondHalf = values.slice(mid);

    let trend: "improving" | "declining" | "stable" = "stable";
    let percentChange = 0;

    if (firstHalf.length > 0 && secondHalf.length > 0) {
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg =
        secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

      if (firstAvg !== 0) {
        percentChange = ((secondAvg - firstAvg) / firstAvg) * 100;
      }

      // Determine trend (accounting for metrics where higher is worse)
      const higherIsWorse = HIGHER_IS_WORSE.has(metricType);
      const significantChange = Math.abs(percentChange) > 5;

      if (significantChange) {
        if (percentChange > 0) {
          trend = higherIsWorse ? "declining" : "improving";
        } else {
          trend = higherIsWorse ? "improving" : "declining";
        }
      }
    }

    return {
      avg: Math.round(avg * 100) / 100,
      min: Math.round(min * 100) / 100,
      max: Math.round(max * 100) / 100,
      count: values.length,
      trend,
      percentChange: Math.round(percentChange * 10) / 10,
    };
  }

  /**
   * Generate a compact prompt-ready summary
   */
  private static generatePromptSummary(metrics: PreComputedMetrics): string {
    const lines: string[] = [];

    // Only include metrics with significant changes or notable values
    for (const [metricType, comparison] of Object.entries(
      metrics.recentVsBaseline,
    )) {
      // Skip if not significant
      if (comparison.significance === "none") continue;

      const name =
        METRIC_NAMES[metricType] ||
        metricType.split("Identifier")[1] ||
        metricType;
      const recent = metrics.last30Days[metricType];

      if (!recent) continue;

      const arrow =
        comparison.direction === "up"
          ? "↑"
          : comparison.direction === "down"
            ? "↓"
            : "→";
      const sign = comparison.percentChange > 0 ? "+" : "";

      lines.push(
        `${name}: ${recent.avg.toFixed(1)} (${arrow}${sign}${comparison.percentChange}% vs baseline, ${recent.trend})`,
      );
    }

    if (lines.length === 0) {
      // No significant changes, provide basic summary
      const metricCount = Object.keys(metrics.last30Days).length;
      if (metricCount > 0) {
        return `Tracking ${metricCount} health metrics. No significant changes from baseline in the last 30 days.`;
      }
      return "No health metrics available.";
    }

    return `Recent health summary (last 30 days vs baseline):\n${lines.join("\n")}`;
  }

  /**
   * Get date range from data
   */
  private static getDateRange(data: HealthDataByType): {
    start: string;
    end: string;
  } {
    let earliest = Infinity;
    let latest = -Infinity;

    for (const points of Object.values(data)) {
      if (!points || !Array.isArray(points)) continue;

      for (const point of points) {
        const ts = new Date(point.startDate).getTime();
        if (!isNaN(ts)) {
          if (ts < earliest) earliest = ts;
          if (ts > latest) latest = ts;
        }
      }
    }

    return {
      start:
        earliest === Infinity
          ? ""
          : new Date(earliest).toISOString().split("T")[0],
      end:
        latest === -Infinity
          ? ""
          : new Date(latest).toISOString().split("T")[0],
    };
  }

  /**
   * Store pre-computed metrics in localStorage
   */
  static store(metrics: PreComputedMetrics): void {
    if (typeof window === "undefined") return;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(metrics));
    } catch (error) {
      console.warn("[PreComputedMetrics] Failed to store:", error);
    }
  }

  /**
   * Load pre-computed metrics from localStorage
   */
  static load(): PreComputedMetrics | null {
    if (typeof window === "undefined") return null;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return null;
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }

  /**
   * Check if stored metrics are still valid for current data
   */
  static isValid(
    stored: PreComputedMetrics | null,
    currentFingerprint: DataFingerprint,
  ): boolean {
    if (!stored) return false;
    return DataHasher.fingerprintsMatch(
      stored.dataFingerprint,
      currentFingerprint,
    );
  }

  /**
   * Get or generate pre-computed metrics
   * Uses cached version if data hasn't changed
   */
  static getOrGenerate(data: HealthDataByType | undefined): PreComputedMetrics {
    const fingerprint = DataHasher.hashHealthData(data);
    const stored = this.load();

    if (this.isValid(stored, fingerprint)) {
      const flags = getFeatureFlags();
      if (flags.logCacheHits) {
        console.log("[PreComputedMetrics] Using cached metrics");
      }
      return stored!;
    }

    const generated = this.generate(data);
    this.store(generated);
    return generated;
  }
}
