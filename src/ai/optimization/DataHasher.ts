/**
 * DataHasher - Generates fingerprints for health data to enable smart cache invalidation
 *
 * Instead of time-based cache expiration (15 min TTL), we use data-hash invalidation:
 * - Cache remains valid as long as the underlying data hasn't changed
 * - New data upload triggers hash change -> cache invalidation
 * - Much more efficient for users who don't upload data frequently
 */

import type { HealthDataByType } from "@/types/healthData";

export interface DataFingerprint {
  hash: string;
  metricTypes: string[];
  totalDataPoints: number;
  latestTimestamp: number;
  earliestTimestamp: number;
  computedAt: number;
}

export class DataHasher {
  /**
   * Generate a fingerprint of health data for cache invalidation (instance method).
   */
  generateFingerprint(data: HealthDataByType | undefined): DataFingerprint {
    return DataHasher.hashHealthData(data);
  }

  /**
   * Generate a fingerprint of health data for cache invalidation.
   *
   * The hash changes when:
   * - New data points are added
   * - Data points are deleted
   * - Metric types change
   *
   * The hash does NOT change when:
   * - Same data is re-processed
   * - User interacts with chat (data unchanged)
   */
  static hashHealthData(data: HealthDataByType | undefined): DataFingerprint {
    if (!data || Object.keys(data).length === 0) {
      return {
        hash: "empty",
        metricTypes: [],
        totalDataPoints: 0,
        latestTimestamp: 0,
        earliestTimestamp: 0,
        computedAt: Date.now(),
      };
    }

    const metricTypes = Object.keys(data).sort();
    let totalDataPoints = 0;
    let latestTimestamp = 0;
    let earliestTimestamp = Infinity;

    // Build a summary that captures data shape without processing all values
    const summary: Record<string, { count: number; latest: number }> = {};

    for (const metricType of metricTypes) {
      const points = data[metricType];
      if (!points || !Array.isArray(points)) continue;

      const count = points.length;
      totalDataPoints += count;

      // Find latest timestamp for this metric type
      let metricLatest = 0;
      let metricEarliest = Infinity;

      for (const point of points) {
        const ts = new Date(point.startDate).getTime();
        if (!isNaN(ts)) {
          if (ts > metricLatest) metricLatest = ts;
          if (ts < metricEarliest) metricEarliest = ts;
          if (ts > latestTimestamp) latestTimestamp = ts;
          if (ts < earliestTimestamp) earliestTimestamp = ts;
        }
      }

      summary[metricType] = { count, latest: metricLatest };
    }

    // Generate hash from summary
    const hashInput = JSON.stringify({
      types: metricTypes,
      summary,
      total: totalDataPoints,
    });

    const hash = this.simpleHash(hashInput);

    return {
      hash,
      metricTypes,
      totalDataPoints,
      latestTimestamp,
      earliestTimestamp: earliestTimestamp === Infinity ? 0 : earliestTimestamp,
      computedAt: Date.now(),
    };
  }

  /**
   * Simple hash function for fingerprinting (not cryptographic)
   * Uses djb2 algorithm - fast and good distribution
   */
  private static simpleHash(str: string): string {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) + hash + char; // hash * 33 + char
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Check if two fingerprints represent the same data
   */
  static fingerprintsMatch(a: DataFingerprint, b: DataFingerprint): boolean {
    return a.hash === b.hash;
  }

  /**
   * Check if data has changed since a fingerprint was computed
   */
  static hasDataChanged(
    currentData: HealthDataByType | undefined,
    previousFingerprint: DataFingerprint,
  ): boolean {
    const currentFingerprint = this.hashHealthData(currentData);
    return !this.fingerprintsMatch(currentFingerprint, previousFingerprint);
  }

  /**
   * Get a human-readable summary of the fingerprint
   */
  static summarizeFingerprint(fingerprint: DataFingerprint): string {
    if (fingerprint.hash === "empty") {
      return "No data";
    }

    const daysCovered =
      fingerprint.latestTimestamp && fingerprint.earliestTimestamp
        ? Math.ceil(
            (fingerprint.latestTimestamp - fingerprint.earliestTimestamp) /
              (24 * 60 * 60 * 1000),
          )
        : 0;

    return `${fingerprint.totalDataPoints} points across ${fingerprint.metricTypes.length} metrics (${daysCovered} days)`;
  }
}
