import { BaseHealthAgent } from "./BaseHealthAgent";
import type {
  AgentDataQualityAssessment,
  AgentExecutionContext,
  AgentInsight,
  AppleHealthMetricMap,
  MetricSample,
} from "./types";
import {
  generateHistoricalContext,
  type HistoricalContext,
} from "@/utils/historicalStats";

interface DailyActivitySummary {
  date: string;
  steps: number | null;
  activeEnergy: number | null;
  exerciseMinutes: number | null;
}

interface ActivityAverages {
  steps: number | null;
  activeEnergy: number | null;
  exerciseMinutes: number | null;
  hrv: number | null;
  restingHeartRate: number | null;
  highIntensityMinutes: number | null;
  moderateIntensityMinutes: number | null;
}

interface HeartRateZoneMinutes {
  zone1Minutes: number;
  zone2Minutes: number;
  zone3Minutes: number;
  zone4Minutes: number;
  zone5Minutes: number;
  totalMinutes: number;
}

function calculateHeartRateZones(
  maxHeartRate: number,
): Record<
  "zone1" | "zone2" | "zone3" | "zone4" | "zone5",
  { min: number; max: number }
> {
  return {
    zone1: { min: 0, max: Math.round(maxHeartRate * 0.6) },
    zone2: {
      min: Math.round(maxHeartRate * 0.6),
      max: Math.round(maxHeartRate * 0.7),
    },
    zone3: {
      min: Math.round(maxHeartRate * 0.7),
      max: Math.round(maxHeartRate * 0.8),
    },
    zone4: {
      min: Math.round(maxHeartRate * 0.8),
      max: Math.round(maxHeartRate * 0.9),
    },
    zone5: { min: Math.round(maxHeartRate * 0.9), max: maxHeartRate + 1 },
  };
}

function estimateHeartRateZoneMinutes(
  samples: MetricSample[],
  ageYears?: number,
): HeartRateZoneMinutes | undefined {
  if (!samples.length) {
    return undefined;
  }

  const sorted = [...samples].sort(
    (a, b) =>
      (a.timestamp instanceof Date ? a.timestamp.getTime() : 0) -
      (b.timestamp instanceof Date ? b.timestamp.getTime() : 0),
  );

  const estimatedAge = ageYears ?? 40;
  const maxHeartRate = Math.max(150, 220 - estimatedAge);
  const zones = calculateHeartRateZones(maxHeartRate);

  const totals: HeartRateZoneMinutes = {
    zone1Minutes: 0,
    zone2Minutes: 0,
    zone3Minutes: 0,
    zone4Minutes: 0,
    zone5Minutes: 0,
    totalMinutes: 0,
  };

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];

    const currentTs =
      current.timestamp instanceof Date ? current.timestamp.getTime() : NaN;
    const nextTs =
      next && next.timestamp instanceof Date ? next.timestamp.getTime() : NaN;

    let minutes = 1;
    if (!Number.isNaN(currentTs) && !Number.isNaN(nextTs)) {
      const diffMinutes = (nextTs - currentTs) / 60000;
      if (diffMinutes > 0 && diffMinutes < 10) {
        minutes = Math.max(0.5, Math.min(diffMinutes, 5));
      }
    }

    const hr = Number(current.value);
    if (Number.isNaN(hr)) {
      totals.totalMinutes += minutes;
      continue;
    }

    if (hr >= zones.zone5.min) {
      totals.zone5Minutes += minutes;
    } else if (hr >= zones.zone4.min) {
      totals.zone4Minutes += minutes;
    } else if (hr >= zones.zone3.min) {
      totals.zone3Minutes += minutes;
    } else if (hr >= zones.zone2.min) {
      totals.zone2Minutes += minutes;
    } else {
      totals.zone1Minutes += minutes;
    }
    totals.totalMinutes += minutes;
  }

  return totals;
}

export class ActivityEnergyAgent extends BaseHealthAgent {
  id = "activity_energy";
  name = "Activity & Energy Specialist";
  expertise = ["steps", "activity", "energy expenditure", "exercise"];
  systemPrompt = `You are an expert activity scientist and coach who interprets daily movement data, active energy expenditure, and exercise minutes.

You specialize in:
- Movement volume (step count, non-exercise activity)
- Structured exercise load and consistency
- Caloric expenditure from activity (kcal)
- Balancing training load with recovery and wellbeing
- Linking movement patterns to health outcomes

Tone requirements:
- Use a neutral, data-forward voice aligned with the Cosaint coordinator
- Prefer short, declarative sentences anchored in quantified evidence
- Avoid hype language or coaching cheerleading; focus on objective insight`;

  protected extractRelevantData(context: AgentExecutionContext): {
    summaries: DailyActivitySummary[];
    averages: ActivityAverages;
    coverage: {
      days: number;
      stepsDays: number;
      activeEnergyDays: number;
      exerciseDays: number;
      hrvDays: number;
      restingHeartRateDays: number;
    };
    recovery: {
      hrv: MetricSample[];
      restingHeartRate: MetricSample[];
    };
    appleHealth: AppleHealthMetricMap;
    heartRateZones?: HeartRateZoneMinutes;
    historicalContext?: {
      steps?: HistoricalContext;
      activeEnergy?: HistoricalContext;
      exerciseMinutes?: HistoricalContext;
      hrv?: HistoricalContext;
      restingHeartRate?: HistoricalContext;
    };
  } {
    const appleHealth = context.availableData.appleHealth ?? {};

    const stepsSamples = appleHealth.HKQuantityTypeIdentifierStepCount ?? [];
    const activeEnergySamples =
      appleHealth.HKQuantityTypeIdentifierActiveEnergyBurned ?? [];
    const exerciseSamples =
      appleHealth.HKQuantityTypeIdentifierAppleExerciseTime ?? [];
    const hrvSamples =
      appleHealth.HKQuantityTypeIdentifierHeartRateVariabilitySDNN ?? [];
    const restingHeartRateSamples =
      appleHealth.HKQuantityTypeIdentifierRestingHeartRate ?? [];
    const heartRateSamples =
      appleHealth.HKQuantityTypeIdentifierHeartRate ?? [];

    // Build daily summaries
    const dayKeys = new Set<string>();
    stepsSamples.forEach((sample) => dayKeys.add(this.dayKey(sample)));
    activeEnergySamples.forEach((sample) => dayKeys.add(this.dayKey(sample)));
    exerciseSamples.forEach((sample) => dayKeys.add(this.dayKey(sample)));

    const summaries: DailyActivitySummary[] = Array.from(dayKeys)
      .map((key) => ({
        date: key,
        // For aggregated data, value is already the daily/weekly/monthly average
        // For raw data, findValueForDay will sum all readings for that day
        steps: this.findValueForDay(stepsSamples, key),
        activeEnergy: this.findValueForDay(activeEnergySamples, key),
        exerciseMinutes: this.findValueForDay(exerciseSamples, key),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const coverage = {
      days: summaries.length,
      stepsDays: stepsSamples.length,
      activeEnergyDays: activeEnergySamples.length,
      exerciseDays: exerciseSamples.length,
      hrvDays: hrvSamples.length,
      restingHeartRateDays: restingHeartRateSamples.length,
    };

    const averages: ActivityAverages = {
      steps: this.averageValue(stepsSamples),
      activeEnergy: this.averageValue(activeEnergySamples),
      exerciseMinutes: this.averageValue(exerciseSamples),
      hrv: this.averageValue(hrvSamples),
      restingHeartRate: this.averageValue(restingHeartRateSamples),
      highIntensityMinutes: null,
      moderateIntensityMinutes: null,
    };

    const zoneMinutes = estimateHeartRateZoneMinutes(
      heartRateSamples,
      context.profile?.ageYears,
    );

    if (zoneMinutes && coverage.days > 0) {
      const highTotal = zoneMinutes.zone4Minutes + zoneMinutes.zone5Minutes;
      const moderateTotal = zoneMinutes.zone2Minutes + zoneMinutes.zone3Minutes;
      const divisor = Math.max(1, coverage.days);
      averages.highIntensityMinutes =
        Math.round((highTotal / divisor) * 10) / 10;
      averages.moderateIntensityMinutes =
        Math.round((moderateTotal / divisor) * 10) / 10;
    }

    // Generate historical context for key metrics
    const historicalContext: {
      steps?: HistoricalContext;
      activeEnergy?: HistoricalContext;
      exerciseMinutes?: HistoricalContext;
      hrv?: HistoricalContext;
      restingHeartRate?: HistoricalContext;
    } = {};

    // Steps: higher is better
    if (stepsSamples.length >= 30) {
      const ctx = generateHistoricalContext(stepsSamples, "higher");
      if (ctx) historicalContext.steps = ctx;
    }

    // Active energy: higher is better
    if (activeEnergySamples.length >= 30) {
      const ctx = generateHistoricalContext(activeEnergySamples, "higher");
      if (ctx) historicalContext.activeEnergy = ctx;
    }

    // Exercise minutes: higher is better
    if (exerciseSamples.length >= 30) {
      const ctx = generateHistoricalContext(exerciseSamples, "higher");
      if (ctx) historicalContext.exerciseMinutes = ctx;
    }

    // HRV: higher is better
    if (hrvSamples.length >= 30) {
      const ctx = generateHistoricalContext(hrvSamples, "higher");
      if (ctx) historicalContext.hrv = ctx;
    }

    // Resting heart rate: lower is better
    if (restingHeartRateSamples.length >= 30) {
      const ctx = generateHistoricalContext(restingHeartRateSamples, "lower");
      if (ctx) historicalContext.restingHeartRate = ctx;
    }

    return {
      summaries,
      averages,
      coverage,
      recovery: {
        hrv: hrvSamples,
        restingHeartRate: restingHeartRateSamples,
      },
      appleHealth,
      heartRateZones: zoneMinutes,
      historicalContext:
        Object.keys(historicalContext).length > 0
          ? historicalContext
          : undefined,
    };
  }

  protected assessDataQuality(data: {
    summaries: DailyActivitySummary[];
    averages: ActivityAverages;
    coverage: {
      days: number;
      stepsDays: number;
      activeEnergyDays: number;
      exerciseDays: number;
      hrvDays: number;
      restingHeartRateDays: number;
    };
    heartRateZones?: HeartRateZoneMinutes;
    historicalContext?: {
      steps?: HistoricalContext;
      activeEnergy?: HistoricalContext;
      exerciseMinutes?: HistoricalContext;
      hrv?: HistoricalContext;
      restingHeartRate?: HistoricalContext;
    };
  }): AgentDataQualityAssessment {
    const { summaries, averages, coverage, heartRateZones, historicalContext } =
      data;

    const strengths: string[] = [];
    const limitations: string[] = [];
    const missing: string[] = [];

    if (coverage.stepsDays >= 21) {
      strengths.push("Three weeks of step data (solid movement sample)");
    } else if (coverage.stepsDays >= 7) {
      strengths.push("At least one week of step data");
      limitations.push("Short step-count history (<21 days)");
    } else {
      missing.push("Daily step counts");
    }

    if (coverage.activeEnergyDays >= 7) {
      strengths.push("Active energy expenditure recorded most days");
    } else {
      limitations.push("Sparse active energy data (<7 days)");
    }

    if (coverage.exerciseDays >= 7) {
      strengths.push("Exercise minutes logged consistently");
    } else {
      limitations.push("Limited structured exercise logs");
    }

    if (coverage.hrvDays >= 7) {
      strengths.push("HRV data available for recovery checks");
    } else {
      limitations.push("Sparse HRV coverage (<7 entries)");
    }

    if (coverage.restingHeartRateDays >= 7) {
      strengths.push("Resting heart rate data available");
    } else {
      limitations.push("Resting heart rate coverage limited");
    }

    if (averages.steps === null) missing.push("Average daily steps");
    if (averages.activeEnergy === null)
      missing.push("Average active energy expenditure");
    if (averages.exerciseMinutes === null) missing.push("Exercise minutes");
    if (averages.hrv === null) missing.push("Average HRV (ms)");
    if (averages.restingHeartRate === null)
      missing.push("Average resting heart rate");
    if (!heartRateZones) missing.push("Heart rate training zone distribution");

    // Add strength if we have historical context
    if (historicalContext && Object.keys(historicalContext).length > 0) {
      const metricCount = Object.keys(historicalContext).length;
      strengths.push(
        `Historical context available for ${metricCount} metric${metricCount > 1 ? "s" : ""} (enables personalized baseline comparisons)`,
      );
    }

    const score =
      (coverage.stepsDays >= 21 ? 0.35 : coverage.stepsDays >= 7 ? 0.25 : 0) +
      (coverage.activeEnergyDays >= 7 ? 0.25 : 0.1) +
      (coverage.exerciseDays >= 7 ? 0.2 : 0.05) +
      (coverage.hrvDays >= 7 ? 0.1 : 0.05) +
      (coverage.restingHeartRateDays >= 7 ? 0.05 : 0) +
      (heartRateZones ? 0.05 : 0);

    const dateRange = this.dateRangeFromSummaries(summaries);

    return {
      score: Math.min(score, 1),
      dayCount: summaries.length,
      sampleFrequency:
        summaries.length >= 21
          ? "Daily"
          : summaries.length >= 7
            ? "Most days"
            : "Limited",
      dateRange,
      strengths,
      limitations,
      missing,
    };
  }

  protected formatDataForAnalysis(data: {
    summaries: DailyActivitySummary[];
    averages: ActivityAverages;
    recovery: { hrv: MetricSample[]; restingHeartRate: MetricSample[] };
    heartRateZones?: HeartRateZoneMinutes;
    historicalContext?: {
      steps?: HistoricalContext;
      activeEnergy?: HistoricalContext;
      exerciseMinutes?: HistoricalContext;
      hrv?: HistoricalContext;
      restingHeartRate?: HistoricalContext;
    };
  }): string {
    const { summaries, averages, recovery, heartRateZones, historicalContext } =
      data;

    const lines: string[] = [];

    // Calculate period-specific averages for tiered analysis
    const recent7d = this.calculatePeriodAverages(summaries, recovery, 7);
    const recent30d = this.calculatePeriodAverages(summaries, recovery, 30);
    const recent90d = this.calculatePeriodAverages(summaries, recovery, 90);

    // Compact header describing the tiered summary (kept for model orientation,
    // but without verbose instructional text to reduce token count)
    lines.push(
      "TIERED ANALYSIS SUMMARY: ALL-TIME baseline → 90-day → 30-day → recent 7-day window.",
    );
    lines.push("");

    // TIER 1: ALL-TIME BASELINE
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    lines.push("TIER 1: ALL-TIME BASELINE (Full History)");
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    if (historicalContext?.steps) {
      const ctx = historicalContext.steps;
      const daysTracked = Math.floor(
        (ctx.baseline.lastDate.getTime() - ctx.baseline.firstDate.getTime()) /
          (1000 * 60 * 60 * 24),
      );
      lines.push(`Steps (${daysTracked} days tracked):`);
      lines.push(
        `  Mean: ${this.formatNumber(ctx.baseline.mean, 0)} steps/day`,
      );
      lines.push(
        `  Range: ${this.formatNumber(ctx.baseline.min, 0)} - ${this.formatNumber(ctx.baseline.max, 0)} steps/day`,
      );
      lines.push(
        `  Percentiles: p25=${this.formatNumber(ctx.baseline.p25, 0)} | p50=${this.formatNumber(ctx.baseline.p50, 0)} | p75=${this.formatNumber(ctx.baseline.p75, 0)}`,
      );
    } else {
      lines.push(
        `Steps: ${this.formatNumber(averages.steps, 0)} steps/day (average across all data)`,
      );
    }

    if (historicalContext?.activeEnergy) {
      const ctx = historicalContext.activeEnergy;
      lines.push(
        `Active Energy: ${this.formatNumber(ctx.baseline.mean, 0)} kcal/day (range: ${this.formatNumber(ctx.baseline.min, 0)}-${this.formatNumber(ctx.baseline.max, 0)})`,
      );
    } else {
      lines.push(
        `Active Energy: ${this.formatNumber(averages.activeEnergy, 1)} kcal/day (average)`,
      );
    }

    if (historicalContext?.exerciseMinutes) {
      const ctx = historicalContext.exerciseMinutes;
      lines.push(
        `Exercise: ${this.formatNumber(ctx.baseline.mean, 0)} min/day (range: ${this.formatNumber(ctx.baseline.min, 0)}-${this.formatNumber(ctx.baseline.max, 0)})`,
      );
    } else {
      lines.push(
        `Exercise: ${this.formatNumber(averages.exerciseMinutes, 1)} min/day (average)`,
      );
    }

    if (historicalContext?.hrv) {
      const ctx = historicalContext.hrv;
      lines.push(
        `HRV: ${this.formatNumber(ctx.baseline.mean, 1)} ms (range: ${this.formatNumber(ctx.baseline.min, 1)}-${this.formatNumber(ctx.baseline.max, 1)} ms)`,
      );
    } else if (averages.hrv !== null) {
      lines.push(`HRV: ${this.formatNumber(averages.hrv, 1)} ms (average)`);
    }

    if (historicalContext?.restingHeartRate) {
      const ctx = historicalContext.restingHeartRate;
      lines.push(
        `Resting HR: ${this.formatNumber(ctx.baseline.mean, 1)} bpm (range: ${this.formatNumber(ctx.baseline.min, 1)}-${this.formatNumber(ctx.baseline.max, 1)} bpm)`,
      );
      const low = ctx.milestones.find((m) => m.type === "low");
      if (low) {
        lines.push(
          `  → Personal best: ${this.formatNumber(low.value, 1)} bpm (${low.daysAgo} days ago)`,
        );
      }
    } else if (averages.restingHeartRate !== null) {
      lines.push(
        `Resting HR: ${this.formatNumber(averages.restingHeartRate, 1)} bpm (average)`,
      );
    }

    lines.push("");

    // TIER 2: 90-DAY PERIOD
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    lines.push("TIER 2: 90-DAY PERIOD (vs Baseline)");
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    if (recent90d.steps !== null) {
      const vsBaseline =
        averages.steps !== null
          ? ((recent90d.steps - averages.steps) / averages.steps) * 100
          : 0;
      const trend = historicalContext?.steps?.trend90d;
      lines.push(
        `Steps: ${this.formatNumber(recent90d.steps, 0)} steps/day (${vsBaseline > 0 ? "+" : ""}${this.formatNumber(vsBaseline, 1)}% vs baseline)`,
      );
      if (trend) {
        lines.push(
          `  → Trend: ${trend.direction} (${trend.changePercent > 0 ? "+" : ""}${this.formatNumber(trend.changePercent, 1)}%)`,
        );
      }
    }

    if (recent90d.activeEnergy !== null && averages.activeEnergy !== null) {
      const vsBaseline =
        ((recent90d.activeEnergy - averages.activeEnergy) /
          averages.activeEnergy) *
        100;
      lines.push(
        `Active Energy: ${this.formatNumber(recent90d.activeEnergy, 0)} kcal/day (${vsBaseline > 0 ? "+" : ""}${this.formatNumber(vsBaseline, 1)}% vs baseline)`,
      );
    }

    if (
      recent90d.exerciseMinutes !== null &&
      averages.exerciseMinutes !== null
    ) {
      const vsBaseline =
        ((recent90d.exerciseMinutes - averages.exerciseMinutes) /
          averages.exerciseMinutes) *
        100;
      lines.push(
        `Exercise: ${this.formatNumber(recent90d.exerciseMinutes, 0)} min/day (${vsBaseline > 0 ? "+" : ""}${this.formatNumber(vsBaseline, 1)}% vs baseline)`,
      );
    }

    if (recent90d.hrv !== null && averages.hrv !== null) {
      const vsBaseline = ((recent90d.hrv - averages.hrv) / averages.hrv) * 100;
      const trend = historicalContext?.hrv?.trend90d;
      lines.push(
        `HRV: ${this.formatNumber(recent90d.hrv, 1)} ms (${vsBaseline > 0 ? "+" : ""}${this.formatNumber(vsBaseline, 1)}% vs baseline)`,
      );
      if (trend) {
        lines.push(`  → Trend: ${trend.direction}`);
      }
    }

    if (
      recent90d.restingHeartRate !== null &&
      averages.restingHeartRate !== null
    ) {
      const vsBaseline =
        ((recent90d.restingHeartRate - averages.restingHeartRate) /
          averages.restingHeartRate) *
        100;
      const trend = historicalContext?.restingHeartRate?.trend90d;
      lines.push(
        `Resting HR: ${this.formatNumber(recent90d.restingHeartRate, 1)} bpm (${vsBaseline > 0 ? "+" : ""}${this.formatNumber(vsBaseline, 1)}% vs baseline)`,
      );
      if (trend) {
        lines.push(
          `  → Trend: ${trend.direction} (${trend.changePercent > 0 ? "higher" : "lower"} is ${trend.direction === "improving" ? "better" : "worse"})`,
        );
      }
    }

    lines.push("");

    // TIER 3: 30-DAY PERIOD
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    lines.push("TIER 3: 30-DAY PERIOD (vs 90-Day & Baseline)");
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    if (recent30d.steps !== null) {
      const vsBaseline =
        averages.steps !== null
          ? ((recent30d.steps - averages.steps) / averages.steps) * 100
          : 0;
      const vs90d =
        recent90d.steps !== null
          ? ((recent30d.steps - recent90d.steps) / recent90d.steps) * 100
          : 0;
      const trend = historicalContext?.steps?.trend30d;
      lines.push(`Steps: ${this.formatNumber(recent30d.steps, 0)} steps/day`);
      lines.push(
        `  → vs baseline: ${vsBaseline > 0 ? "+" : ""}${this.formatNumber(vsBaseline, 1)}%`,
      );
      if (recent90d.steps !== null) {
        lines.push(
          `  → vs 90-day: ${vs90d > 0 ? "+" : ""}${this.formatNumber(vs90d, 1)}%`,
        );
      }
      if (trend) {
        lines.push(
          `  → Trend: ${trend.direction} (${trend.changePercent > 0 ? "+" : ""}${this.formatNumber(trend.changePercent, 1)}%)`,
        );
      }
    }

    if (recent30d.activeEnergy !== null && averages.activeEnergy !== null) {
      const vsBaseline =
        ((recent30d.activeEnergy - averages.activeEnergy) /
          averages.activeEnergy) *
        100;
      const vs90d =
        recent90d.activeEnergy !== null
          ? ((recent30d.activeEnergy - recent90d.activeEnergy) /
              recent90d.activeEnergy) *
            100
          : 0;
      lines.push(
        `Active Energy: ${this.formatNumber(recent30d.activeEnergy, 0)} kcal/day (${vsBaseline > 0 ? "+" : ""}${this.formatNumber(vsBaseline, 1)}% vs baseline, ${vs90d > 0 ? "+" : ""}${this.formatNumber(vs90d, 1)}% vs 90-day)`,
      );
    }

    if (
      recent30d.exerciseMinutes !== null &&
      averages.exerciseMinutes !== null
    ) {
      const vsBaseline =
        ((recent30d.exerciseMinutes - averages.exerciseMinutes) /
          averages.exerciseMinutes) *
        100;
      const vs90d =
        recent90d.exerciseMinutes !== null
          ? ((recent30d.exerciseMinutes - recent90d.exerciseMinutes) /
              recent90d.exerciseMinutes) *
            100
          : 0;
      lines.push(
        `Exercise: ${this.formatNumber(recent30d.exerciseMinutes, 0)} min/day (${vsBaseline > 0 ? "+" : ""}${this.formatNumber(vsBaseline, 1)}% vs baseline, ${vs90d > 0 ? "+" : ""}${this.formatNumber(vs90d, 1)}% vs 90-day)`,
      );
    }

    if (recent30d.hrv !== null && averages.hrv !== null) {
      const vsBaseline = ((recent30d.hrv - averages.hrv) / averages.hrv) * 100;
      const vs90d =
        recent90d.hrv !== null
          ? ((recent30d.hrv - recent90d.hrv) / recent90d.hrv) * 100
          : 0;
      lines.push(
        `HRV: ${this.formatNumber(recent30d.hrv, 1)} ms (${vsBaseline > 0 ? "+" : ""}${this.formatNumber(vsBaseline, 1)}% vs baseline, ${vs90d > 0 ? "+" : ""}${this.formatNumber(vs90d, 1)}% vs 90-day)`,
      );
    }

    if (
      recent30d.restingHeartRate !== null &&
      averages.restingHeartRate !== null
    ) {
      const vsBaseline =
        ((recent30d.restingHeartRate - averages.restingHeartRate) /
          averages.restingHeartRate) *
        100;
      const vs90d =
        recent90d.restingHeartRate !== null
          ? ((recent30d.restingHeartRate - recent90d.restingHeartRate) /
              recent90d.restingHeartRate) *
            100
          : 0;
      lines.push(
        `Resting HR: ${this.formatNumber(recent30d.restingHeartRate, 1)} bpm (${vsBaseline > 0 ? "+" : ""}${this.formatNumber(vsBaseline, 1)}% vs baseline, ${vs90d > 0 ? "+" : ""}${this.formatNumber(vs90d, 1)}% vs 90-day)`,
      );
    }

    lines.push("");

    // TIER 4: RECENT WEEK
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    lines.push("TIER 4: RECENT WEEK (Last 7 Days - Check for Acute Changes)");
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    if (recent7d.steps !== null) {
      const vsBaseline =
        averages.steps !== null
          ? ((recent7d.steps - averages.steps) / averages.steps) * 100
          : 0;
      const vs30d =
        recent30d.steps !== null
          ? ((recent7d.steps - recent30d.steps) / recent30d.steps) * 100
          : 0;
      lines.push(
        `Steps: ${this.formatNumber(recent7d.steps, 0)} steps/day (${vsBaseline > 0 ? "+" : ""}${this.formatNumber(vsBaseline, 1)}% vs baseline, ${vs30d > 0 ? "+" : ""}${this.formatNumber(vs30d, 1)}% vs 30-day)`,
      );

      // Flag outliers
      if (historicalContext?.steps) {
        const baseline = historicalContext.steps.baseline.mean;
        const deviation =
          (Math.abs(recent7d.steps - baseline) / baseline) * 100;
        if (deviation > 20) {
          lines.push(
            `  ⚠ OUTLIER: Recent week deviates ${this.formatNumber(deviation, 0)}% from personal baseline`,
          );
        }
      }
    }

    if (recent7d.activeEnergy !== null && averages.activeEnergy !== null) {
      const vsBaseline =
        ((recent7d.activeEnergy - averages.activeEnergy) /
          averages.activeEnergy) *
        100;
      const vs30d =
        recent30d.activeEnergy !== null
          ? ((recent7d.activeEnergy - recent30d.activeEnergy) /
              recent30d.activeEnergy) *
            100
          : 0;
      lines.push(
        `Active Energy: ${this.formatNumber(recent7d.activeEnergy, 0)} kcal/day (${vsBaseline > 0 ? "+" : ""}${this.formatNumber(vsBaseline, 1)}% vs baseline, ${vs30d > 0 ? "+" : ""}${this.formatNumber(vs30d, 1)}% vs 30-day)`,
      );
    }

    if (
      recent7d.exerciseMinutes !== null &&
      averages.exerciseMinutes !== null
    ) {
      const vsBaseline =
        ((recent7d.exerciseMinutes - averages.exerciseMinutes) /
          averages.exerciseMinutes) *
        100;
      const vs30d =
        recent30d.exerciseMinutes !== null
          ? ((recent7d.exerciseMinutes - recent30d.exerciseMinutes) /
              recent30d.exerciseMinutes) *
            100
          : 0;
      lines.push(
        `Exercise: ${this.formatNumber(recent7d.exerciseMinutes, 0)} min/day (${vsBaseline > 0 ? "+" : ""}${this.formatNumber(vsBaseline, 1)}% vs baseline, ${vs30d > 0 ? "+" : ""}${this.formatNumber(vs30d, 1)}% vs 30-day)`,
      );
    }

    if (recent7d.hrv !== null && averages.hrv !== null) {
      const vsBaseline = ((recent7d.hrv - averages.hrv) / averages.hrv) * 100;
      const vs30d =
        recent30d.hrv !== null
          ? ((recent7d.hrv - recent30d.hrv) / recent30d.hrv) * 100
          : 0;
      lines.push(
        `HRV: ${this.formatNumber(recent7d.hrv, 1)} ms (${vsBaseline > 0 ? "+" : ""}${this.formatNumber(vsBaseline, 1)}% vs baseline, ${vs30d > 0 ? "+" : ""}${this.formatNumber(vs30d, 1)}% vs 30-day)`,
      );
    }

    if (
      recent7d.restingHeartRate !== null &&
      averages.restingHeartRate !== null
    ) {
      const vsBaseline =
        ((recent7d.restingHeartRate - averages.restingHeartRate) /
          averages.restingHeartRate) *
        100;
      const vs30d =
        recent30d.restingHeartRate !== null
          ? ((recent7d.restingHeartRate - recent30d.restingHeartRate) /
              recent30d.restingHeartRate) *
            100
          : 0;
      lines.push(
        `Resting HR: ${this.formatNumber(recent7d.restingHeartRate, 1)} bpm (${vsBaseline > 0 ? "+" : ""}${this.formatNumber(vsBaseline, 1)}% vs baseline, ${vs30d > 0 ? "+" : ""}${this.formatNumber(vs30d, 1)}% vs 30-day)`,
      );

      // Flag outliers for resting HR
      if (historicalContext?.restingHeartRate) {
        const baseline = historicalContext.restingHeartRate.baseline.mean;
        const deviation = Math.abs(recent7d.restingHeartRate - baseline);
        if (deviation > 5) {
          lines.push(
            `  ⚠ OUTLIER: Resting HR is ${this.formatNumber(deviation, 1)} bpm away from personal baseline`,
          );
        }
      }
    }

    lines.push("");

    // Additional context (kept numeric, trimmed of narrative text where possible)
    if (heartRateZones) {
      lines.push(
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      );
      lines.push("HEART RATE ZONE DISTRIBUTION");
      lines.push(
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      );
      const daysTracked = summaries.length;
      const zone1PerDay =
        heartRateZones.zone1Minutes / Math.max(1, daysTracked);
      const zone2PerDay =
        heartRateZones.zone2Minutes / Math.max(1, daysTracked);
      const zone3PerDay =
        heartRateZones.zone3Minutes / Math.max(1, daysTracked);
      const zone4PerDay =
        heartRateZones.zone4Minutes / Math.max(1, daysTracked);
      const zone5PerDay =
        heartRateZones.zone5Minutes / Math.max(1, daysTracked);

      lines.push(
        `Zone 1 (<60% max): ${this.formatNumber(zone1PerDay, 1)} min/day`,
      );
      lines.push(
        `Zone 2 (60-70%): ${this.formatNumber(zone2PerDay, 1)} min/day`,
      );
      lines.push(
        `Zone 3 (70-80%): ${this.formatNumber(zone3PerDay, 1)} min/day`,
      );
      lines.push(
        `Zone 4 (80-90%): ${this.formatNumber(zone4PerDay, 1)} min/day`,
      );
      lines.push(`Zone 5 (>90%): ${this.formatNumber(zone5PerDay, 1)} min/day`);

      const highIntensity = zone4PerDay + zone5PerDay;
      const moderate = zone2PerDay + zone3PerDay;
      const weeklyModerate = moderate * 7;
      const weeklyHigh = highIntensity * 7;
      const moderateEquivalent = weeklyModerate + weeklyHigh * 2;

      lines.push("");
      lines.push(
        `Weekly totals: ${this.formatNumber(weeklyModerate, 0)} min moderate + ${this.formatNumber(weeklyHigh, 0)} min high`,
      );
      lines.push(
        `Moderate-equivalent: ${this.formatNumber(moderateEquivalent, 0)} min/week (goal: ≥150 min)`,
      );
      lines.push(
        `Meets WHO guidelines: ${moderateEquivalent >= 150 ? "YES ✓" : "NO (deficit: " + this.formatNumber(150 - moderateEquivalent, 0) + " min)"}`,
      );
      lines.push("");
    }

    return lines.join("\n");
  }

  /**
   * Calculate averages for a specific time period (last N days)
   */
  private calculatePeriodAverages(
    summaries: DailyActivitySummary[],
    recovery: { hrv: MetricSample[]; restingHeartRate: MetricSample[] },
    days: number,
  ): {
    steps: number | null;
    activeEnergy: number | null;
    exerciseMinutes: number | null;
    hrv: number | null;
    restingHeartRate: number | null;
  } {
    const now = new Date();
    const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const periodSummaries = summaries.slice(-days);

    const stepsData = periodSummaries
      .map((s) => s.steps)
      .filter((v): v is number => v !== null);
    const energyData = periodSummaries
      .map((s) => s.activeEnergy)
      .filter((v): v is number => v !== null);
    const exerciseData = periodSummaries
      .map((s) => s.exerciseMinutes)
      .filter((v): v is number => v !== null);

    // Filter HRV and Resting HR samples for the period
    const hrvData = recovery.hrv
      .filter((s) => s.timestamp >= periodStart)
      .map((s) => s.value);
    const restingHRData = recovery.restingHeartRate
      .filter((s) => s.timestamp >= periodStart)
      .map((s) => s.value);

    return {
      steps:
        stepsData.length > 0
          ? stepsData.reduce((a, b) => a + b, 0) / stepsData.length
          : null,
      activeEnergy:
        energyData.length > 0
          ? energyData.reduce((a, b) => a + b, 0) / energyData.length
          : null,
      exerciseMinutes:
        exerciseData.length > 0
          ? exerciseData.reduce((a, b) => a + b, 0) / exerciseData.length
          : null,
      hrv:
        hrvData.length > 0
          ? hrvData.reduce((a, b) => a + b, 0) / hrvData.length
          : null,
      restingHeartRate:
        restingHRData.length > 0
          ? restingHRData.reduce((a, b) => a + b, 0) / restingHRData.length
          : null,
    };
  }

  protected buildDetailedPrompt(
    query: string,
    data: {
      summaries: DailyActivitySummary[];
      averages: ActivityAverages;
      recovery: { hrv: MetricSample[]; restingHeartRate: MetricSample[] };
      coverage: {
        days: number;
        stepsDays: number;
        activeEnergyDays: number;
        exerciseDays: number;
        hrvDays: number;
        restingHeartRateDays: number;
      };
      heartRateZones?: HeartRateZoneMinutes;
      historicalContext?: {
        steps?: HistoricalContext;
        activeEnergy?: HistoricalContext;
        exerciseMinutes?: HistoricalContext;
        hrv?: HistoricalContext;
        restingHeartRate?: HistoricalContext;
      };
    },
    quality: AgentDataQualityAssessment,
  ): string {
    const basePrompt = super.buildDetailedPrompt(query, data, quality);
    const { summaries, averages, recovery, heartRateZones, historicalContext } =
      data;

    const latest = summaries[summaries.length - 1];

    const directedPrompts: string[] = [
      "CRITICAL: Analyze TRENDS and PATTERNS across the full time period, not just the most recent day.",
      "Focus on multi-week patterns in movement, exercise consistency, and energy expenditure.",
      "Identify trends over time: Are metrics improving, declining, or stable? Reference 30-day trends from historical context.",
      "Look for noteworthy patterns: sustained increases/decreases, cyclical behavior, outlier periods.",
      "Only populate the `concerns` array for moderate or high severity issues.",
      "When data appears healthy, frame recommendations as positive reinforcement rather than warnings.",
      "Reference specific metrics and their values in your findings and recommendations.",
    ];

    if (averages.steps !== null) {
      directedPrompts.push(
        `Use the overall average steps ${this.formatNumber(averages.steps)} steps/day as the primary metric. This is calculated from all available step data and is the authoritative average.`,
      );
    }

    // Calculate and provide recent 30-day average if different from overall
    const recentSummaries = summaries.slice(-30);
    const recentStepsWithData = recentSummaries
      .map((s) => s.steps)
      .filter((steps): steps is number => steps !== null);
    if (recentStepsWithData.length > 0 && averages.steps !== null) {
      const recentAvg =
        recentStepsWithData.reduce((a, b) => a + b, 0) /
        recentStepsWithData.length;
      if (Math.abs(recentAvg - averages.steps) > 100) {
        // Only mention if significantly different
        directedPrompts.push(
          `Note: Recent 30-day average (${this.formatNumber(recentAvg)} steps/day) differs from overall average. Use the overall average (${this.formatNumber(averages.steps)} steps/day) as the primary reference, as it represents the complete dataset.`,
        );
      }
    }
    if (averages.activeEnergy !== null) {
      directedPrompts.push(
        `Reference average active energy ${this.formatNumber(averages.activeEnergy, 1)} kcal/day.`,
      );
    }
    if (averages.exerciseMinutes !== null) {
      directedPrompts.push(
        `Reference average exercise minutes ${this.formatNumber(averages.exerciseMinutes, 1)} min/day.`,
      );
    }
    if (averages.hrv !== null) {
      directedPrompts.push(
        `Reference average HRV ${this.formatNumber(averages.hrv, 1)} ms.`,
      );
    }
    if (averages.restingHeartRate !== null) {
      directedPrompts.push(
        `Reference average resting HR ${this.formatNumber(averages.restingHeartRate, 1)} bpm.`,
      );
    }
    if (averages.highIntensityMinutes !== null) {
      directedPrompts.push(
        `Report total high-intensity (zones 4-5) minutes ${this.formatNumber(averages.highIntensityMinutes, 1)} and compare to typical recommendations.`,
      );
    }
    if (averages.moderateIntensityMinutes !== null) {
      directedPrompts.push(
        `Report moderate-intensity (zones 2-3) minutes ${this.formatNumber(averages.moderateIntensityMinutes, 1)} to show aerobic base work.`,
      );
    }
    if (heartRateZones) {
      directedPrompts.push(
        `Use the estimated heart rate zone distribution: Z1 ${this.formatNumber(heartRateZones.zone1Minutes, 1)} min, Z2 ${this.formatNumber(heartRateZones.zone2Minutes, 1)} min, Z3 ${this.formatNumber(heartRateZones.zone3Minutes, 1)} min, Z4 ${this.formatNumber(heartRateZones.zone4Minutes, 1)} min, Z5 ${this.formatNumber(heartRateZones.zone5Minutes, 1)} min (total ${this.formatNumber(heartRateZones.totalMinutes, 1)} min).`,
      );
    }

    // Add historical context guidance FIRST (before single-day snapshots)
    if (historicalContext && Object.keys(historicalContext).length > 0) {
      directedPrompts.push(
        "CRITICAL: Use the HISTORICAL CONTEXT section to provide personalized insights comparing RECENT TRENDS (not just one day) to this user's historical patterns.",
      );
      directedPrompts.push(
        "Focus on multi-day and multi-week patterns. Examples: 'Over the past 30 days, your step count has declined 15% from your typical median', 'Your resting HR has been trending 5 bpm higher than your 6-month low for the past 2 weeks', 'Your exercise volume increased 35% over the past 6 months - sustainable or overreaching?'",
      );
    }

    if (latest) {
      directedPrompts.push(
        `Most recent data point (${latest.date}): steps ${this.formatNumber(latest.steps)}, active energy ${this.formatNumber(latest.activeEnergy)} kcal, exercise ${this.formatNumber(latest.exerciseMinutes)} min. Use this for context, but focus analysis on broader trends.`,
      );
    }
    if (recovery.hrv.length) {
      const recent = recovery.hrv[recovery.hrv.length - 1];
      directedPrompts.push(
        `Latest HRV: ${this.formatNumber(recent.value, 1)} ms (${recent.timestamp.toISOString().split("T")[0]}). Compare to typical range, not as standalone finding.`,
      );
    }
    if (recovery.restingHeartRate.length) {
      const recent =
        recovery.restingHeartRate[recovery.restingHeartRate.length - 1];
      directedPrompts.push(
        `Latest resting HR: ${this.formatNumber(recent.value, 1)} bpm (${recent.timestamp.toISOString().split("T")[0]}). Compare to typical range and recent trend, not as standalone finding.`,
      );
    }

    return `${basePrompt}

ACTIVITY & ENERGY AGENT DIRECTIVES:
${directedPrompts.map((line) => `- ${line}`).join("\n")}`;
  }

  protected postProcessInsight(
    insight: AgentInsight,
    data: {
      summaries: DailyActivitySummary[];
      averages: ActivityAverages;
      coverage: {
        days: number;
        stepsDays: number;
        activeEnergyDays: number;
        exerciseDays: number;
        hrvDays: number;
        restingHeartRateDays: number;
      };
      recovery: {
        hrv: MetricSample[];
        restingHeartRate: MetricSample[];
      };
      appleHealth: AppleHealthMetricMap;
      heartRateZones?: HeartRateZoneMinutes;
    },
    _quality: AgentDataQualityAssessment,
    _context: AgentExecutionContext,
    _extras?: Record<string, unknown>,
  ): AgentInsight {
    void _extras; // Mark as used

    const { averages, summaries, coverage, heartRateZones } = data;

    // Calculate weekend vs weekday steps ratio
    const weekendSteps = summaries
      .filter((s) => {
        const day = new Date(s.date).getDay();
        return day === 0 || day === 6; // Sunday or Saturday
      })
      .map((s) => s.steps ?? 0);
    const weekdaySteps = summaries
      .filter((s) => {
        const day = new Date(s.date).getDay();
        return day > 0 && day < 6; // Monday to Friday
      })
      .map((s) => s.steps ?? 0);

    const avgWeekendSteps =
      weekendSteps.length > 0
        ? weekendSteps.reduce((a, b) => a + b, 0) / weekendSteps.length
        : 0;
    const avgWeekdaySteps =
      weekdaySteps.length > 0
        ? weekdaySteps.reduce((a, b) => a + b, 0) / weekdaySteps.length
        : 0;

    const weekendToWeekdayStepsRatio =
      avgWeekdaySteps > 0 ? avgWeekendSteps / avgWeekdaySteps : 0;

    // Calculate recent 30-day average (excluding null values)
    const recentSummaries = summaries.slice(-30);
    const recentStepsWithData = recentSummaries
      .map((s) => s.steps)
      .filter((steps): steps is number => steps !== null);
    const recent30DayAverageSteps =
      recentStepsWithData.length > 0
        ? Math.round(
            (recentStepsWithData.reduce((a, b) => a + b, 0) /
              recentStepsWithData.length) *
              10,
          ) / 10
        : null;

    // Count sedentary days (<5000 steps) - only count days with actual step data
    const sedentaryDayCount = summaries.filter(
      (s) => s.steps !== null && s.steps < 5000,
    ).length;

    const highIntensityMinutesPerDay = averages.highIntensityMinutes ?? null;
    const moderateIntensityMinutesPerDay =
      averages.moderateIntensityMinutes ?? null;

    const highMinutesPerWeek =
      highIntensityMinutesPerDay !== null
        ? Math.round(highIntensityMinutesPerDay * 7 * 10) / 10
        : null;
    const moderateMinutesPerWeek =
      moderateIntensityMinutesPerDay !== null
        ? Math.round(moderateIntensityMinutesPerDay * 7 * 10) / 10
        : null;

    const hasIntensityData =
      highMinutesPerWeek !== null || moderateMinutesPerWeek !== null;
    const moderateEquivalentMinutes = hasIntensityData
      ? (moderateMinutesPerWeek ?? 0) + (highMinutesPerWeek ?? 0) * 2
      : null;
    const meetsGuidelines =
      moderateEquivalentMinutes !== null
        ? moderateEquivalentMinutes >= 150
        : null;

    return {
      ...insight,
      metadata: {
        ...insight.metadata,
        activityAverageSteps: averages.steps,
        activityRecent30DayAverageSteps: recent30DayAverageSteps,
        activityAverageActiveEnergy: averages.activeEnergy,
        activityAverageExerciseMinutes: averages.exerciseMinutes,
        activityWeekendToWeekdayStepsRatio: weekendToWeekdayStepsRatio,
        activitySedentaryDayCount: sedentaryDayCount,
        activityHighIntensityMinutesPerDay: highIntensityMinutesPerDay,
        activityModerateIntensityMinutesPerDay: moderateIntensityMinutesPerDay,
        activityHighIntensityMinutesPerWeek: highMinutesPerWeek,
        activityModerateIntensityMinutesPerWeek: moderateMinutesPerWeek,
        activityHeartRateZoneSnapshot: heartRateZones,
        activityMeetsAerobicGuidelines: meetsGuidelines,
        activityCoverageDays: coverage.days,
      },
    };
  }

  private dayKey(sample: MetricSample): string {
    const date = new Date(sample.timestamp.getTime());
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().split("T")[0];
  }

  private findValueForDay(samples: MetricSample[], key: string): number | null {
    const match = samples.find((sample) => this.dayKey(sample) === key);
    return match ? match.value : null;
  }

  /**
   * Calculate average value from samples
   * IMPORTANT: For cumulative metrics (steps, active energy), samples should already
   * be aggregated by day (sum per day) by the CoordinatorService before reaching agents.
   * This function just averages those daily totals.
   */
  private averageValue(samples: MetricSample[]): number | null {
    if (!samples.length) return null;

    // Check if samples are already aggregated (from tiered aggregation)
    const hasAggregationMetadata = samples.some(
      (s) => s.metadata?.aggregationType || s.metadata?.periodType,
    );

    if (hasAggregationMetadata) {
      // Samples are already daily/weekly/monthly aggregates - just average them
      const sum = samples.reduce((total, sample) => total + sample.value, 0);
      return Math.round((sum / samples.length) * 10) / 10;
    }

    // Legacy path: samples are raw readings, need to aggregate by day first
    // Group by day
    const dailyTotals = new Map<string, number>();
    for (const sample of samples) {
      const dateKey = this.dayKey(sample);
      dailyTotals.set(dateKey, (dailyTotals.get(dateKey) || 0) + sample.value);
    }

    // Average the daily totals
    const values = Array.from(dailyTotals.values());
    if (values.length === 0) return null;

    const sum = values.reduce((total, val) => total + val, 0);
    return Math.round((sum / values.length) * 10) / 10;
  }

  private formatNumber(value: number | null, digits: number = 0): string {
    if (value === null || Number.isNaN(value)) return "n/a";
    return value.toFixed(digits);
  }

  private dateRangeFromSummaries(
    summaries: DailyActivitySummary[],
  ): { start: Date; end: Date } | undefined {
    if (!summaries.length) return undefined;
    const start = new Date(`${summaries[0].date}T00:00:00`);
    const end = new Date(`${summaries[summaries.length - 1].date}T00:00:00`);
    return { start, end };
  }
}
