/**
 * Category C — multi-metric correlations.
 *
 * Real human physiology produces correlated signals. Fabricated data tends
 * to break these correlations because they're hard to mimic without a model
 * of how training adaptations propagate.
 *
 *   C.1 RHR–HRV inverse correlation (per-day)
 *   C.2 VO2 max ↔ RHR over time (long-window)
 *   C.3 VO2 max ↔ HRV over time (long-window)
 *   C.4 Active energy ↔ exercise minutes (mechanical link)
 *   C.5 Sleep stage internal consistency (totals + Ohayon proportions)
 *   C.6 Body weight ≈ lean mass + fat mass coherence
 *   C.7 Workout signature plausibility (HR ramp/sustain/recovery — coarse,
 *       since we don't have intra-workout HR samples in v2 leaves yet)
 */

import type { CheckResult, LegitimacyConfig } from "../types";
import type { AmachLeafV2 } from "../types";
import { mean, pearson } from "../stats";

interface CTuple {
  xs: number[];
  ys: number[];
}

/** Build a paired series from two leaf metrics, dropping rows where either is 0/missing. */
function paired(
  leaves: AmachLeafV2[],
  a: keyof AmachLeafV2 & string,
  b: keyof AmachLeafV2 & string
): CTuple {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const l of leaves) {
    const va = l[a] as number;
    const vb = l[b] as number;
    if (Number.isFinite(va) && Number.isFinite(vb) && va !== 0 && vb !== 0) {
      xs.push(va);
      ys.push(vb);
    }
  }
  return { xs, ys };
}

export function runCategoryC(
  leaves: AmachLeafV2[],
  config: LegitimacyConfig
): CheckResult[] {
  const results: CheckResult[] = [];

  // C.1 — RHR ↔ HRV inverse correlation
  {
    const { xs, ys } = paired(leaves, "restingHR", "hrv");
    if (xs.length < 10) {
      results.push({
        id: "C.1",
        category: "C",
        name: "RHR–HRV inverse correlation",
        status: "warn",
        message: `Only ${xs.length} paired RHR/HRV days; need ≥ 10 for a stable correlation.`,
        weight: 1.0
      });
    } else {
      const r = pearson(xs, ys);
      const ok = r <= config.correlations.rhrHrvInverseMin;
      results.push({
        id: "C.1",
        category: "C",
        name: "RHR–HRV inverse correlation",
        status: ok ? "pass" : "fail",
        message: ok
          ? `Pearson r = ${r.toFixed(3)} (≤ ${config.correlations.rhrHrvInverseMin}, expected negative).`
          : `Pearson r = ${r.toFixed(3)} fails inverse-correlation expectation (need ≤ ${config.correlations.rhrHrvInverseMin}).`,
        value: Math.round(r * 1000) / 1000,
        bound: `≤ ${config.correlations.rhrHrvInverseMin}`,
        source: "Schmitt et al. 2013; Lehrer & Eddie 2013",
        weight: 3.0
      });
    }
  }

  // C.2 — VO2 max ↔ RHR (long-window)
  {
    const { xs, ys } = paired(leaves, "vo2max", "restingHR");
    if (xs.length < 6) {
      results.push({
        id: "C.2",
        category: "C",
        name: "VO2 max ↔ RHR over time",
        status: "warn",
        message: `Only ${xs.length} paired VO2/RHR days; need ≥ 6.`,
        weight: 1.0
      });
    } else {
      const r = pearson(xs, ys);
      const ok = r <= config.correlations.vo2RhrInverseMin;
      results.push({
        id: "C.2",
        category: "C",
        name: "VO2 max ↔ RHR over time",
        status: ok ? "pass" : "fail",
        message: ok
          ? `Pearson r = ${r.toFixed(3)} (≤ ${config.correlations.vo2RhrInverseMin}).`
          : `Pearson r = ${r.toFixed(3)} fails inverse-trend expectation (need ≤ ${config.correlations.vo2RhrInverseMin}).`,
        value: Math.round(r * 1000) / 1000,
        bound: `≤ ${config.correlations.vo2RhrInverseMin}`,
        source: "ACSM 11e ch. 6",
        weight: 1.5
      });
    }
  }

  // C.3 — VO2 max ↔ HRV (long-window, positive)
  {
    const { xs, ys } = paired(leaves, "vo2max", "hrv");
    if (xs.length < 6) {
      results.push({
        id: "C.3",
        category: "C",
        name: "VO2 max ↔ HRV over time",
        status: "warn",
        message: `Only ${xs.length} paired VO2/HRV days; need ≥ 6.`,
        weight: 1.0
      });
    } else {
      const r = pearson(xs, ys);
      const ok = r >= config.correlations.vo2HrvPositiveMin;
      results.push({
        id: "C.3",
        category: "C",
        name: "VO2 max ↔ HRV over time",
        status: ok ? "pass" : "fail",
        message: ok
          ? `Pearson r = ${r.toFixed(3)} (≥ ${config.correlations.vo2HrvPositiveMin}).`
          : `Pearson r = ${r.toFixed(3)} fails positive-trend expectation (need ≥ ${config.correlations.vo2HrvPositiveMin}).`,
        value: Math.round(r * 1000) / 1000,
        bound: `≥ ${config.correlations.vo2HrvPositiveMin}`,
        source: "Buchheit 2014, Sport Med",
        weight: 1.5
      });
    }
  }

  // C.4 — active energy ↔ exercise minutes (mechanical link)
  {
    const { xs, ys } = paired(leaves, "activeEnergy", "exerciseMins");
    if (xs.length < 10) {
      results.push({
        id: "C.4",
        category: "C",
        name: "Active energy ↔ exercise minutes",
        status: "warn",
        message: `Only ${xs.length} paired energy/exercise days; need ≥ 10.`,
        weight: 1.0
      });
    } else {
      const r = pearson(xs, ys);
      const ok = r >= config.correlations.activeEnergyExerciseMin;
      results.push({
        id: "C.4",
        category: "C",
        name: "Active energy ↔ exercise minutes",
        status: ok ? "pass" : "fail",
        message: ok
          ? `Pearson r = ${r.toFixed(3)} (≥ ${config.correlations.activeEnergyExerciseMin}).`
          : `Pearson r = ${r.toFixed(3)} unexpectedly weak (need ≥ ${config.correlations.activeEnergyExerciseMin}).`,
        value: Math.round(r * 1000) / 1000,
        bound: `≥ ${config.correlations.activeEnergyExerciseMin}`,
        source: "Apple Health implementation; Plasqui & Westerterp 2007",
        weight: 1.0
      });
    }
  }

  // C.5 — sleep stage internal consistency
  {
    const sleepDays = leaves.filter(
      (l) =>
        l.sleepMins > 0 &&
        l.deepSleepMins + l.remSleepMins + l.lightSleepMins + l.awakeMins > 0
    );
    if (sleepDays.length < 5) {
      results.push({
        id: "C.5",
        category: "C",
        name: "Sleep stage internal consistency",
        status: "warn",
        message: `Only ${sleepDays.length} days with sleep stage breakdown; need ≥ 5.`,
        weight: 1.0
      });
    } else {
      let sumViolations = 0;
      let proportionViolations = 0;
      const tol = config.sleepStages.sumTolerance;
      for (const l of sleepDays) {
        const sumStages =
          l.deepSleepMins + l.remSleepMins + l.lightSleepMins + l.awakeMins;
        const total = l.sleepMins;
        if (total > 0) {
          const dev = Math.abs(total - sumStages) / total;
          if (dev > tol) sumViolations++;
        }
        const denom = sumStages > 0 ? sumStages : 1;
        const dFrac = l.deepSleepMins / denom;
        const rFrac = l.remSleepMins / denom;
        const lFrac = l.lightSleepMins / denom;
        const aFrac = l.awakeMins / denom;
        if (
          dFrac < config.sleepStages.deepMin ||
          dFrac > config.sleepStages.deepMax ||
          rFrac < config.sleepStages.remMin ||
          rFrac > config.sleepStages.remMax ||
          lFrac < config.sleepStages.lightMin ||
          lFrac > config.sleepStages.lightMax ||
          aFrac > config.sleepStages.awakeMaxProportion
        ) {
          proportionViolations++;
        }
      }
      const total = sleepDays.length;
      // Allow some noise — fail when more than 25% of days are out of bounds.
      const ok = sumViolations / total <= 0.25 && proportionViolations / total <= 0.3;
      results.push({
        id: "C.5",
        category: "C",
        name: "Sleep stage internal consistency",
        status: ok ? "pass" : "fail",
        message: ok
          ? `Sum violations ${sumViolations}/${total}, proportion violations ${proportionViolations}/${total} within tolerance.`
          : `Stage sums or proportions out of range: ${sumViolations} sum, ${proportionViolations} proportion violations across ${total} days.`,
        value: `${sumViolations}+${proportionViolations}/${total}`,
        bound: `sum ≤ 25%, prop ≤ 30%`,
        source: "Ohayon et al. 2004",
        weight: 1.0
      });
    }
  }

  // C.6 — body weight = lean mass + fat mass coherence
  {
    const days = leaves.filter(
      (l) => l.weight > 0 && l.leanMass > 0 && l.bodyFatPct > 0
    );
    if (days.length < 3) {
      results.push({
        id: "C.6",
        category: "C",
        name: "Body weight ≈ lean + fat mass coherence",
        status: "warn",
        message: `Only ${days.length} days with full body-comp triplet; need ≥ 3.`,
        weight: 0.8
      });
    } else {
      let violations = 0;
      for (const l of days) {
        // weight in grams ÷ 10 → kg = weight / 100
        const weightKg = l.weight / 100;
        const leanKg = l.leanMass / 100;
        const fatPct = l.bodyFatPct / 10000;
        const fatKg = weightKg * fatPct;
        const expectedKg = leanKg + fatKg;
        const dev = Math.abs(weightKg - expectedKg) / weightKg;
        if (dev > config.bodyComp.massTolerance) violations++;
      }
      const ok = violations / days.length <= 0.2;
      results.push({
        id: "C.6",
        category: "C",
        name: "Body weight ≈ lean + fat mass coherence",
        status: ok ? "pass" : "fail",
        message: ok
          ? `Mass-balance violations ${violations}/${days.length} within tolerance.`
          : `${violations}/${days.length} days violate mass balance > ${(
              config.bodyComp.massTolerance * 100
            ).toFixed(0)}%.`,
        value: `${violations}/${days.length}`,
        bound: `≤ ${(config.bodyComp.massTolerance * 100).toFixed(0)}% / day`,
        source: "ACSM 11e ch. 4 (body comp)",
        weight: 0.8
      });
    }
  }

  // C.7 — workout signature plausibility. v2 leaves do not carry intra-
  // session HR samples, so we approximate with a population check: workout
  // days should have meaningfully more exercise minutes than rest days.
  // Threshold: workout-day mean ≥ 15 minutes AND strictly greater than
  // rest-day mean (any inversion is the diagnostic flag).
  {
    const workoutDays = leaves.filter((l) => l.workoutCount > 0);
    const restDays = leaves.filter((l) => l.workoutCount === 0);
    if (workoutDays.length < 3 || restDays.length < 3) {
      results.push({
        id: "C.7",
        category: "C",
        name: "Workout signature plausibility",
        status: "warn",
        message: `Need ≥ 3 workout and ≥ 3 rest days; observed ${workoutDays.length} / ${restDays.length}.`,
        weight: 0.7
      });
    } else {
      const meanWorkout = mean(workoutDays.map((l) => l.exerciseMins));
      const meanRest = mean(restDays.map((l) => l.exerciseMins));
      const ok = meanWorkout >= 15 && meanWorkout > meanRest;
      results.push({
        id: "C.7",
        category: "C",
        name: "Workout signature plausibility",
        status: ok ? "pass" : "fail",
        message: ok
          ? `Workout-day mean ${meanWorkout.toFixed(1)} min vs rest-day mean ${meanRest.toFixed(1)} min — coherent signature.`
          : `Workout-day mean ${meanWorkout.toFixed(1)} min vs rest-day mean ${meanRest.toFixed(1)} min — inversion or insufficient delta.`,
        value: Math.round(meanWorkout * 10) / 10,
        bound: `≥ 15 mins, > rest-day mean`,
        weight: 0.7
      });
    }
  }

  return results;
}
