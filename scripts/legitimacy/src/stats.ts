/**
 * Statistics helpers used across categories B, C, and D.
 *
 * We import a few primitives from `simple-statistics` (mean, sample variance,
 * sample standard deviation) and build the rest in-house — Pearson
 * correlation, coefficient of variation, mode-fraction, autocorrelation.
 *
 * All functions accept and return primitive `number[]`. Wire-unit integers
 * stay integers in the inputs; conversions to physical units happen at the
 * call site (see checks/categoryB.ts where mean bounds use wire units to
 * avoid double conversion).
 */

import * as ss from "simple-statistics";

/** Filter out NaN and 0-as-missing markers when the metric uses 0 = absent. */
export function nonZero(values: number[]): number[] {
  return values.filter((v) => Number.isFinite(v) && v !== 0);
}

export function mean(values: number[]): number {
  if (values.length === 0) return NaN;
  return ss.mean(values);
}

export function stdev(values: number[]): number {
  if (values.length < 2) return NaN;
  return ss.sampleStandardDeviation(values);
}

/** Coefficient of variation = stdev / |mean|. NaN when mean is zero. */
export function coefficientOfVariation(values: number[]): number {
  const m = mean(values);
  if (!Number.isFinite(m) || m === 0) return NaN;
  const s = stdev(values);
  if (!Number.isFinite(s)) return NaN;
  return Math.abs(s / m);
}

/** Pearson correlation coefficient. Returns NaN if either series has no variance. */
export function pearson(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length) {
    throw new Error("pearson: arrays must have equal length");
  }
  if (xs.length < 3) return NaN;

  const mx = mean(xs);
  const my = mean(ys);

  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  if (denom === 0) return NaN;
  return num / denom;
}

/**
 * Largest absolute day-over-day delta in a series. Used by B.4 step-change
 * checks. Skips NaN values; treats zero entries as missing if `skipZero` is
 * true (most metrics use 0 to mark absence).
 */
export function maxAbsoluteDelta(
  values: number[],
  options: { skipZero?: boolean } = {}
): number {
  const skipZero = options.skipZero ?? false;
  let prev: number | null = null;
  let maxDelta = 0;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (skipZero && v === 0) continue;
    if (prev !== null) {
      const d = Math.abs(v - prev);
      if (d > maxDelta) maxDelta = d;
    }
    prev = v;
  }
  return maxDelta;
}

/**
 * Range of a series (max − min). Returns 0 for an empty / single-point
 * series. NaN values are skipped.
 */
export function range(values: number[]): number {
  let min = Infinity;
  let max = -Infinity;
  let count = 0;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
    count++;
  }
  if (count < 2) return 0;
  return max - min;
}

/**
 * Fraction of samples that share the most common value (the mode-fraction).
 * Used by B.3 to detect degenerate distributions.
 */
export function modeFraction(values: number[]): number {
  if (values.length === 0) return 0;
  const counts = new Map<number, number>();
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let max = 0;
  let total = 0;
  for (const c of counts.values()) {
    total += c;
    if (c > max) max = c;
  }
  if (total === 0) return 0;
  return max / total;
}

/**
 * Variance ratio between two halves of a window, used as a coarse change-
 * detection indicator. Returns the ratio (later half variance) / (earlier
 * half variance). 1 = identical spread, very small = collapse, very large
 * = sudden spread.
 */
export function halfWindowVarianceRatio(values: number[]): number {
  if (values.length < 6) return NaN;
  const mid = Math.floor(values.length / 2);
  const first = values.slice(0, mid);
  const second = values.slice(mid);
  const v1 = ss.sampleVariance(first);
  const v2 = ss.sampleVariance(second);
  if (v1 === 0 && v2 === 0) return 1;
  if (v1 === 0) return Infinity;
  return v2 / v1;
}

/**
 * Lag-1 autocorrelation: Pearson correlation between values[i] and
 * values[i+1]. Real biometric series have positive lag-1 autocorrelation
 * (today's RHR is close to yesterday's); pure random series have ~0.
 *
 * Used by D.5 to catch A1-style "no temporal coherence" datasets that
 * otherwise look fine on per-day distributions.
 */
export function lag1Autocorrelation(values: number[]): number {
  const filtered = values.filter((v) => Number.isFinite(v) && v !== 0);
  if (filtered.length < 6) return NaN;
  const a = filtered.slice(0, -1);
  const b = filtered.slice(1);
  return pearson(a, b);
}

/**
 * Linear regression slope using least-squares. Used to test directional
 * trends, e.g. RHR drifting downward as fitness improves.
 */
export function trendSlope(values: number[]): number {
  if (values.length < 2) return 0;
  const xs = values.map((_, i) => i);
  const m = mean(xs);
  const my = mean(values);
  let num = 0;
  let den = 0;
  for (let i = 0; i < values.length; i++) {
    const dx = xs[i] - m;
    num += dx * (values[i] - my);
    den += dx * dx;
  }
  if (den === 0) return 0;
  return num / den;
}
