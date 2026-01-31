/**
 * Centralized Health Data Processor
 *
 * This class is responsible for:
 * 1. Processing raw Apple Health XML data
 * 2. Aggregating cumulative metrics correctly (sum by day)
 * 3. Processing sleep data into daily summaries
 * 4. Storing pre-aggregated data in IndexedDB
 * 5. Providing clean getter APIs for all consumers:
 *    - Health score calculator
 *    - Visualizations
 *    - AI agents (with tiered aggregation)
 *    - Reports
 *
 * This ensures data is processed once at the source, eliminating
 * scattered aggregation bugs across multiple files.
 */

import type { MetricSample } from "@/agents/types";
import type { HealthDataPoint, HealthDataByType } from "@/types/healthData";
import {
  processSleepData,
  type DailyProcessedSleepData,
} from "@/utils/sleepDataProcessor";
import {
  applyTieredAggregation,
  aggregateSamplesByDay,
  aggregateDailyValues,
  isCumulativeMetric,
} from "@/utils/tieredDataAggregation";

/**
 * Extract date key (YYYY-MM-DD) from a Date or timestamp
 */
function extractDateKey(timestamp: Date | number): string {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Deduplicate samples by date, aggregating values within each date
 */
function deduplicateSamplesByDate(
  samples: MetricSample[],
  isCumulative: boolean,
): MetricSample[] {
  const samplesByDate = new Map<string, MetricSample[]>();

  // Group samples by date
  for (const sample of samples) {
    const dateKey = extractDateKey(sample.timestamp);
    if (!samplesByDate.has(dateKey)) {
      samplesByDate.set(dateKey, []);
    }
    samplesByDate.get(dateKey)!.push(sample);
  }

  // Aggregate samples within each date
  const deduplicated: MetricSample[] = [];
  for (const [, dateSamples] of samplesByDate.entries()) {
    if (dateSamples.length === 0) continue;

    // If multiple samples for same date, aggregate them
    if (dateSamples.length > 1) {
      const values = dateSamples.map((s) => s.value).filter(Number.isFinite);
      if (values.length === 0) continue;

      const aggregatedValue = isCumulative
        ? values.reduce((sum, v) => sum + v, 0)
        : values.reduce((sum, v) => sum + v, 0) / values.length;

      // Use the most recent sample's timestamp and metadata
      const sortedByTime = dateSamples.sort(
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
      );

      deduplicated.push({
        timestamp: sortedByTime[0].timestamp,
        value: aggregatedValue,
        unit: sortedByTime[0].unit,
        metadata: sortedByTime[0].metadata,
      });
    } else {
      // Single sample for this date
      deduplicated.push(dateSamples[0]);
    }
  }

  return deduplicated;
}
import { healthDataStore } from "@/data/store/healthDataStore";

// ============================================================================
// Types
// ============================================================================

export interface AggregatedMetricData {
  metricType: string;
  dailyData: Map<string, MetricSample>; // YYYY-MM-DD -> daily aggregate
  rawData: HealthDataPoint[]; // Original raw data for reference
  lastUpdated: Date;
}

export interface ProcessedHealthData {
  // Raw data as imported from XML
  rawData: HealthDataByType;

  // Daily aggregated data (cumulative metrics summed by day, others averaged)
  dailyAggregates: Record<string, Map<string, MetricSample>>;

  // Processed sleep data
  sleepData: DailyProcessedSleepData[];

  // Metadata
  dateRange: {
    start: Date;
    end: Date;
  };
  lastUpdated: Date;
}

export interface GetDataOptions {
  // Time window
  startDate?: Date;
  endDate?: Date;

  // For AI agents: apply tiered aggregation
  tieredAggregation?: boolean;

  // For visualizations: get raw or daily aggregates
  aggregationLevel?: "raw" | "daily" | "weekly" | "monthly";
}

// ============================================================================
// Health Data Processor
// ============================================================================

export class HealthDataProcessor {
  private processedData: ProcessedHealthData | null = null;

  /**
   * Process raw health data from XML parser
   * This is the main entry point for data ingestion
   */
  async processRawData(
    rawData: HealthDataByType,
    persistToDb = true,
  ): Promise<void> {
    console.log("[HealthDataProcessor] Processing raw health data...");
    console.log("[HealthDataProcessor] Metrics:", Object.keys(rawData));

    const startTime = Date.now();

    // Calculate date range
    const dateRange = this.calculateDateRange(rawData);
    console.log(
      `[HealthDataProcessor] Date range: ${dateRange.start.toISOString().split("T")[0]} to ${dateRange.end.toISOString().split("T")[0]}`,
    );

    // Process each metric type
    const dailyAggregates: Record<string, Map<string, MetricSample>> = {};

    for (const [metricType, dataPoints] of Object.entries(rawData)) {
      if (metricType === "HKCategoryTypeIdentifierSleepAnalysis") {
        // Sleep is handled separately
        continue;
      }

      console.log(
        `[HealthDataProcessor] Processing ${metricType}: ${dataPoints.length} raw records`,
      );

      // Convert to MetricSample format
      const samples: MetricSample[] = dataPoints
        .map((point) => ({
          timestamp: new Date(point.startDate),
          value: parseFloat(point.value),
          unit: point.unit,
          metadata: {
            source: point.source,
            device: point.device,
            type: point.type,
            endDate: point.endDate,
          },
        }))
        .filter((s) => !isNaN(s.value) && !isNaN(s.timestamp.getTime()));

      if (samples.length === 0) {
        console.log(`[HealthDataProcessor] No valid samples for ${metricType}`);
        continue;
      }

      // Aggregate by day
      const isCumulative = isCumulativeMetric(metricType);
      const dailyGroups = aggregateSamplesByDay(samples);
      const dailyData = aggregateDailyValues(dailyGroups, isCumulative);

      dailyAggregates[metricType] = dailyData;

      console.log(
        `[HealthDataProcessor] ${metricType}: ${samples.length} raw → ${dailyData.size} daily aggregates (${isCumulative ? "SUM" : "AVG"})`,
      );
    }

    // Process sleep data
    let sleepData: DailyProcessedSleepData[] = [];
    if (rawData["HKCategoryTypeIdentifierSleepAnalysis"]) {
      console.log("[HealthDataProcessor] Processing sleep data...");
      sleepData = processSleepData(
        rawData["HKCategoryTypeIdentifierSleepAnalysis"],
      );
      console.log(
        `[HealthDataProcessor] Sleep: ${rawData["HKCategoryTypeIdentifierSleepAnalysis"].length} raw records → ${sleepData.length} daily summaries`,
      );
    }

    // Store processed data in memory
    this.processedData = {
      rawData,
      dailyAggregates,
      sleepData,
      dateRange,
      lastUpdated: new Date(),
    };

    // Persist to IndexedDB
    if (persistToDb) {
      try {
        // Extract raw heart rate samples for zone calculations
        // Store full dataset, not just 180 days
        const rawHeartRateSamples = rawData[
          "HKQuantityTypeIdentifierHeartRate"
        ]?.map((point) => ({
          startDate: point.startDate,
          value: point.value,
          unit: point.unit || "",
          source: point.source,
          device: point.device,
          type: point.type,
          endDate: point.endDate,
        }));

        await healthDataStore.saveProcessedData({
          dailyAggregates: dailyAggregates as Record<
            string,
            Map<string, unknown>
          >,
          sleepData,
          rawHeartRateSamples,
          dateRange,
        });
        console.log(
          `[HealthDataProcessor] Persisted processed data to IndexedDB (${rawHeartRateSamples?.length || 0} heart rate samples)`,
        );
      } catch (error) {
        console.error(
          "[HealthDataProcessor] Failed to persist to IndexedDB:",
          error,
        );
      }
    }

    const processingTime = Date.now() - startTime;
    console.log(
      `[HealthDataProcessor] Processing complete in ${processingTime}ms`,
    );
  }

  /**
   * Load processed data from IndexedDB
   * Call this on app startup to restore previously processed data
   */
  async loadFromDb(): Promise<boolean> {
    try {
      const stored = await healthDataStore.getProcessedData();

      if (!stored) {
        console.log("[HealthDataProcessor] No processed data in IndexedDB");
        return false;
      }

      console.log(
        "[HealthDataProcessor] Loading processed data from IndexedDB...",
      );

      // Reconstruct processedData from stored data
      // Note: rawData is not stored, only aggregates
      this.processedData = {
        rawData: {}, // Raw data not persisted to save space
        dailyAggregates: stored.dailyAggregates as Record<
          string,
          Map<string, MetricSample>
        >,
        sleepData: stored.sleepData as DailyProcessedSleepData[],
        dateRange: stored.dateRange,
        lastUpdated: stored.lastUpdated,
      };

      console.log("[HealthDataProcessor] Loaded processed data:", {
        metrics: Object.keys(stored.dailyAggregates),
        sleepDays: stored.sleepData.length,
        dateRange: `${stored.dateRange.start.toISOString().split("T")[0]} to ${stored.dateRange.end.toISOString().split("T")[0]}`,
      });

      return true;
    } catch (error) {
      console.error(
        "[HealthDataProcessor] Failed to load from IndexedDB:",
        error,
      );
      return false;
    }
  }

  /**
   * Get data for health score calculation
   * Returns daily aggregates for all metrics
   */
  getDataForHealthScores(options: GetDataOptions = {}): HealthDataByType {
    if (!this.processedData) {
      return {};
    }

    const result: HealthDataByType = {};
    const { startDate, endDate } = options;

    // Convert daily aggregates back to HealthDataPoint format
    for (const [metricType, dailyData] of Object.entries(
      this.processedData.dailyAggregates,
    )) {
      const points: HealthDataPoint[] = [];

      for (const [, sample] of dailyData.entries()) {
        // Filter by date range if specified
        if (startDate && sample.timestamp < startDate) continue;
        if (endDate && sample.timestamp > endDate) continue;

        points.push({
          startDate: sample.timestamp.toISOString(),
          endDate:
            (sample.metadata?.endDate as string) ||
            sample.timestamp.toISOString(),
          value: sample.value.toString(),
          unit: sample.unit,
          source: (sample.metadata?.source as string) || "",
          device: (sample.metadata?.device as string) || "",
          type: metricType,
        });
      }

      if (points.length > 0) {
        result[metricType] = points;
      }
    }

    // Add sleep data
    if (this.processedData.sleepData.length > 0) {
      const sleepPoints: HealthDataPoint[] = this.processedData.sleepData
        .filter((day) => {
          const dayDate = new Date(day.date);
          if (startDate && dayDate < startDate) return false;
          if (endDate && dayDate > endDate) return false;
          return true;
        })
        .flatMap((day) =>
          day.sessions.map((session) => ({
            startDate: session.startTime,
            endDate: session.endTime,
            value: session.sleepDuration.toString(),
            unit: "min",
            source: "Apple Health",
            device: "",
            type: "HKCategoryTypeIdentifierSleepAnalysis",
          })),
        );

      if (sleepPoints.length > 0) {
        result["HKCategoryTypeIdentifierSleepAnalysis"] = sleepPoints;
      }
    }

    return result;
  }

  /**
   * Get data for visualizations
   * Can return raw, daily, weekly, or monthly aggregates
   * Note: For heart rate, use getRawHeartRateSamples() directly for async loading
   */
  getDataForVisualization(
    metricType: string,
    options: GetDataOptions = {},
  ): MetricSample[] {
    if (!this.processedData) {
      return [];
    }

    const { startDate, endDate, aggregationLevel = "daily" } = options;

    // Special handling for sleep
    if (metricType === "HKCategoryTypeIdentifierSleepAnalysis") {
      return this.processedData.sleepData
        .filter((day) => {
          const dayDate = new Date(day.date);
          if (startDate && dayDate < startDate) return false;
          if (endDate && dayDate > endDate) return false;
          return true;
        })
        .map((day) => ({
          timestamp: new Date(day.date),
          value: day.sleepDuration * 60, // Convert minutes to seconds for consistency
          unit: "s",
          metadata: {
            efficiency: day.metrics.sleepEfficiency,
            totalDuration: day.totalDuration,
            stages: day.stageData,
          },
        }));
    }

    // Special handling: Heart rate needs raw samples for zone calculations
    // This is handled separately in HealthDashboard via getRawHeartRateSamples()
    // to support async loading from IndexedDB
    if (metricType === "HKQuantityTypeIdentifierHeartRate") {
      // Return empty - should use getRawHeartRateSamples() directly
      return [];
    }

    const dailyData = this.processedData.dailyAggregates[metricType];
    if (!dailyData) {
      return [];
    }

    // Filter by date range
    const filteredSamples: MetricSample[] = [];
    for (const [, sample] of dailyData.entries()) {
      if (startDate && sample.timestamp < startDate) continue;
      if (endDate && sample.timestamp > endDate) continue;
      filteredSamples.push(sample);
    }

    // Return based on aggregation level
    if (aggregationLevel === "daily") {
      return filteredSamples.sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
      );
    }

    // For weekly/monthly, apply tiered aggregation
    // (This would use existing tieredDataAggregation utilities)
    // For now, return daily data
    return filteredSamples.sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );
  }

  /**
   * Get data for AI agents with tiered aggregation
   * This provides optimal context window usage
   */
  async getDataForAIAgents(
    options: GetDataOptions = {},
  ): Promise<Record<string, MetricSample[]>> {
    if (!this.processedData) {
      return {};
    }

    const result: Record<string, MetricSample[]> = {};
    const { tieredAggregation = false } = options;

    // Process each metric
    for (const [metricType, dailyData] of Object.entries(
      this.processedData.dailyAggregates,
    )) {
      // Special handling: Heart rate needs raw samples for zone calculations
      if (metricType === "HKQuantityTypeIdentifierHeartRate") {
        const rawHeartRate = await this.getRawHeartRateSamples(options);
        if (rawHeartRate.length > 0) {
          result[metricType] = rawHeartRate;
          console.log(
            `[HealthDataProcessor] ${metricType}: ${rawHeartRate.length} raw samples (for zone calculations)`,
          );
        }
        continue;
      }

      const samples = Array.from(dailyData.values());

      if (tieredAggregation) {
        // Apply tiered aggregation: 30d daily, 150d weekly, rest monthly
        const tieredSamples = applyTieredAggregation(samples, metricType);

        // Final deduplication pass after tiered aggregation
        const deduplicated = deduplicateSamplesByDate(
          tieredSamples,
          isCumulativeMetric(metricType),
        );

        result[metricType] = deduplicated;

        console.log(
          `[HealthDataProcessor] ${metricType}: ${samples.length} daily → ${tieredSamples.length} tiered → ${deduplicated.length} deduplicated`,
        );
      } else {
        // Return daily aggregates (already deduplicated by date from Map)
        // But add final safety check
        const deduplicated = deduplicateSamplesByDate(
          samples,
          isCumulativeMetric(metricType),
        );

        result[metricType] = deduplicated.sort(
          (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
        );

        if (deduplicated.length !== samples.length) {
          console.log(
            `[HealthDataProcessor] ${metricType}: Deduplicated ${samples.length} → ${deduplicated.length} unique dates`,
          );
        }
      }
    }

    // Add sleep data
    if (this.processedData.sleepData.length > 0) {
      const sleepSamples: MetricSample[] = this.processedData.sleepData.map(
        (day) => ({
          timestamp: new Date(day.date),
          value: day.sleepDuration * 60, // Convert minutes to seconds for agents
          unit: "s",
          metadata: {
            efficiency: day.metrics.sleepEfficiency,
            totalDuration: day.totalDuration,
            stages: day.stageData,
            date: day.date,
          },
        }),
      );

      // Deduplicate sleep samples by date (should already be deduplicated, but safety check)
      const deduplicatedSleep = deduplicateSamplesByDate(sleepSamples, false);

      if (tieredAggregation) {
        const tieredSleep = applyTieredAggregation(
          deduplicatedSleep,
          "HKCategoryTypeIdentifierSleepAnalysis",
        );

        // Final deduplication pass after tiered aggregation
        result["HKCategoryTypeIdentifierSleepAnalysis"] =
          deduplicateSamplesByDate(tieredSleep, false);
      } else {
        result["HKCategoryTypeIdentifierSleepAnalysis"] = deduplicatedSleep;
      }

      if (deduplicatedSleep.length !== sleepSamples.length) {
        console.log(
          `[HealthDataProcessor] Sleep: Deduplicated ${sleepSamples.length} → ${deduplicatedSleep.length} unique dates`,
        );
      }
    }

    return result;
  }

  /**
   * Get sleep data in processed format
   */
  getSleepData(options: GetDataOptions = {}): DailyProcessedSleepData[] {
    if (!this.processedData) {
      return [];
    }

    const { startDate, endDate } = options;

    return this.processedData.sleepData.filter((day) => {
      const dayDate = new Date(day.date);
      if (startDate && dayDate < startDate) return false;
      if (endDate && dayDate > endDate) return false;
      return true;
    });
  }

  /**
   * Get raw heart rate samples for zone calculations
   * Heart rate zones need individual readings, not daily averages
   * If rawData is not available (e.g., loaded from IndexedDB), loads from IndexedDB
   */
  async getRawHeartRateSamples(
    options: GetDataOptions = {},
  ): Promise<MetricSample[]> {
    const { startDate, endDate } = options;

    // First, try to get from in-memory processedData
    let heartRateData: HealthDataPoint[] | undefined;
    if (this.processedData?.rawData) {
      heartRateData =
        this.processedData.rawData["HKQuantityTypeIdentifierHeartRate"];
    }

    // If not available in memory, load from IndexedDB (may be trimmed to 180 days)
    if (!heartRateData || heartRateData.length === 0) {
      try {
        const rawData = await healthDataStore.getHealthData();
        heartRateData = rawData?.["HKQuantityTypeIdentifierHeartRate"] as
          | HealthDataPoint[]
          | undefined;
      } catch (error) {
        console.error(
          "[HealthDataProcessor] Failed to load raw heart rate from IndexedDB:",
          error,
        );
      }
    }

    if (!heartRateData || heartRateData.length === 0) {
      return [];
    }

    // Convert raw data points to MetricSample format
    const samples: MetricSample[] = heartRateData
      .map((point) => ({
        timestamp: new Date(point.startDate),
        value: parseFloat(point.value),
        unit: point.unit,
        metadata: {
          source: point.source,
          device: point.device,
          type: point.type,
          endDate: point.endDate,
        },
      }))
      .filter((s) => {
        // Filter out invalid samples
        if (isNaN(s.value) || isNaN(s.timestamp.getTime())) return false;

        // Filter by date range if specified
        if (startDate && s.timestamp < startDate) return false;
        if (endDate && s.timestamp > endDate) return false;

        return true;
      })
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return samples;
  }

  /**
   * Get data with historical context for AI agents
   * Returns both full historical data and recent detailed data
   */
  async getDataWithHistoricalContext(
    metricType: string,
    recentDays: number = 60,
  ): Promise<{
    historical: MetricSample[];
    recent: MetricSample[];
  }> {
    if (!this.processedData) {
      return { historical: [], recent: [] };
    }

    // Special handling for sleep
    if (metricType === "HKCategoryTypeIdentifierSleepAnalysis") {
      const now = new Date();
      const recentStart = new Date(
        now.getTime() - recentDays * 24 * 60 * 60 * 1000,
      );

      const allSleep = this.processedData.sleepData.map((day) => ({
        timestamp: new Date(day.date),
        value: day.sleepDuration * 60, // Convert minutes to seconds
        unit: "s" as const,
        metadata: {
          efficiency: day.metrics.sleepEfficiency,
          totalDuration: day.totalDuration,
          stages: day.stageData,
          date: day.date,
        },
      }));

      return {
        historical: allSleep,
        recent: allSleep.filter((s) => s.timestamp >= recentStart),
      };
    }

    // Special handling for heart rate (needs raw samples)
    if (metricType === "HKQuantityTypeIdentifierHeartRate") {
      const now = new Date();
      const recentStart = new Date(
        now.getTime() - recentDays * 24 * 60 * 60 * 1000,
      );
      const allSamples = await this.getRawHeartRateSamples();

      return {
        historical: allSamples,
        recent: allSamples.filter((s) => s.timestamp >= recentStart),
      };
    }

    // For other metrics, use daily aggregates
    const dailyData = this.processedData.dailyAggregates[metricType];
    if (!dailyData) {
      return { historical: [], recent: [] };
    }

    const now = new Date();
    const recentStart = new Date(
      now.getTime() - recentDays * 24 * 60 * 60 * 1000,
    );

    const allSamples = Array.from(dailyData.values()).sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );

    return {
      historical: allSamples,
      recent: allSamples.filter((s) => s.timestamp >= recentStart),
    };
  }

  /**
   * Get date range of processed data
   */
  getDateRange(): { start: Date; end: Date } | null {
    return this.processedData?.dateRange || null;
  }

  /**
   * Get last updated timestamp
   */
  getLastUpdated(): Date | null {
    return this.processedData?.lastUpdated || null;
  }

  /**
   * Check if data has been processed
   */
  hasData(): boolean {
    return this.processedData !== null;
  }

  /**
   * Clear processed data
   */
  clear(): void {
    this.processedData = null;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private calculateDateRange(rawData: HealthDataByType): {
    start: Date;
    end: Date;
  } {
    let earliest: number | null = null;
    let latest: number | null = null;

    for (const dataPoints of Object.values(rawData)) {
      for (const point of dataPoints) {
        const timestamp = new Date(point.startDate).getTime();
        if (isNaN(timestamp)) continue;

        if (earliest === null || timestamp < earliest) {
          earliest = timestamp;
        }
        if (latest === null || timestamp > latest) {
          latest = timestamp;
        }
      }
    }

    const now = Date.now();
    return {
      start:
        earliest !== null
          ? new Date(earliest)
          : new Date(now - 90 * 24 * 60 * 60 * 1000),
      end: latest !== null ? new Date(latest) : new Date(now),
    };
  }
}

// Export singleton instance
export const healthDataProcessor = new HealthDataProcessor();
