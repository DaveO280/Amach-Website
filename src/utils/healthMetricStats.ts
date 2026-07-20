/**
 * Pure health-metric statistics — the single source of truth for the numbers
 * shown on stat cards, the dashboard, and in agent context.
 *
 * Extracted verbatim from HealthDataContextWrapper's metrics effect so the
 * computation is (a) testable against the Apple-Health-verified golden fixture
 * and (b) impossible to silently fork into a second implementation. See
 * docs/architecture/13-data-integrity-harness.md.
 *
 * ── POLICY (matches tests/health-pipeline/reference/computeReferenceStats.ts) ──
 *  - Day bucket : calendar date of the sample's start timestamp (extractDatePart).
 *  - Cumulative metrics (steps, exercise, activeEnergy): daily value = SUM.
 *  - Rate metrics (HR, HRV, restingHR): daily avg/min/max over the day's samples.
 *  - Respiratory: daily mean.
 *  - average / low EXCLUDE zero-value days for cumulative metrics — a 0 means the
 *    device wasn't worn, not a genuine rest day, so including them would depress
 *    the average and pin `low` to 0.
 *  - high uses ALL days so the all-time peak is correct.
 *
 * NOTE: these numbers are only as complete as the `metricData` handed in. When
 * the caller is showing a partial source (IndexedDB rather than full Storj
 * history), "all-time" stats are really "all-time within that slice" — which is
 * why the context also reports data completeness. See MetricDataCompleteness.
 */

import { extractDatePart } from "@/utils/dataDeduplicator";
import { processSleepData } from "@/utils/sleepDataProcessor";
import type { HealthDataByType } from "@/types/healthData";

export interface DailyPoint {
  day: string;
  date: Date;
  value: number;
  count: number;
  values: number[];
}

export interface DailyRatePoint extends DailyPoint {
  avg: number;
  min: number;
  max: number;
}

export interface MetricSummary {
  average: number;
  high: number;
  low: number;
}

export interface SleepSummary extends MetricSummary {
  efficiency: number;
}

export interface HealthMetricStats {
  steps: MetricSummary;
  exercise: MetricSummary;
  heartRate: MetricSummary;
  hrv: MetricSummary;
  restingHR: MetricSummary;
  respiratory: MetricSummary;
  activeEnergy: MetricSummary;
  sleep: SleepSummary;
}

type RawPoint = { startDate: string; value: string };

/**
 * Cumulative metrics (steps, exercise, active energy): sum the day's samples.
 * For Storj-native data (one pre-summed point per day) the loop is a no-op;
 * it stays correct for IndexedDB raw records with many intraday entries.
 */
export function processCumulativeData(data: RawPoint[]): DailyPoint[] {
  const dailyData: Record<
    string,
    { total: number; count: number; values: number[] }
  > = {};
  data.forEach((point) => {
    try {
      const dayKey = extractDatePart(point.startDate);
      const value = parseFloat(point.value);
      if (!isNaN(value)) {
        if (!dailyData[dayKey]) {
          dailyData[dayKey] = { total: 0, count: 0, values: [] };
        }
        dailyData[dayKey].total += value;
        dailyData[dayKey].count += 1;
        dailyData[dayKey].values.push(value);
      }
    } catch (e) {
      console.error("Error processing cumulative data point:", e);
    }
  });
  return Object.entries(dailyData)
    .map(([day, d]) => ({
      day,
      date: new Date(day + "T12:00:00"),
      value: Math.round(d.total),
      count: d.count,
      values: d.values,
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Rate metrics (heart rate, HRV, resting HR): daily average with min/max.
 * For Storj-native data only `avg` is supplied, so min/max equal avg.
 */
export function processRateData(data: RawPoint[]): DailyRatePoint[] {
  const dailyData: Record<
    string,
    { values: number[]; min: number; max: number }
  > = {};
  data.forEach((point) => {
    try {
      const dayKey = extractDatePart(point.startDate);
      const value = parseFloat(point.value);
      if (!isNaN(value)) {
        if (!dailyData[dayKey]) {
          dailyData[dayKey] = {
            values: [],
            min: Number.MAX_SAFE_INTEGER,
            max: Number.MIN_SAFE_INTEGER,
          };
        }
        dailyData[dayKey].values.push(value);
        dailyData[dayKey].min = Math.min(dailyData[dayKey].min, value);
        dailyData[dayKey].max = Math.max(dailyData[dayKey].max, value);
      }
    } catch (e) {
      console.error("Error processing heart rate data point:", e);
    }
  });
  return Object.entries(dailyData)
    .map(([day, d]) => ({
      day,
      date: new Date(day + "T12:00:00"),
      value: Math.round(
        d.values.reduce((sum, val) => sum + val, 0) / d.values.length,
      ),
      count: d.values.length,
      values: d.values,
      avg: Math.round(
        d.values.reduce((sum, val) => sum + val, 0) / d.values.length,
      ),
      min: Math.round(d.min),
      max: Math.round(d.max),
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Respiratory rate: daily mean (unrounded, matching prior behavior). */
export function processRespiratoryData(data: RawPoint[]): DailyPoint[] {
  const dailyData: Record<string, number[]> = {};
  data.forEach((point) => {
    try {
      const dayKey = extractDatePart(point.startDate);
      const value = parseFloat(point.value);
      if (!isNaN(value)) {
        if (!dailyData[dayKey]) dailyData[dayKey] = [];
        dailyData[dayKey].push(value);
      }
    } catch (e) {
      console.error("Error processing respiratory data point:", e);
    }
  });
  return Object.entries(dailyData)
    .map(([day, values]) => ({
      day,
      date: new Date(day + "T12:00:00"),
      value: values.reduce((sum, v) => sum + v, 0) / values.length,
      count: values.length,
      values,
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Mean of a cumulative metric over active (non-zero) days only. */
function activeAverage(days: DailyPoint[]): number {
  const active = days.filter((d) => (d.value ?? 0) > 0);
  return active.length > 0
    ? Math.round(
        active.reduce((sum, d) => sum + (d.value ?? 0), 0) / active.length,
      )
    : 0;
}

/** Min of a cumulative metric over active (non-zero) days only. */
function activeLow(days: DailyPoint[]): number {
  const active = days.filter((d) => (d.value ?? 0) > 0);
  return active.length > 0 ? Math.min(...active.map((d) => d.value ?? 0)) : 0;
}

/**
 * Compute every stat-card metric from raw metricData.
 * Pure: same input always yields the same output.
 */
export function computeHealthMetricStats(
  metricData: HealthDataByType,
): HealthMetricStats {
  const steps = processCumulativeData(
    (metricData["HKQuantityTypeIdentifierStepCount"] || []) as RawPoint[],
  );
  const exercise = processCumulativeData(
    (metricData["HKQuantityTypeIdentifierAppleExerciseTime"] ||
      []) as RawPoint[],
  );
  const activeEnergy = processCumulativeData(
    (metricData["HKQuantityTypeIdentifierActiveEnergyBurned"] ||
      []) as RawPoint[],
  );
  const heartRate = processRateData(
    (metricData["HKQuantityTypeIdentifierHeartRate"] || []) as RawPoint[],
  );
  const hrv = processRateData(
    (metricData["HKQuantityTypeIdentifierHeartRateVariabilitySDNN"] ||
      []) as RawPoint[],
  );
  const restingHR = processRateData(
    (metricData["HKQuantityTypeIdentifierRestingHeartRate"] ||
      []) as RawPoint[],
  );
  const respiratory = processRespiratoryData(
    (metricData["HKQuantityTypeIdentifierRespiratoryRate"] || []) as RawPoint[],
  );

  const sleepRaw = metricData["HKCategoryTypeIdentifierSleepAnalysis"] || [];
  const processedSleep = processSleepData(sleepRaw);

  const sleep: SleepSummary = ((): SleepSummary => {
    if (processedSleep.length === 0) {
      return { average: 0, efficiency: 0, high: 0, low: 0 };
    }
    // processSleepData returns one corrected value per WAKE-date, with
    // multi-night collisions excluded and flagged (day.anomaly) rather than
    // summed or capped — so these stats need no <=900min cap.
    const flagged = processedSleep.filter((d) => d.anomaly);
    if (flagged.length > 0) {
      console.warn(
        `[HealthMetricStats] ${flagged.length} of ${processedSleep.length} sleep day(s) flagged as data-quality anomalies (corrected before display): ${flagged
          .map((d) => `${d.date} (${d.anomaly?.type})`)
          .join(", ")}`,
      );
    }
    const durations = processedSleep.map((d) => d.sleepDuration);
    return {
      average: Math.round(
        durations.reduce((sum, v) => sum + v, 0) / durations.length,
      ),
      efficiency: Math.round(
        processedSleep.reduce(
          (sum, day) => sum + day.metrics.sleepEfficiency,
          0,
        ) / processedSleep.length,
      ),
      high: Math.max(...durations, 0),
      low: Math.min(...durations),
    };
  })();

  return {
    steps: {
      average: activeAverage(steps),
      // high uses ALL days so the all-time peak is correct
      high: Math.max(...steps.map((d) => d.value ?? 0), 0),
      low: activeLow(steps),
    },
    exercise: {
      average: activeAverage(exercise),
      high: Math.max(...exercise.map((d) => d.value ?? 0), 0),
      low: activeLow(exercise),
    },
    heartRate: {
      average:
        heartRate.length > 0
          ? Math.round(
              heartRate.reduce((sum, d) => sum + (d.avg ?? 0), 0) /
                heartRate.length,
            )
          : 0,
      high: Math.max(...heartRate.map((d) => d.max ?? 0), 0),
      low:
        heartRate.length > 0
          ? Math.min(...heartRate.map((d) => d.min ?? 0))
          : 0,
    },
    hrv: {
      average:
        hrv.length > 0
          ? Math.round(
              hrv.reduce((sum, d) => sum + (d.avg ?? 0), 0) / hrv.length,
            )
          : 0,
      high: Math.max(...hrv.map((d) => d.max ?? 0), 0),
      low: hrv.length > 0 ? Math.min(...hrv.map((d) => d.min ?? 0)) : 0,
    },
    restingHR: {
      average:
        restingHR.length > 0
          ? Math.round(
              restingHR.reduce((sum, d) => sum + (d.avg ?? 0), 0) /
                restingHR.length,
            )
          : 0,
      high: Math.max(...restingHR.map((d) => d.max ?? 0), 0),
      low:
        restingHR.length > 0
          ? Math.min(...restingHR.map((d) => d.min ?? 0))
          : 0,
    },
    respiratory: {
      average:
        respiratory.length > 0
          ? Math.round(
              respiratory.reduce((sum, d) => sum + (d.value ?? 0), 0) /
                respiratory.length,
            )
          : 0,
      high: Math.max(...respiratory.map((d) => d.value ?? 0), 0),
      low:
        respiratory.length > 0
          ? Math.min(...respiratory.map((d) => d.value ?? 0))
          : 0,
    },
    activeEnergy: {
      average:
        activeEnergy.length > 0
          ? Math.round(
              activeEnergy.reduce((sum, d) => sum + (d.value ?? 0), 0) /
                activeEnergy.length,
            )
          : 0,
      high: Math.max(...activeEnergy.map((d) => d.value ?? 0), 0),
      low:
        activeEnergy.length > 0
          ? Math.min(...activeEnergy.map((d) => d.value ?? 0))
          : 0,
    },
    sleep,
  };
}
