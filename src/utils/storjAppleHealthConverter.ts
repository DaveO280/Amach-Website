/**
 * Converts Storj Apple Health daily summaries and breathing session timeline events
 * into the HealthDataByType format expected by LumaAiService and the agent pipeline.
 *
 * Why: The iOS app uploads Apple Health data directly to Storj as daily aggregates
 * (apple-health-full-export). The website only populates IndexedDB metricData through
 * manual XML import. Users who sync via iOS never get their wearable data into Luma's
 * context unless this conversion runs.
 */

import type { HealthDataByType, HealthDataPoint } from "@/types/healthData";
import type {
  AppleHealthStorjPayload,
  DailySummaryValue,
  SleepSummary,
} from "@/storage/appleHealth/AppleHealthStorjService";
import {
  METRIC_AGGREGATION_STRATEGIES,
  normalizeMetricKey,
} from "@/storage/appleHealth/metricAggregationStrategies";

// Build a reverse map: normalizedKey → HK identifier (e.g. "heartRate" → "HKQuantityTypeIdentifierHeartRate")
const NORMALIZED_TO_HK: Record<string, string> = {};
for (const hkKey of Object.keys(METRIC_AGGREGATION_STRATEGIES)) {
  const normalized = normalizeMetricKey(hkKey);
  NORMALIZED_TO_HK[normalized] = hkKey;
}

function getUnit(hkIdentifier: string): string {
  return METRIC_AGGREGATION_STRATEGIES[hkIdentifier]?.unit ?? "unknown";
}

function extractNumericValue(
  value: DailySummaryValue | SleepSummary | number,
): number | null {
  if (typeof value === "number") return value;

  // SleepSummary check: has "total" AND "core" (distinguishes from DailySummaryValue)
  const maybeSleep = value as SleepSummary;
  if (
    typeof maybeSleep.total === "number" &&
    typeof maybeSleep.core === "number"
  ) {
    return maybeSleep.total; // total sleep minutes
  }

  const asDaily = value as DailySummaryValue;
  if (typeof asDaily.avg === "number") return asDaily.avg;
  if (typeof asDaily.total === "number") return asDaily.total;
  return null;
}

/**
 * Build synthetic HealthDataPoint[] from a SleepSummary for one night.
 * processSleepData (used by CoordinatorService) derives sleep duration from
 * the length of each stage interval, so we create one interval per stage.
 */
function buildSleepPoints(
  dateKey: string,
  sleep: SleepSummary,
): HealthDataPoint[] {
  const points: HealthDataPoint[] = [];

  // Approximate wake time at 7am on the wake-up date (dateKey = wake date)
  const wakeTimeMs = new Date(`${dateKey}T07:00:00.000Z`).getTime();

  // Place stage intervals sequentially backwards from wake time
  const stages: Array<{ stage: string; durationMin: number }> = [];
  if (sleep.rem > 0) stages.push({ stage: "rem", durationMin: sleep.rem });
  if (sleep.core > 0) stages.push({ stage: "core", durationMin: sleep.core });
  if (sleep.deep > 0) stages.push({ stage: "deep", durationMin: sleep.deep });
  if (sleep.awake > 0)
    stages.push({ stage: "awake", durationMin: sleep.awake });

  let cursor = wakeTimeMs;
  for (const { stage, durationMin } of stages) {
    const endMs = cursor;
    const startMs = endMs - durationMin * 60_000;
    cursor = startMs;
    points.push({
      startDate: new Date(startMs).toISOString(),
      endDate: new Date(endMs).toISOString(),
      value: stage,
      unit: "min",
      source: "storj-apple-health",
      type: "HKCategoryTypeIdentifierSleepAnalysis",
    });
  }

  if (sleep.inBed > 0) {
    const inBedEndMs = wakeTimeMs;
    const inBedStartMs = inBedEndMs - sleep.inBed * 60_000;
    points.push({
      startDate: new Date(inBedStartMs).toISOString(),
      endDate: new Date(inBedEndMs).toISOString(),
      value: "inBed",
      unit: "min",
      source: "storj-apple-health",
      type: "HKCategoryTypeIdentifierSleepAnalysis",
    });
  }

  return points;
}

/**
 * Convert an AppleHealthStorjPayload (daily summaries from iOS upload) into
 * HealthDataByType format (one HealthDataPoint per day per metric).
 */
export function convertStorjPayloadToHealthData(
  payload: AppleHealthStorjPayload,
): HealthDataByType {
  const result: HealthDataByType = {};

  for (const [dateKey, daySummary] of Object.entries(payload.dailySummaries)) {
    for (const [metricKey, rawValue] of Object.entries(daySummary)) {
      if (metricKey === "sleep") {
        const sleep = rawValue as SleepSummary;
        if (sleep.total > 0) {
          const hkKey = "HKCategoryTypeIdentifierSleepAnalysis";
          if (!result[hkKey]) result[hkKey] = [];
          result[hkKey].push(...buildSleepPoints(dateKey, sleep));
        }
        continue;
      }

      const hkIdentifier = NORMALIZED_TO_HK[metricKey];
      if (!hkIdentifier) continue;

      const numValue = extractNumericValue(
        rawValue as DailySummaryValue | SleepSummary | number,
      );
      if (numValue === null || !Number.isFinite(numValue)) continue;

      if (!result[hkIdentifier]) result[hkIdentifier] = [];
      result[hkIdentifier].push({
        startDate: `${dateKey}T12:00:00.000Z`,
        endDate: `${dateKey}T12:00:00.000Z`,
        value: numValue.toString(),
        unit: getUnit(hkIdentifier),
        source: "storj-apple-health",
        type: hkIdentifier,
      });
    }
  }

  // Sort each metric's points chronologically
  for (const points of Object.values(result)) {
    points.sort((a, b) => a.startDate.localeCompare(b.startDate));
  }

  return result;
}

// Custom metric keys for breathing session data (not HK identifiers)
export const BREATHING_SESSION_HRV_KEY = "BreathingSessionHRV";
export const BREATHING_SESSION_DURATION_KEY = "BreathingSessionDuration";

interface BreathingSessionData {
  timestamp: number;
  data: {
    duration?: number;
    bpm?: number;
    baselineHRV?: number;
    recoveryHRV?: number;
    coherenceScore?: number;
  };
}

/**
 * Convert BREATHING_SESSION timeline events into HealthDataByType entries.
 * Uses recoveryHRV (preferred) or baselineHRV as the HRV data point.
 * Duration is stored in minutes for consistency with other metrics.
 */
export function convertBreathingSessionsToHealthData(
  events: BreathingSessionData[],
): HealthDataByType {
  const result: HealthDataByType = {
    [BREATHING_SESSION_HRV_KEY]: [],
    [BREATHING_SESSION_DURATION_KEY]: [],
  };

  for (const event of events) {
    const iso = new Date(event.timestamp).toISOString();
    const hrv = event.data?.recoveryHRV ?? event.data?.baselineHRV ?? null;

    if (typeof hrv === "number" && hrv > 0) {
      result[BREATHING_SESSION_HRV_KEY]!.push({
        startDate: iso,
        endDate: iso,
        value: hrv.toString(),
        unit: "ms",
        source: "storj-breathing-session",
        type: BREATHING_SESSION_HRV_KEY,
      });
    }

    const durationSec = event.data?.duration;
    if (typeof durationSec === "number" && durationSec > 0) {
      result[BREATHING_SESSION_DURATION_KEY]!.push({
        startDate: iso,
        endDate: iso,
        value: (durationSec / 60).toFixed(1),
        unit: "min",
        source: "storj-breathing-session",
        type: BREATHING_SESSION_DURATION_KEY,
      });
    }
  }

  // Remove empty arrays
  for (const key of Object.keys(result)) {
    if ((result[key]?.length ?? 0) === 0) {
      delete result[key];
    }
  }

  // Sort chronologically
  for (const points of Object.values(result)) {
    points.sort((a, b) => a.startDate.localeCompare(b.startDate));
  }

  return result;
}
