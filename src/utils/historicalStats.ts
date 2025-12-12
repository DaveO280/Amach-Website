import { MetricSample } from "@/agents/types";

export interface HistoricalBaseline {
  min: number;
  max: number;
  mean: number;
  p25: number; // 25th percentile
  p50: number; // median
  p75: number; // 75th percentile
  sampleCount: number;
  firstDate: Date;
  lastDate: Date;
}

export interface TrendAnalysis {
  direction: "improving" | "declining" | "stable";
  changePercent: number;
  recentMean: number;
  historicalMean: number;
}

export interface Milestone {
  type: "peak" | "low";
  value: number;
  date: Date;
  daysAgo: number;
}

export interface HistoricalContext {
  baseline: HistoricalBaseline;
  trend30d?: TrendAnalysis;
  trend90d?: TrendAnalysis;
  milestones: Milestone[];
}

/**
 * Calculate baseline statistics from a dataset
 */
export function calculateBaseline(
  samples: MetricSample[],
): HistoricalBaseline | null {
  if (samples.length === 0) {
    return null;
  }

  const values = samples.map((s) => s.value).sort((a, b) => a - b);
  const dates = samples
    .map((s) => s.timestamp)
    .sort((a, b) => a.getTime() - b.getTime());

  const sum = values.reduce((acc, val) => acc + val, 0);
  const mean = sum / values.length;

  const p25Index = Math.floor(values.length * 0.25);
  const p50Index = Math.floor(values.length * 0.5);
  const p75Index = Math.floor(values.length * 0.75);

  return {
    min: values[0],
    max: values[values.length - 1],
    mean,
    p25: values[p25Index],
    p50: values[p50Index],
    p75: values[p75Index],
    sampleCount: values.length,
    firstDate: dates[0],
    lastDate: dates[dates.length - 1],
  };
}

/**
 * Analyze trend by comparing recent period to historical baseline
 */
export function analyzeTrend(
  recentSamples: MetricSample[],
  historicalSamples: MetricSample[],
  improveDirection: "higher" | "lower" = "higher",
): TrendAnalysis | null {
  if (recentSamples.length === 0 || historicalSamples.length === 0) {
    return null;
  }

  const recentMean =
    recentSamples.reduce((acc, s) => acc + s.value, 0) / recentSamples.length;
  const historicalMean =
    historicalSamples.reduce((acc, s) => acc + s.value, 0) /
    historicalSamples.length;

  const changePercent = ((recentMean - historicalMean) / historicalMean) * 100;

  let direction: "improving" | "declining" | "stable";

  // Define stable as within ±5%
  if (Math.abs(changePercent) < 5) {
    direction = "stable";
  } else if (improveDirection === "higher") {
    direction = changePercent > 0 ? "improving" : "declining";
  } else {
    direction = changePercent < 0 ? "improving" : "declining";
  }

  return {
    direction,
    changePercent,
    recentMean,
    historicalMean,
  };
}

/**
 * Identify peak and low milestones from dataset
 */
export function findMilestones(
  samples: MetricSample[],
  limit: number = 3,
): Milestone[] {
  if (samples.length === 0) {
    return [];
  }

  const now = new Date();
  const sortedByValue = [...samples].sort((a, b) => b.value - a.value);

  const milestones: Milestone[] = [];

  // Find peak values
  for (let i = 0; i < Math.min(limit, sortedByValue.length); i++) {
    const sample = sortedByValue[i];
    const daysAgo = Math.floor(
      (now.getTime() - sample.timestamp.getTime()) / (1000 * 60 * 60 * 24),
    );
    milestones.push({
      type: "peak",
      value: sample.value,
      date: sample.timestamp,
      daysAgo,
    });
  }

  // Find low values
  for (
    let i = sortedByValue.length - 1;
    i >= Math.max(0, sortedByValue.length - limit);
    i--
  ) {
    const sample = sortedByValue[i];
    const daysAgo = Math.floor(
      (now.getTime() - sample.timestamp.getTime()) / (1000 * 60 * 60 * 24),
    );
    milestones.push({
      type: "low",
      value: sample.value,
      date: sample.timestamp,
      daysAgo,
    });
  }

  return milestones.sort((a, b) => a.daysAgo - b.daysAgo);
}

/**
 * Generate complete historical context for a metric
 */
export function generateHistoricalContext(
  allSamples: MetricSample[],
  improveDirection: "higher" | "lower" = "higher",
): HistoricalContext | null {
  if (allSamples.length === 0) {
    return null;
  }

  const baseline = calculateBaseline(allSamples);
  if (!baseline) {
    return null;
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const recent30d = allSamples.filter((s) => s.timestamp >= thirtyDaysAgo);
  const recent90d = allSamples.filter((s) => s.timestamp >= ninetyDaysAgo);
  const historical = allSamples.filter((s) => s.timestamp < ninetyDaysAgo);

  const trend30d =
    recent30d.length >= 5 && historical.length >= 5
      ? (analyzeTrend(recent30d, historical, improveDirection) ?? undefined)
      : undefined;

  const trend90d =
    recent90d.length >= 5 && historical.length >= 5
      ? (analyzeTrend(recent90d, historical, improveDirection) ?? undefined)
      : undefined;

  const milestones = findMilestones(allSamples, 3);

  return {
    baseline,
    trend30d,
    trend90d,
    milestones,
  };
}

/**
 * Compare a current value to its historical baseline
 */
export function compareToBaseline(
  currentValue: number,
  baseline: HistoricalBaseline,
): {
  percentile: number;
  vsMin: number;
  vsMax: number;
  vsMean: number;
  description: string;
} {
  const percentile = ((): number => {
    if (currentValue <= baseline.p25) return 25;
    if (currentValue <= baseline.p50) return 50;
    if (currentValue <= baseline.p75) return 75;
    return 100;
  })();

  const vsMin = currentValue - baseline.min;
  const vsMax = currentValue - baseline.max;
  const vsMean = currentValue - baseline.mean;

  let description: string;
  if (percentile <= 25) {
    description = "in the lowest 25% of your historical range";
  } else if (percentile <= 50) {
    description = "below your typical range";
  } else if (percentile <= 75) {
    description = "above your typical range";
  } else {
    description = "in the highest 25% of your historical range";
  }

  return {
    percentile,
    vsMin,
    vsMax,
    vsMean,
    description,
  };
}
