/**
 * Category B — statistical bounds per metric.
 *
 *   B.1 Mean within physiologically plausible range (CDC / ACSM / Schmitt /
 *       Ohayon — see config.ts for citations)
 *   B.2 Variance within reasonable bounds (CV bounds per metric)
 *   B.3 No degenerate distributions (≤ 30% identical values)
 *   B.4 No suspicious step changes
 *   B.5 Range coherence
 *
 * Each metric runs all five sub-checks. Results are aggregated category-wide.
 */

import type { CheckResult, LegitimacyConfig, MetricBound } from "../types";
import type { AmachLeafV2 } from "../types";
import {
  coefficientOfVariation,
  maxAbsoluteDelta,
  mean,
  modeFraction,
  nonZero,
  range
} from "../stats";

interface MetricSeries {
  key: string;
  values: number[];
  bound: MetricBound;
}

const METRIC_KEYS: Array<keyof AmachLeafV2 & string> = [
  "steps",
  "activeEnergy",
  "exerciseMins",
  "hrv",
  "restingHR",
  "sleepMins",
  "vo2max",
  "weight",
  "bodyFatPct",
  "leanMass",
  "deepSleepMins",
  "remSleepMins",
  "lightSleepMins",
  "awakeMins"
];

function seriesFor(
  leaves: AmachLeafV2[],
  key: keyof AmachLeafV2 & string,
  config: LegitimacyConfig
): MetricSeries | null {
  const bound = config.metricBounds[key];
  if (!bound) return null;
  const values = leaves.map((l) => l[key] as number);
  return { key, values, bound };
}

/**
 * Run B.1–B.5 across all metrics. Returns the flattened CheckResult array;
 * each result's id is `B.<n>.<metric>` so the final report can group them.
 */
export function runCategoryB(
  leaves: AmachLeafV2[],
  config: LegitimacyConfig
): CheckResult[] {
  const results: CheckResult[] = [];

  for (const key of METRIC_KEYS) {
    const series = seriesFor(leaves, key, config);
    if (!series) continue;
    const present = nonZero(series.values);

    // B.1 — mean
    if (present.length === 0) {
      results.push({
        id: `B.1.${key}`,
        category: "B",
        name: `Mean plausibility — ${key}`,
        status: "warn",
        message: `${key}: no non-zero samples; mean check skipped.`,
        value: null,
        bound: `${series.bound.meanMin ?? "−∞"}–${series.bound.meanMax ?? "∞"}`,
        source: series.bound.source,
        weight: 1.0
      });
    } else {
      const m = mean(present);
      const lo = series.bound.meanMin;
      const hi = series.bound.meanMax;
      const ok =
        (lo === null || m >= lo) && (hi === null || m <= hi);
      results.push({
        id: `B.1.${key}`,
        category: "B",
        name: `Mean plausibility — ${key}`,
        status: ok ? "pass" : "fail",
        message: ok
          ? `${key} mean ${m.toFixed(1)} within plausible range.`
          : `${key} mean ${m.toFixed(1)} outside [${lo ?? "−∞"}, ${hi ?? "∞"}].`,
        value: Math.round(m * 100) / 100,
        bound: `${lo ?? "−∞"}–${hi ?? "∞"}`,
        source: series.bound.source,
        weight: 1.0
      });
    }

    // B.2 — variance via coefficient of variation
    if (present.length < 3 || (series.bound.cvMin === null && series.bound.cvMax === null)) {
      results.push({
        id: `B.2.${key}`,
        category: "B",
        name: `Variance plausibility — ${key}`,
        status: "warn",
        message:
          present.length < 3
            ? `${key}: <3 samples, variance check skipped.`
            : `${key}: variance bounds not configured.`,
        value: null,
        bound: `${series.bound.cvMin ?? "−"}–${series.bound.cvMax ?? "−"}`,
        source: series.bound.source,
        weight: 0.7
      });
    } else {
      const cv = coefficientOfVariation(present);
      const cvOk =
        Number.isFinite(cv) &&
        (series.bound.cvMin === null || cv >= series.bound.cvMin) &&
        (series.bound.cvMax === null || cv <= series.bound.cvMax);
      results.push({
        id: `B.2.${key}`,
        category: "B",
        name: `Variance plausibility — ${key}`,
        status: cvOk ? "pass" : "fail",
        message: cvOk
          ? `${key} CV ${cv.toFixed(3)} within bounds.`
          : `${key} CV ${cv.toFixed(3)} outside [${
              series.bound.cvMin ?? "−"
            }, ${series.bound.cvMax ?? "−"}].`,
        value: Number.isFinite(cv) ? Math.round(cv * 1000) / 1000 : null,
        bound: `${series.bound.cvMin ?? "−"}–${series.bound.cvMax ?? "−"}`,
        source: series.bound.source,
        weight: 0.7
      });
    }

    // B.3 — degenerate distribution (mode-fraction across non-zero samples).
    // Body composition metrics legitimately change very slowly (daily weight
    // varies <1 kg, bodyFatPct <1 percentage point), so a high mode-fraction
    // on weight/bodyFatPct/leanMass is not diagnostic. Skip those.
    const skipModeFraction = new Set([
      "weight",
      "bodyFatPct",
      "leanMass"
    ]);
    if (skipModeFraction.has(key)) {
      // intentionally skipped — see comment above
    } else if (present.length === 0) {
      results.push({
        id: `B.3.${key}`,
        category: "B",
        name: `Distribution shape — ${key}`,
        status: "warn",
        message: `${key}: no non-zero samples to test for duplicates.`,
        value: null,
        bound: `≤ ${(config.maxDuplicateProportion * 100).toFixed(0)}%`,
        weight: 0.5
      });
    } else {
      const mf = modeFraction(present);
      const mfOk = mf <= config.maxDuplicateProportion;
      results.push({
        id: `B.3.${key}`,
        category: "B",
        name: `Distribution shape — ${key}`,
        status: mfOk ? "pass" : "fail",
        message: mfOk
          ? `${key} mode-fraction ${(mf * 100).toFixed(1)}% within bound.`
          : `${key} mode-fraction ${(mf * 100).toFixed(1)}% exceeds ${(
              config.maxDuplicateProportion * 100
            ).toFixed(0)}%.`,
        value: Math.round(mf * 1000) / 1000,
        bound: `≤ ${(config.maxDuplicateProportion * 100).toFixed(0)}%`,
        weight: 0.8
      });
    }

    // B.4 — suspicious step changes
    if (series.bound.maxStepChange === null) {
      // Skip silently when not configured.
    } else {
      const delta = maxAbsoluteDelta(present);
      const stepOk = delta <= series.bound.maxStepChange;
      results.push({
        id: `B.4.${key}`,
        category: "B",
        name: `Step-change plausibility — ${key}`,
        status: stepOk ? "pass" : "fail",
        message: stepOk
          ? `${key} max d/d delta ${delta.toFixed(1)} ≤ ${series.bound.maxStepChange}.`
          : `${key} max d/d delta ${delta.toFixed(1)} exceeds ${series.bound.maxStepChange}.`,
        value: Math.round(delta * 100) / 100,
        bound: `≤ ${series.bound.maxStepChange}`,
        source: series.bound.source,
        weight: 0.8
      });
    }

    // B.5 — range coherence
    if (series.bound.maxRange === null) {
      // Skip silently when not configured.
    } else if (present.length < 2) {
      results.push({
        id: `B.5.${key}`,
        category: "B",
        name: `Range coherence — ${key}`,
        status: "warn",
        message: `${key}: <2 samples, range check skipped.`,
        value: null,
        bound: `≤ ${series.bound.maxRange}`,
        source: series.bound.source,
        weight: 0.6
      });
    } else {
      const r = range(present);
      const rOk = r <= series.bound.maxRange;
      results.push({
        id: `B.5.${key}`,
        category: "B",
        name: `Range coherence — ${key}`,
        status: rOk ? "pass" : "fail",
        message: rOk
          ? `${key} range ${r.toFixed(1)} ≤ ${series.bound.maxRange}.`
          : `${key} range ${r.toFixed(1)} exceeds ${series.bound.maxRange}.`,
        value: Math.round(r * 100) / 100,
        bound: `≤ ${series.bound.maxRange}`,
        source: series.bound.source,
        weight: 0.6
      });
    }
  }

  return results;
}
