/**
 * Category D — temporal patterns.
 *
 *   D.1 Diurnal HR rhythm (HR drops during sleep, rises during awake).
 *       v2 leaves don't carry intra-day HR samples; we proxy via the
 *       relationship between sleepMins and restingHR (more sleep → lower
 *       RHR holds population-wise). Returns "warn" when there isn't enough
 *       intra-day signal.
 *
 *   D.2 Weekday/weekend variation in activity metrics.
 *
 *   D.3 Sleep timing consistency. v2 leaves don't carry bedtime; we
 *       approximate with day-over-day stability of sleepMins, which proxies
 *       schedule consistency reasonably.
 *
 *   D.4 Commit timestamp distribution — if commitTimestamps were supplied,
 *       check they aren't backloaded into the final week of the window.
 */

import type { CheckResult, LegitimacyConfig } from "../types";
import type { AmachLeafV2 } from "../types";
import { lag1Autocorrelation, mean, pearson, stdev } from "../stats";

export function runCategoryD(
  leaves: AmachLeafV2[],
  config: LegitimacyConfig,
  commitTimestamps?: number[]
): CheckResult[] {
  const results: CheckResult[] = [];

  // D.1 — diurnal proxy via RHR-vs-sleep
  {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const l of leaves) {
      if (l.restingHR > 0 && l.sleepMins > 0) {
        xs.push(l.sleepMins);
        ys.push(l.restingHR);
      }
    }
    if (xs.length < 14) {
      results.push({
        id: "D.1",
        category: "D",
        name: "Diurnal HR rhythm proxy (RHR vs sleep)",
        status: "warn",
        message: `Only ${xs.length} paired RHR/sleep days; need ≥ 14 for stable estimate.`,
        weight: 0.8
      });
    } else {
      const r = pearson(xs, ys);
      // We expect a soft negative association at a population level. A
      // strong positive correlation is what flags. 0 correlation is noise
      // and warns rather than fails.
      let status: "pass" | "warn" | "fail" = "pass";
      let message: string;
      if (r > 0.4) {
        status = "fail";
        message = `RHR rises with sleep (r = ${r.toFixed(3)}) — implausible diurnal pattern.`;
      } else if (r > 0.1) {
        status = "warn";
        message = `RHR ↔ sleep correlation r = ${r.toFixed(3)} weakly positive; expected ≤ 0.`;
      } else {
        message = `RHR ↔ sleep correlation r = ${r.toFixed(3)} consistent with normal diurnal pattern.`;
      }
      results.push({
        id: "D.1",
        category: "D",
        name: "Diurnal HR rhythm proxy (RHR vs sleep)",
        status,
        message,
        value: Math.round(r * 1000) / 1000,
        bound: `≤ 0.1 expected`,
        source: "Sayers 1973; Hjortskov et al. 2004",
        weight: 0.8
      });
    }
  }

  // D.2 — weekday/weekend variation. Steps and activeEnergy should differ.
  {
    const wkSteps: number[] = [];
    const weSteps: number[] = [];
    for (const l of leaves) {
      // dayId 0 corresponds to a known weekday-of-week mapping. We reuse the
      // synthetic generator's convention: dayId % 7 ∈ {5,6} = weekend. This
      // is consistent with the iOS pipeline's epoch-day reference (Mon=0).
      const dow = ((l.dayId % 7) + 7) % 7;
      const isWeekend = dow === 5 || dow === 6;
      if (l.steps > 0) {
        if (isWeekend) weSteps.push(l.steps);
        else wkSteps.push(l.steps);
      }
    }
    if (wkSteps.length < 5 || weSteps.length < 2) {
      results.push({
        id: "D.2",
        category: "D",
        name: "Weekday/weekend variation",
        status: "warn",
        message: `Insufficient split — ${wkSteps.length} weekday vs ${weSteps.length} weekend days.`,
        weight: 1.0
      });
    } else {
      const wkMean = mean(wkSteps);
      const weMean = mean(weSteps);
      const totalMean = (wkMean + weMean) / 2;
      const diff = Math.abs(wkMean - weMean) / Math.max(totalMean, 1);
      // Real users vary at least ~3% between weekdays and weekends. Identical
      // averages are suspicious (they suggest copy-paste or pure-random
      // synthesis).
      const ok = diff >= 0.03;
      results.push({
        id: "D.2",
        category: "D",
        name: "Weekday/weekend variation",
        status: ok ? "pass" : "fail",
        message: ok
          ? `Weekday/weekend step deltas ${(diff * 100).toFixed(1)}% indicate real schedule variation.`
          : `Weekday/weekend step deltas ${(diff * 100).toFixed(1)}% are too uniform (< 3%) — implausible behavior signal.`,
        value: Math.round(diff * 1000) / 1000,
        bound: `≥ 3% delta`,
        source: "Tudor-Locke et al. 2011",
        weight: 1.0
      });
    }
  }

  // D.3 — sleep timing consistency. We use coefficient-of-variation of
  // sleep minutes as a stand-in for bedtime consistency. Real schedules
  // produce CV roughly 0.06–0.20; CV near 0 is suspect (mathematical
  // smoothing) and CV > 0.4 is probably night-shift or genuinely irregular.
  {
    const sleepDays = leaves.filter((l) => l.sleepMins > 0).map((l) => l.sleepMins);
    if (sleepDays.length < 14) {
      results.push({
        id: "D.3",
        category: "D",
        name: "Sleep timing consistency",
        status: "warn",
        message: `Only ${sleepDays.length} sleep days; need ≥ 14.`,
        weight: 0.7
      });
    } else {
      const m = mean(sleepDays);
      const s = stdev(sleepDays);
      const cv = m === 0 ? 0 : s / m;
      let status: "pass" | "warn" | "fail" = "pass";
      let message: string;
      if (cv < 0.02) {
        status = "fail";
        message = `Sleep CV ${cv.toFixed(3)} is implausibly uniform.`;
      } else if (cv > 0.45) {
        status = "warn";
        message = `Sleep CV ${cv.toFixed(3)} is unusually variable — atypical schedule.`;
      } else {
        message = `Sleep CV ${cv.toFixed(3)} consistent with normal day-to-day schedule variation.`;
      }
      results.push({
        id: "D.3",
        category: "D",
        name: "Sleep timing consistency",
        status,
        message,
        value: Math.round(cv * 1000) / 1000,
        bound: `0.02–0.45`,
        source: "Stamatakis & Punjabi 2010",
        weight: 0.7
      });
    }
  }

  // D.5 — temporal coherence via lag-1 autocorrelation of RHR (or steps
  // when RHR is too sparse). Real biometric data shows lag-1 autocorrelation
  // typically in [0.3, 0.7]; pure random data sits near 0. The check fires
  // when the autocorrelation is essentially zero in any of the diagnostic
  // series.
  {
    const rhrSeries = leaves
      .slice()
      .sort((a, b) => a.dayId - b.dayId)
      .map((l) => l.restingHR)
      .filter((v) => v > 0);
    const stepsSeries = leaves
      .slice()
      .sort((a, b) => a.dayId - b.dayId)
      .map((l) => l.steps)
      .filter((v) => v > 0);
    if (rhrSeries.length < 14 && stepsSeries.length < 14) {
      results.push({
        id: "D.5",
        category: "D",
        name: "Temporal coherence (lag-1 autocorrelation)",
        status: "warn",
        message: `Insufficient data for autocorrelation (need ≥ 14 days RHR or steps).`,
        weight: 1.0
      });
    } else {
      const rhrAc = rhrSeries.length >= 14 ? lag1Autocorrelation(rhrSeries) : NaN;
      const stepsAc =
        stepsSeries.length >= 14 ? lag1Autocorrelation(stepsSeries) : NaN;
      // Real RHR autocorrelation is high (≥ 0.3); steps lag-1 is lower
      // (~0.1) because activity varies day-to-day. We accept either being
      // strong, but reject if both are essentially zero.
      const rhrOk = Number.isFinite(rhrAc) && rhrAc >= 0.15;
      const stepsOk = Number.isFinite(stepsAc) && stepsAc >= 0.05;
      const ok = rhrOk || stepsOk;
      results.push({
        id: "D.5",
        category: "D",
        name: "Temporal coherence (lag-1 autocorrelation)",
        status: ok ? "pass" : "fail",
        message: ok
          ? `Lag-1 autocorrelation OK — RHR ${rhrAc.toFixed(2)}, steps ${stepsAc.toFixed(2)}.`
          : `Lag-1 autocorrelation absent — RHR ${rhrAc.toFixed(2)}, steps ${stepsAc.toFixed(2)}; data lacks temporal coherence.`,
        value: `${Number.isFinite(rhrAc) ? rhrAc.toFixed(2) : "NA"}/${
          Number.isFinite(stepsAc) ? stepsAc.toFixed(2) : "NA"
        }`,
        bound: `RHR ≥ 0.15 or steps ≥ 0.05`,
        source: "Stamatakis & Punjabi 2010",
        weight: 2.0
      });
    }
  }

  // D.4 — commit timestamp distribution. Skipped if not provided.
  if (!commitTimestamps || commitTimestamps.length === 0) {
    results.push({
      id: "D.4",
      category: "D",
      name: "Commit timestamp distribution",
      status: "warn",
      message: "No commit timestamps supplied; check skipped.",
      weight: 0.5
    });
  } else if (commitTimestamps.length < 4) {
    results.push({
      id: "D.4",
      category: "D",
      name: "Commit timestamp distribution",
      status: "warn",
      message: `Only ${commitTimestamps.length} commit timestamps; need ≥ 4.`,
      weight: 0.5
    });
  } else {
    const sorted = commitTimestamps.slice().sort((a, b) => a - b);
    const start = sorted[0];
    const end = sorted[sorted.length - 1];
    const span = Math.max(1, end - start);
    const lastWeekStart = end - 7 * 24 * 3600;
    const lastWeekCommits = sorted.filter((t) => t >= lastWeekStart).length;
    const proportion = lastWeekCommits / sorted.length;
    const ok = proportion <= config.maxBackloadProportion;
    results.push({
      id: "D.4",
      category: "D",
      name: "Commit timestamp distribution",
      status: ok ? "pass" : "fail",
      message: ok
        ? `${lastWeekCommits}/${sorted.length} commits (${(proportion * 100).toFixed(1)}%) in final week — within bound.`
        : `${lastWeekCommits}/${sorted.length} commits (${(proportion * 100).toFixed(1)}%) backloaded into final week (> ${(config.maxBackloadProportion * 100).toFixed(0)}%).`,
      value: Math.round(proportion * 1000) / 1000,
      bound: `≤ ${(config.maxBackloadProportion * 100).toFixed(0)}%`,
      weight: 1.0,
      source: `commit span ${span}s`
    });
  }

  return results;
}
