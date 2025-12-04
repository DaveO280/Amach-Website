/**
 * Tiered Data Aggregation Utility
 *
 * Provides intelligent time-based aggregation for health metrics:
 * - Last 30 days: Daily cumulative totals (high resolution)
 * - Days 31-180: Weekly averages (medium resolution)
 * - Days 181+: Monthly averages (low resolution, long-term trends)
 *
 * This approach maximizes context efficiency while preserving:
 * 1. Recent detail for actionable insights
 * 2. Medium-term trends for pattern detection
 * 3. Long-term historical context for baseline understanding
 */

import type { MetricSample } from "@/agents/types";

export interface TieredAggregationConfig {
  dailyDays: number; // Days with daily resolution (default: 30)
  weeklyDays: number; // Days with weekly resolution (default: 150, covering 31-180)
  monthlyDays: number; // Remaining days with monthly resolution (default: 518, covering 181-698)
}

export interface AggregatedPeriod {
  periodType: "daily" | "weekly" | "monthly";
  startDate: Date;
  endDate: Date;
  value: number;
  sampleCount: number; // Number of raw samples in this period
  unit: string;
  metadata?: Record<string, unknown>;
}

const DEFAULT_CONFIG: TieredAggregationConfig = {
  dailyDays: 30,
  weeklyDays: 150, // Days 31-180
  monthlyDays: 518, // Days 181-698 (~1.4 years)
};

/**
 * Determines if a metric type should be summed (cumulative) or averaged
 */
export function isCumulativeMetric(metricType: string): boolean {
  const cumulativeTypes = [
    "HKQuantityTypeIdentifierStepCount",
    "HKQuantityTypeIdentifierActiveEnergyBurned",
    "HKQuantityTypeIdentifierAppleExerciseTime",
    "HKQuantityTypeIdentifierDistanceWalkingRunning",
    "HKQuantityTypeIdentifierFlightsClimbed",
  ];

  return cumulativeTypes.includes(metricType);
}

/**
 * Groups samples by day
 */
export function aggregateSamplesByDay(
  samples: MetricSample[],
): Map<string, MetricSample[]> {
  const dailyGroups = new Map<string, MetricSample[]>();

  for (const sample of samples) {
    const dateKey = extractDateKey(sample.timestamp);

    if (!dailyGroups.has(dateKey)) {
      dailyGroups.set(dateKey, []);
    }
    dailyGroups.get(dateKey)!.push(sample);
  }

  return dailyGroups;
}

/**
 * Aggregates daily groups into single values (sum for cumulative, average for others)
 */
export function aggregateDailyValues(
  dailyGroups: Map<string, MetricSample[]>,
  isCumulative: boolean,
): Map<string, MetricSample> {
  const dailyAggregates = new Map<string, MetricSample>();

  for (const [dateKey, samples] of dailyGroups.entries()) {
    if (samples.length === 0) continue;

    const values = samples.map((s) => s.value);
    const aggregatedValue = isCumulative
      ? values.reduce((sum, v) => sum + v, 0) // SUM for cumulative
      : values.reduce((sum, v) => sum + v, 0) / values.length; // AVERAGE for others

    // Use the first sample's timestamp for the day (midnight)
    const dayStart = new Date(dateKey + "T00:00:00");

    dailyAggregates.set(dateKey, {
      timestamp: dayStart,
      value: aggregatedValue,
      unit: samples[0].unit,
      metadata: {
        sampleCount: samples.length,
        aggregationType: isCumulative ? "sum" : "average",
        originalSamples: samples.length,
      },
    });
  }

  return dailyAggregates;
}

/**
 * Aggregates daily samples into weekly periods
 */
export function aggregateToWeekly(
  dailySamples: Map<string, MetricSample>,
  isCumulative: boolean,
): AggregatedPeriod[] {
  const sortedDates = Array.from(dailySamples.keys()).sort();
  const weeklyPeriods: AggregatedPeriod[] = [];

  let currentWeekStart: Date | null = null;
  let currentWeekSamples: MetricSample[] = [];

  for (const dateKey of sortedDates) {
    const sample = dailySamples.get(dateKey)!;
    const sampleDate = new Date(dateKey);

    // Start a new week if needed (Monday-Sunday weeks)
    if (currentWeekStart === null) {
      currentWeekStart = getWeekStart(sampleDate);
      currentWeekSamples = [];
    }

    const weekStart = getWeekStart(sampleDate);

    // If we've moved to a new week, aggregate the previous week
    if (
      weekStart.getTime() !== currentWeekStart.getTime() &&
      currentWeekSamples.length > 0
    ) {
      weeklyPeriods.push(
        aggregatePeriod(
          currentWeekStart,
          new Date(currentWeekStart.getTime() + 6 * 24 * 60 * 60 * 1000),
          currentWeekSamples,
          "weekly",
          isCumulative,
        ),
      );

      currentWeekStart = weekStart;
      currentWeekSamples = [];
    }

    currentWeekSamples.push(sample);
  }

  // Add final week
  if (currentWeekStart && currentWeekSamples.length > 0) {
    weeklyPeriods.push(
      aggregatePeriod(
        currentWeekStart,
        new Date(currentWeekStart.getTime() + 6 * 24 * 60 * 60 * 1000),
        currentWeekSamples,
        "weekly",
        isCumulative,
      ),
    );
  }

  return weeklyPeriods;
}

/**
 * Aggregates daily samples into monthly periods
 */
export function aggregateToMonthly(
  dailySamples: Map<string, MetricSample>,
  isCumulative: boolean,
): AggregatedPeriod[] {
  const sortedDates = Array.from(dailySamples.keys()).sort();
  const monthlyPeriods: AggregatedPeriod[] = [];

  let currentMonth: string | null = null;
  let currentMonthSamples: MetricSample[] = [];
  let monthStart: Date | null = null;

  for (const dateKey of sortedDates) {
    const sample = dailySamples.get(dateKey)!;
    const sampleDate = new Date(dateKey);
    const monthKey = `${sampleDate.getFullYear()}-${String(sampleDate.getMonth() + 1).padStart(2, "0")}`;

    // Start a new month if needed
    if (currentMonth === null) {
      currentMonth = monthKey;
      monthStart = new Date(sampleDate.getFullYear(), sampleDate.getMonth(), 1);
      currentMonthSamples = [];
    }

    // If we've moved to a new month, aggregate the previous month
    if (monthKey !== currentMonth && currentMonthSamples.length > 0) {
      const monthEnd = new Date(
        monthStart!.getFullYear(),
        monthStart!.getMonth() + 1,
        0,
      );

      monthlyPeriods.push(
        aggregatePeriod(
          monthStart!,
          monthEnd,
          currentMonthSamples,
          "monthly",
          isCumulative,
        ),
      );

      currentMonth = monthKey;
      monthStart = new Date(sampleDate.getFullYear(), sampleDate.getMonth(), 1);
      currentMonthSamples = [];
    }

    currentMonthSamples.push(sample);
  }

  // Add final month
  if (monthStart && currentMonthSamples.length > 0) {
    const monthEnd = new Date(
      monthStart.getFullYear(),
      monthStart.getMonth() + 1,
      0,
    );

    monthlyPeriods.push(
      aggregatePeriod(
        monthStart,
        monthEnd,
        currentMonthSamples,
        "monthly",
        isCumulative,
      ),
    );
  }

  return monthlyPeriods;
}

/**
 * Main tiered aggregation function
 * Returns samples aggregated according to the tiered strategy
 */
export function applyTieredAggregation(
  samples: MetricSample[],
  metricType: string,
  config: TieredAggregationConfig = DEFAULT_CONFIG,
): MetricSample[] {
  if (samples.length === 0) return [];

  const isCumulative = isCumulativeMetric(metricType);

  // Step 1: Group by day and aggregate (sum for cumulative, average for others)
  const dailyGroups = aggregateSamplesByDay(samples);
  const dailyAggregates = aggregateDailyValues(dailyGroups, isCumulative);

  // Step 2: Sort by date
  const sortedDates = Array.from(dailyAggregates.keys()).sort();
  const totalDays = sortedDates.length;

  // Step 3: Apply tiered aggregation
  const result: MetricSample[] = [];

  // Recent period (last 30 days) - DAILY resolution
  const recentDailyCount = Math.min(config.dailyDays, totalDays);
  const recentDailyDates = sortedDates.slice(-recentDailyCount);

  for (const dateKey of recentDailyDates) {
    result.push(dailyAggregates.get(dateKey)!);
  }

  // Middle period (days 31-180) - WEEKLY resolution
  const middlePeriodEnd = sortedDates.length - recentDailyCount;
  const middlePeriodStart = Math.max(0, middlePeriodEnd - config.weeklyDays);
  const middlePeriodDates = sortedDates.slice(
    middlePeriodStart,
    middlePeriodEnd,
  );

  if (middlePeriodDates.length > 0) {
    const middlePeriodSamples = new Map<string, MetricSample>();
    for (const dateKey of middlePeriodDates) {
      middlePeriodSamples.set(dateKey, dailyAggregates.get(dateKey)!);
    }

    const weeklyAggregates = aggregateToWeekly(
      middlePeriodSamples,
      isCumulative,
    );

    // Convert AggregatedPeriod back to MetricSample format
    for (const period of weeklyAggregates) {
      result.push({
        timestamp: period.startDate,
        value: period.value,
        unit: period.unit,
        metadata: {
          ...period.metadata,
          periodType: period.periodType,
          periodEnd: period.endDate.toISOString(),
          sampleCount: period.sampleCount,
        },
      });
    }
  }

  // Historical period (days 181+) - MONTHLY resolution
  const historicalEnd = middlePeriodStart;
  const historicalDates = sortedDates.slice(0, historicalEnd);

  if (historicalDates.length > 0) {
    const historicalSamples = new Map<string, MetricSample>();
    for (const dateKey of historicalDates) {
      historicalSamples.set(dateKey, dailyAggregates.get(dateKey)!);
    }

    const monthlyAggregates = aggregateToMonthly(
      historicalSamples,
      isCumulative,
    );

    // Convert AggregatedPeriod back to MetricSample format
    for (const period of monthlyAggregates) {
      result.push({
        timestamp: period.startDate,
        value: period.value,
        unit: period.unit,
        metadata: {
          ...period.metadata,
          periodType: period.periodType,
          periodEnd: period.endDate.toISOString(),
          sampleCount: period.sampleCount,
        },
      });
    }
  }

  // Sort result by timestamp
  result.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  return result;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractDateKey(timestamp: Date): string {
  const year = timestamp.getFullYear();
  const month = String(timestamp.getMonth() + 1).padStart(2, "0");
  const day = String(timestamp.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekStart(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday as week start
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

function aggregatePeriod(
  startDate: Date,
  endDate: Date,
  samples: MetricSample[],
  periodType: "daily" | "weekly" | "monthly",
  isCumulative: boolean,
): AggregatedPeriod {
  const values = samples.map((s) => s.value);

  // For weekly/monthly aggregates of cumulative metrics:
  // We want the AVERAGE daily value, not the sum of all days
  // (e.g., average steps per day in that week, not total steps for the week)
  const aggregatedValue = isCumulative
    ? values.reduce((sum, v) => sum + v, 0) / values.length // Average daily value
    : values.reduce((sum, v) => sum + v, 0) / values.length; // Average

  return {
    periodType,
    startDate,
    endDate,
    value: aggregatedValue,
    sampleCount: samples.reduce(
      (sum, s) => sum + ((s.metadata?.sampleCount as number) || 1),
      0,
    ),
    unit: samples[0].unit || "",
    metadata: {
      daysInPeriod: samples.length,
      aggregationType: isCumulative ? "average_daily" : "average",
    },
  };
}
