/**
 * Reference statistics engine for the data-integrity harness.
 *
 * This computes the TRUTH from a raw Apple Health export, independently of the
 * production pipeline. Tests assert the pipeline converges to these numbers; we
 * do NOT snapshot pipeline output (that would freeze current bugs). See
 * docs/architecture/13-data-integrity-harness.md.
 *
 * It reuses the app's own METRIC_AGGREGATION_STRATEGIES (imported, not copied)
 * so the cumulative/average/latest/duration classification can never drift from
 * production intent.
 *
 * ── EXPLICIT POLICY CHOICES (the ambiguities that caused the stat-card churn) ──
 *  - Day bucket   : calendar date of a record's Start timestamp, as recorded in
 *                   the export (local offset preserved). No timezone re-shifting.
 *  - Window       : trailing N calendar days ending at the LATEST date that has
 *                   data for that metric (not "today").
 *  - Average      : mean over DAYS-WITH-DATA in the window — gap days are
 *                   excluded, not counted as zero. (avg steps *per active day*.)
 *  - Valid day    : the reference counts every day that has data. The production
 *                   stat cards additionally apply a low/near-zero-day filter;
 *                   that divergence is a reconciliation target, flagged in golden.
 *  - Sleep        : PROVISIONAL — asleep minutes = sum of core+deep+rem interval
 *                   durations, bucketed by Start day. The app's sleepDataProcessor
 *                   does session-based grouping; sleep golden entries are marked
 *                   confidence:"provisional" until reconciled.
 */

import {
  getAggregationStrategy,
  type AggregationType,
} from "../../../src/storage/appleHealth/metricAggregationStrategies";
import { type HealthRecord, recordDay } from "./parseHealthCsv";

const ASLEEP_STAGES = new Set(["core", "deep", "rem"]);

export interface DailyValue {
  date: string;
  value: number;
  min?: number;
  max?: number;
}

export interface WindowStats {
  avg: number;
  high: number;
  low: number;
  daysWithData: number;
}

export interface MetricStats {
  metric: string;
  aggregationType: AggregationType;
  unit: string;
  daysWithData: number;
  firstDate: string;
  lastDate: string;
  daily: Record<string, number>; // date -> daily value
  windows: {
    d7: WindowStats;
    d30: WindowStats;
    d90: WindowStats;
    allTime: WindowStats;
  };
  confidence: "apple-health-confirmed" | "reference-computed" | "provisional";
}

function minutesBetween(startIso: string, endIso: string): number {
  const s = Date.parse(
    startIso.replace(" ", "T").replace(/ ([-+]\d{4})$/, "$1"),
  );
  const e = Date.parse(endIso.replace(" ", "T").replace(/ ([-+]\d{4})$/, "$1"));
  if (Number.isNaN(s) || Number.isNaN(e)) return 0;
  return Math.max(0, (e - s) / 60000);
}

/** Collapse records for one metric into a per-day value per its strategy. */
function computeDaily(
  metric: string,
  aggType: AggregationType,
  records: HealthRecord[],
): Record<string, number> {
  const daily: Record<string, number> = {};

  if (aggType === "duration" && metric.includes("SleepAnalysis")) {
    // asleep minutes = core+deep+rem intervals, bucketed by start day (provisional)
    for (const r of records) {
      if (!ASLEEP_STAGES.has(r.value)) continue;
      const day = recordDay(r);
      daily[day] = (daily[day] ?? 0) + minutesBetween(r.start, r.end);
    }
    return daily;
  }

  if (aggType === "duration") {
    for (const r of records) {
      const day = recordDay(r);
      daily[day] = (daily[day] ?? 0) + minutesBetween(r.start, r.end);
    }
    return daily;
  }

  // group numeric values by day
  const byDay: Record<
    string,
    { vals: number[]; lastTs: string; lastVal: number }
  > = {};
  for (const r of records) {
    const v = Number(r.value);
    if (Number.isNaN(v)) continue;
    const day = recordDay(r);
    const b = byDay[day] ?? { vals: [], lastTs: "", lastVal: v };
    b.vals.push(v);
    if (r.start >= b.lastTs) {
      b.lastTs = r.start;
      b.lastVal = v;
    }
    byDay[day] = b;
  }

  for (const [day, b] of Object.entries(byDay)) {
    switch (aggType) {
      case "sum":
        daily[day] = b.vals.reduce((a, c) => a + c, 0);
        break;
      case "avg":
      case "avg_min_max":
        daily[day] = b.vals.reduce((a, c) => a + c, 0) / b.vals.length;
        break;
      case "latest":
        daily[day] = b.lastVal;
        break;
      case "count":
        daily[day] = b.vals.length;
        break;
      default:
        daily[day] = b.vals.reduce((a, c) => a + c, 0) / b.vals.length;
    }
  }
  return daily;
}

function addDays(isoDay: string, delta: number): string {
  const d = new Date(isoDay + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function windowStats(
  daily: Record<string, number>,
  endDay: string,
  windowDays: number | null,
): WindowStats {
  const startDay =
    windowDays === null ? "0000-00-00" : addDays(endDay, -(windowDays - 1));
  const vals: number[] = [];
  for (const [day, v] of Object.entries(daily)) {
    if (day <= endDay && day >= startDay) vals.push(v);
  }
  if (vals.length === 0) return { avg: 0, high: 0, low: 0, daysWithData: 0 };
  const sum = vals.reduce((a, c) => a + c, 0);
  return {
    avg: sum / vals.length,
    high: Math.max(...vals),
    low: Math.min(...vals),
    daysWithData: vals.length,
  };
}

export function computeMetricStats(
  metric: string,
  records: HealthRecord[],
): MetricStats {
  const strategy = getAggregationStrategy(metric);
  const daily = computeDaily(metric, strategy.aggregationType, records);
  const days = Object.keys(daily).sort();
  const lastDate = days[days.length - 1] ?? "";
  const isSleep = metric.includes("SleepAnalysis");
  return {
    metric,
    aggregationType: strategy.aggregationType,
    unit: strategy.unit,
    daysWithData: days.length,
    firstDate: days[0] ?? "",
    lastDate,
    daily,
    windows: {
      d7: windowStats(daily, lastDate, 7),
      d30: windowStats(daily, lastDate, 30),
      d90: windowStats(daily, lastDate, 90),
      allTime: windowStats(daily, lastDate, null),
    },
    confidence: isSleep
      ? "provisional"
      : metric.includes("StepCount")
        ? "apple-health-confirmed"
        : "reference-computed",
  };
}

/** Compute reference stats for every metric present in the records. */
export function computeReferenceStats(
  records: HealthRecord[],
): Record<string, MetricStats> {
  const byMetric: Record<string, HealthRecord[]> = {};
  for (const r of records) (byMetric[r.metric] ??= []).push(r);
  const out: Record<string, MetricStats> = {};
  for (const [metric, recs] of Object.entries(byMetric)) {
    out[metric] = computeMetricStats(metric, recs);
  }
  return out;
}
