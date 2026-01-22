/**
 * Quarterly Health Aggregation Service
 *
 * Generates comprehensive quarterly health summaries with:
 * - Min/Max/Avg/Median/StdDev for all metrics
 * - Trend analysis (increasing/decreasing/stable)
 * - Percentiles (25th, 75th)
 * - Completeness metrics
 *
 * These aggregates are stored in Storj as 'quarterly-aggregate' type
 * and are never deleted by the pruning system.
 */

import type { MetricSample } from "@/agents/types";
import { getStorageService } from "@/storage/StorageService";
import type { WalletEncryptionKey } from "@/utils/walletEncryption";
import type { DailyProcessedSleepData } from "@/utils/sleepDataProcessor";

export interface QuarterlyMetricSummary {
  average: number;
  min: number;
  max: number;
  median: number;
  stdDev: number;
  sampleCount: number;
  trend: "increasing" | "decreasing" | "stable";
  p25: number; // 25th percentile
  p75: number; // 75th percentile
}

export interface QuarterlyHealthAggregate {
  version: number;
  quarter: 1 | 2 | 3 | 4;
  year: number;
  dateRange: {
    start: string;
    end: string;
  };
  metrics: {
    heartRate?: QuarterlyMetricSummary;
    restingHeartRate?: QuarterlyMetricSummary;
    hrv?: QuarterlyMetricSummary;
    steps?: QuarterlyMetricSummary;
    exercise?: QuarterlyMetricSummary;
    activeEnergy?: QuarterlyMetricSummary;
    respiratory?: QuarterlyMetricSummary;
    sleep?: QuarterlyMetricSummary & {
      avgEfficiency: number;
      avgDuration: number;
    };
  };
  summary: {
    totalDays: number;
    activeDays: number;
    completeness: number;
  };
  generatedAt: string;
  dataSource: "apple-health" | "manual" | "imported";
}

export class QuarterlyAggregationService {
  private static readonly NON_SLEEP_METRIC_MAPPING: Record<
    string,
    Exclude<keyof QuarterlyHealthAggregate["metrics"], "sleep">
  > = {
    HKQuantityTypeIdentifierHeartRate: "heartRate",
    HKQuantityTypeIdentifierRestingHeartRate: "restingHeartRate",
    HKQuantityTypeIdentifierHeartRateVariabilitySDNN: "hrv",
    HKQuantityTypeIdentifierStepCount: "steps",
    HKQuantityTypeIdentifierAppleExerciseTime: "exercise",
    HKQuantityTypeIdentifierActiveEnergyBurned: "activeEnergy",
    HKQuantityTypeIdentifierRespiratoryRate: "respiratory",
  };
  /**
   * Determine quarter from date
   */
  static getQuarter(date: Date): { quarter: 1 | 2 | 3 | 4; year: number } {
    const month = date.getMonth();
    const quarter = (Math.floor(month / 3) + 1) as 1 | 2 | 3 | 4;
    return {
      quarter,
      year: date.getFullYear(),
    };
  }

  /**
   * Get date range for a specific quarter
   */
  static getQuarterDateRange(
    quarter: 1 | 2 | 3 | 4,
    year: number,
  ): {
    start: Date;
    end: Date;
  } {
    const startMonth = (quarter - 1) * 3;
    const start = new Date(year, startMonth, 1);
    const end = new Date(year, startMonth + 3, 0, 23, 59, 59, 999);

    return { start, end };
  }

  /**
   * Calculate comprehensive statistics for a metric
   */
  static calculateMetricSummary(
    samples: MetricSample[],
  ): QuarterlyMetricSummary {
    if (samples.length === 0) {
      throw new Error("Cannot calculate summary for empty samples");
    }

    const values = samples.map((s) => s.value).sort((a, b) => a - b);
    const sum = values.reduce((acc, v) => acc + v, 0);
    const average = sum / values.length;

    const min = values[0];
    const max = values[values.length - 1];

    const mid = Math.floor(values.length / 2);
    const median =
      values.length % 2 === 0
        ? (values[mid - 1] + values[mid]) / 2
        : values[mid];

    const p25Index = Math.floor(values.length * 0.25);
    const p75Index = Math.floor(values.length * 0.75);
    const p25 = values[p25Index];
    const p75 = values[p75Index];

    const squaredDiffs = values.map((v) => Math.pow(v - average, 2));
    const variance =
      squaredDiffs.reduce((acc, v) => acc + v, 0) / values.length;
    const stdDev = Math.sqrt(variance);

    const thirdSize = Math.floor(samples.length / 3);
    const firstThird = samples.slice(0, thirdSize);
    const lastThird = samples.slice(-thirdSize);

    const firstAvg =
      firstThird.reduce((sum, s) => sum + s.value, 0) / firstThird.length;
    const lastAvg =
      lastThird.reduce((sum, s) => sum + s.value, 0) / lastThird.length;

    const changePercent = ((lastAvg - firstAvg) / firstAvg) * 100;
    let trend: "increasing" | "decreasing" | "stable";
    if (Math.abs(changePercent) < 5) {
      trend = "stable";
    } else if (changePercent > 0) {
      trend = "increasing";
    } else {
      trend = "decreasing";
    }

    return {
      average,
      min,
      max,
      median,
      stdDev,
      sampleCount: samples.length,
      trend,
      p25,
      p75,
    };
  }

  /**
   * Generate quarterly aggregate from health data
   */
  static async generateQuarterlyAggregate(
    healthData: Record<
      string,
      Array<{
        startDate: string;
        value: string;
        unit?: string;
        source?: string;
        device?: string;
      }>
    >,
    quarter: 1 | 2 | 3 | 4,
    year: number,
  ): Promise<QuarterlyHealthAggregate> {
    const dateRange = this.getQuarterDateRange(quarter, year);

    console.log(`[Quarterly] Generating Q${quarter} ${year} aggregate...`);
    console.log(
      `[Quarterly] Date range: ${dateRange.start.toISOString()} to ${dateRange.end.toISOString()}`,
    );

    const aggregate: QuarterlyHealthAggregate = {
      version: 1,
      quarter,
      year,
      dateRange: {
        start: dateRange.start.toISOString(),
        end: dateRange.end.toISOString(),
      },
      metrics: {},
      summary: {
        totalDays: 0,
        activeDays: 0,
        completeness: 0,
      },
      generatedAt: new Date().toISOString(),
      dataSource: "apple-health",
    };

    const metricMapping = this.NON_SLEEP_METRIC_MAPPING;

    for (const [appleHealthType, metricKey] of Object.entries(metricMapping)) {
      const data = healthData[appleHealthType];
      if (!data || data.length === 0) continue;

      const quarterSamples = data
        .map((point) => ({
          timestamp: new Date(point.startDate),
          value: parseFloat(point.value),
          unit: point.unit,
          metadata: {
            source: point.source,
            device: point.device,
          },
        }))
        .filter((sample) => {
          const date = sample.timestamp;
          return date >= dateRange.start && date <= dateRange.end;
        })
        .filter((sample) => !isNaN(sample.value));

      if (quarterSamples.length === 0) continue;

      const summary = this.calculateMetricSummary(quarterSamples);

      aggregate.metrics[metricKey] = summary;

      console.log(
        `[Quarterly] ${metricKey}: ${summary.sampleCount} samples, avg=${summary.average.toFixed(1)}`,
      );
    }

    const totalDays = Math.ceil(
      (dateRange.end.getTime() - dateRange.start.getTime()) /
        (1000 * 60 * 60 * 24),
    );
    aggregate.summary.totalDays = totalDays;

    const allDates = new Set<string>();
    for (const metricType in healthData) {
      const data = healthData[metricType];
      if (!data) continue;

      data.forEach((point) => {
        const date = new Date(point.startDate);
        if (date >= dateRange.start && date <= dateRange.end) {
          allDates.add(date.toISOString().split("T")[0]);
        }
      });
    }

    aggregate.summary.activeDays = allDates.size;
    aggregate.summary.completeness = (allDates.size / totalDays) * 100;

    console.log(
      `[Quarterly] Summary: ${aggregate.summary.activeDays}/${totalDays} active days (${aggregate.summary.completeness.toFixed(1)}% complete)`,
    );

    return aggregate;
  }

  /**
   * Generate quarterly aggregate from processed daily aggregates (preferred).
   * This uses per-day values (daily totals for cumulative metrics, daily averages for others),
   * which makes quarter-over-quarter comparisons stable and avoids huge raw arrays.
   */
  static async generateQuarterlyAggregateFromProcessed(
    processed: {
      dailyAggregates: Record<string, Map<string, MetricSample>>;
      sleepData: DailyProcessedSleepData[];
    },
    quarter: 1 | 2 | 3 | 4,
    year: number,
  ): Promise<QuarterlyHealthAggregate> {
    const dateRange = this.getQuarterDateRange(quarter, year);

    const aggregate: QuarterlyHealthAggregate = {
      version: 1,
      quarter,
      year,
      dateRange: {
        start: dateRange.start.toISOString(),
        end: dateRange.end.toISOString(),
      },
      metrics: {},
      summary: {
        totalDays: 0,
        activeDays: 0,
        completeness: 0,
      },
      generatedAt: new Date().toISOString(),
      dataSource: "apple-health",
    };

    const metricMapping = this.NON_SLEEP_METRIC_MAPPING;

    const activeDays = new Set<string>();

    for (const [appleHealthType, metricKey] of Object.entries(metricMapping)) {
      const dailyMap = processed.dailyAggregates[appleHealthType];
      if (!dailyMap || dailyMap.size === 0) continue;

      const quarterSamples = Array.from(dailyMap.values())
        .filter(
          (s) => s.timestamp >= dateRange.start && s.timestamp <= dateRange.end,
        )
        .filter(
          (s) => !Number.isNaN(s.value) && !Number.isNaN(s.timestamp.getTime()),
        );

      if (quarterSamples.length === 0) continue;

      // Track active days (per-day samples)
      quarterSamples.forEach((s) =>
        activeDays.add(s.timestamp.toISOString().split("T")[0]),
      );

      aggregate.metrics[metricKey] =
        this.calculateMetricSummary(quarterSamples);
    }

    // Sleep: derive quarter samples from processed sleep days
    const sleepDays = processed.sleepData.filter((d) => {
      const dt = new Date(d.date + "T12:00:00");
      return dt >= dateRange.start && dt <= dateRange.end;
    });

    if (sleepDays.length > 0) {
      const sleepSamples: MetricSample[] = sleepDays
        .filter((d) => d.sleepDuration > 0)
        .map((d) => ({
          timestamp: new Date(d.date + "T12:00:00"),
          value: d.sleepDuration, // minutes
          unit: "min",
          metadata: {
            efficiency: d.metrics.sleepEfficiency,
            totalDuration: d.totalDuration,
            stages: d.stageData,
          },
        }));

      if (sleepSamples.length > 0) {
        sleepSamples.forEach((s) =>
          activeDays.add(s.timestamp.toISOString().split("T")[0]),
        );

        const summary = this.calculateMetricSummary(sleepSamples);
        const avgEfficiency =
          sleepDays.reduce((acc, d) => acc + d.metrics.sleepEfficiency, 0) /
          sleepDays.length;
        const avgDuration =
          sleepDays.reduce((acc, d) => acc + d.sleepDuration, 0) /
          sleepDays.length;

        aggregate.metrics.sleep = {
          ...summary,
          avgEfficiency: Math.round(avgEfficiency * 10) / 10,
          avgDuration: Math.round(avgDuration),
        };
      }
    }

    const totalDays = Math.ceil(
      (dateRange.end.getTime() - dateRange.start.getTime()) /
        (1000 * 60 * 60 * 24),
    );
    aggregate.summary.totalDays = totalDays;
    aggregate.summary.activeDays = activeDays.size;
    aggregate.summary.completeness =
      totalDays > 0 ? Math.round((activeDays.size / totalDays) * 100) / 100 : 0;

    return aggregate;
  }

  /**
   * Save quarterly aggregate to Storj
   */
  static async saveToStorj(
    aggregate: QuarterlyHealthAggregate,
    userAddress: string,
    encryptionKey: WalletEncryptionKey,
  ): Promise<string> {
    const storageService = getStorageService();

    const result = await storageService.storeHealthData(
      aggregate,
      userAddress,
      encryptionKey,
      {
        dataType: "quarterly-aggregate",
        metadata: {
          quarter: aggregate.quarter.toString(),
          year: aggregate.year.toString(),
        },
      },
    );

    console.log(
      `[Quarterly] Saved Q${aggregate.quarter} ${aggregate.year} to Storj: ${result.storjUri}`,
    );

    return result.storjUri;
  }

  /**
   * Load quarterly aggregate from Storj
   */
  static async loadFromStorj(
    quarter: 1 | 2 | 3 | 4,
    year: number,
    userAddress: string,
    encryptionKey: WalletEncryptionKey,
  ): Promise<QuarterlyHealthAggregate | null> {
    const storageService = getStorageService();

    const references = await storageService.listUserData(
      userAddress,
      encryptionKey,
      "quarterly-aggregate",
    );

    for (const ref of references) {
      const result =
        await storageService.retrieveHealthData<QuarterlyHealthAggregate>(
          ref.uri,
          encryptionKey,
          undefined,
          userAddress,
        );

      const aggregate = result.data;

      if (aggregate.quarter === quarter && aggregate.year === year) {
        console.log(`[Quarterly] Loaded Q${quarter} ${year} from Storj`);
        return aggregate;
      }
    }

    console.log(`[Quarterly] Q${quarter} ${year} not found in Storj`);
    return null;
  }

  /**
   * Check if a quarterly aggregate exists
   */
  static async exists(
    quarter: 1 | 2 | 3 | 4,
    year: number,
    userAddress: string,
    encryptionKey: WalletEncryptionKey,
  ): Promise<boolean> {
    const aggregate = await this.loadFromStorj(
      quarter,
      year,
      userAddress,
      encryptionKey,
    );
    return aggregate !== null;
  }

  /**
   * List all available quarterly aggregates for a user
   */
  static async listAll(
    userAddress: string,
    encryptionKey: WalletEncryptionKey,
  ): Promise<
    Array<{ quarter: 1 | 2 | 3 | 4; year: number; generatedAt: string }>
  > {
    const storageService = getStorageService();

    const references = await storageService.listUserData(
      userAddress,
      encryptionKey,
      "quarterly-aggregate",
    );

    const aggregates: Array<{
      quarter: 1 | 2 | 3 | 4;
      year: number;
      generatedAt: string;
    }> = [];

    for (const ref of references) {
      const result =
        await storageService.retrieveHealthData<QuarterlyHealthAggregate>(
          ref.uri,
          encryptionKey,
          undefined,
          userAddress,
        );

      const aggregate = result.data;
      aggregates.push({
        quarter: aggregate.quarter,
        year: aggregate.year,
        generatedAt: aggregate.generatedAt,
      });
    }

    aggregates.sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.quarter - a.quarter;
    });

    return aggregates;
  }
}
