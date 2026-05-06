/**
 * Category E — continuity.
 *
 *   E.1 No gaps exceeding the configured maximum (default 48 hours).
 *   E.2 Per-metric data density (presence rate) above configured floor.
 *   E.3 Device source consistency — same primary sourceHash across the
 *       window. Hard rule per the brief.
 *
 * E.3 specifically catches "device switch midway" adversarial profiles
 * (A7) — they break the source binding even when individual metrics look
 * plausible.
 */

import type { CheckResult, LegitimacyConfig } from "../types";
import type { AmachLeafV2 } from "../types";

export function runCategoryE(
  leaves: AmachLeafV2[],
  config: LegitimacyConfig
): CheckResult[] {
  const results: CheckResult[] = [];

  if (leaves.length === 0) {
    results.push({
      id: "E.0",
      category: "E",
      name: "Continuity (precondition)",
      status: "fail",
      message: "Empty leaf set — continuity checks cannot run.",
      weight: 1.0
    });
    return results;
  }

  // E.1 — no gaps exceeding maxGapHours
  {
    const sorted = leaves.slice().sort((a, b) => a.dayId - b.dayId);
    let maxGapDays = 0;
    let firstBadGap: { fromDay: number; toDay: number } | null = null;
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i].dayId - sorted[i - 1].dayId;
      if (gap > maxGapDays) {
        maxGapDays = gap;
        if (gap * 24 > config.maxGapHours && firstBadGap === null) {
          firstBadGap = {
            fromDay: sorted[i - 1].dayId,
            toDay: sorted[i].dayId
          };
        }
      }
    }
    const ok = maxGapDays * 24 <= config.maxGapHours;
    results.push({
      id: "E.1",
      category: "E",
      name: "No data gaps exceeding threshold",
      status: ok ? "pass" : "fail",
      message: ok
        ? `Maximum observed gap ${maxGapDays} day(s) — within ${
            config.maxGapHours
          }h.`
        : `Gap of ${maxGapDays} day(s) exceeds ${config.maxGapHours}h${
            firstBadGap
              ? ` (between dayId ${firstBadGap.fromDay} and ${firstBadGap.toDay})`
              : ""
          }.`,
      value: maxGapDays,
      bound: `≤ ${Math.floor(config.maxGapHours / 24)} days`,
      weight: 1.2
    });
  }

  // E.2 — per-metric data density. We use the dataFlags presence bits, not
  // metric-value-zero, because zero is a legitimate value for awakeMins,
  // exerciseMins, etc.
  for (const [metric, minProportion] of Object.entries(config.minCoverage)) {
    const presenceMask = PRESENCE_MASK[metric];
    if (presenceMask === undefined) continue;
    let present = 0;
    for (const l of leaves) {
      if ((l.dataFlags & presenceMask) !== 0) present++;
    }
    const proportion = present / leaves.length;
    const ok = proportion >= minProportion;
    results.push({
      id: `E.2.${metric}`,
      category: "E",
      name: `Data density — ${metric}`,
      status: ok ? "pass" : "warn",
      message: ok
        ? `${metric} present on ${(proportion * 100).toFixed(1)}% of days (≥ ${(
            minProportion * 100
          ).toFixed(0)}%).`
        : `${metric} present on only ${(proportion * 100).toFixed(1)}% of days (< ${(
            minProportion * 100
          ).toFixed(0)}%).`,
      value: Math.round(proportion * 1000) / 1000,
      bound: `≥ ${(minProportion * 100).toFixed(0)}%`,
      weight: 0.8
    });
  }

  // E.3 — device source consistency
  {
    const counts = new Map<string, number>();
    for (const l of leaves) {
      const key = l.sourceHash.toString("hex");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const total = leaves.length;
    const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const dominantProportion = dominant ? dominant[1] / total : 0;
    const distinctSources = counts.size;

    // Same primary source across ≥ 95% of days, and at most 2 distinct
    // sources observed in the window. Real users sometimes carry a second
    // watch for a few days; > 2 sources or a primary < 95% flags.
    const ok = dominantProportion >= 0.95 && distinctSources <= 2;
    results.push({
      id: "E.3",
      category: "E",
      name: "Device source consistency",
      status: ok ? "pass" : "fail",
      message: ok
        ? `Primary source covers ${(dominantProportion * 100).toFixed(1)}% of days; ${distinctSources} distinct source(s).`
        : `Primary source covers only ${(dominantProportion * 100).toFixed(1)}% of days; ${distinctSources} distinct source(s) observed.`,
      value: `${(dominantProportion * 100).toFixed(1)}% / ${distinctSources}`,
      bound: `≥ 95% / ≤ 2`,
      weight: 1.5
    });
  }

  return results;
}

/**
 * dataFlags bit positions used by the synthetic generator and (per the
 * Layer 0 PROJECT_STATE notes) by MerkleNormalizationService when populating
 * presence flags from HealthKit. Low byte mirrors v1; bits 16+ encode the
 * v2 metric presence flags.
 */
const PRESENCE_MASK: Record<string, number> = {
  steps: 1 << 0,
  activeEnergy: 1 << 1,
  exerciseMins: 1 << 2,
  hrv: 1 << 3,
  restingHR: 1 << 4,
  sleepMins: 1 << 5,
  workoutCount: 1 << 6,
  vo2max: 1 << 16,
  weight: 1 << 17,
  bodyFatPct: 1 << 18,
  leanMass: 1 << 19,
  sleepStages: 1 << 20
};
