import { BaseHealthAgent } from "./BaseHealthAgent";
import type {
  AgentDataQualityAssessment,
  AgentExecutionContext,
  AgentInsight,
  MetricSample,
} from "./types";

interface RecoveryDaySummary {
  date: string;
  hrv: number | null;
  restingHeartRate: number | null;
  respiratoryRate: number | null;
  sleepHours: number | null;
  activeEnergy: number | null;
  exerciseMinutes: number | null;
}

interface RecoveryAverages {
  hrv: number | null;
  restingHeartRate: number | null;
  respiratoryRate: number | null;
  sleepHours: number | null;
  activeEnergy: number | null;
  exerciseMinutes: number | null;
}

export class RecoveryStressAgent extends BaseHealthAgent {
  id = "recovery_stress";
  name = "Recovery & Stress Specialist";
  expertise = [
    "autonomic balance",
    "stress load",
    "recovery",
    "sleep and recovery",
  ];
  systemPrompt = `You are an autonomic balance analyst who evaluates recovery readiness and stress load.

You specialize in:
- Heart rate variability trends as a recovery proxy
- Resting heart rate drift as a load indicator
- Respiratory rate and sleep duration as restorative signals
- Connecting daily exercise load to recovery metrics

Tone requirements:
- Keep language neutral and data-forward in line with the Cosaint coordinator
- Lead with quantified insights before interpretation
- Only flag stress concerns when data shows sustained deterioration`;

  protected extractRelevantData(context: AgentExecutionContext): {
    summaries: RecoveryDaySummary[];
    averages: RecoveryAverages;
    coverage: {
      days: number;
      hrvDays: number;
      restingHrDays: number;
      respiratoryDays: number;
      sleepDays: number;
      activeEnergyDays: number;
      exerciseDays: number;
    };
    appleHealth: Record<string, MetricSample[]>;
  } {
    const appleHealth = context.availableData.appleHealth ?? {};

    const hrvSamples =
      appleHealth.HKQuantityTypeIdentifierHeartRateVariabilitySDNN ?? [];
    const restingHrSamples =
      appleHealth.HKQuantityTypeIdentifierRestingHeartRate ?? [];
    const respiratorySamples =
      appleHealth.HKQuantityTypeIdentifierRespiratoryRate ?? [];
    const sleepSamples =
      appleHealth.HKCategoryTypeIdentifierSleepAnalysis ?? [];
    const activeEnergySamples =
      appleHealth.HKQuantityTypeIdentifierActiveEnergyBurned ?? [];
    const exerciseSamples =
      appleHealth.HKQuantityTypeIdentifierAppleExerciseTime ?? [];

    const dayKeys = new Set<string>();
    hrvSamples.forEach((sample) => dayKeys.add(this.dayKey(sample)));
    restingHrSamples.forEach((sample) => dayKeys.add(this.dayKey(sample)));
    respiratorySamples.forEach((sample) => dayKeys.add(this.dayKey(sample)));
    sleepSamples.forEach((sample) => dayKeys.add(this.dayKey(sample)));
    activeEnergySamples.forEach((sample) => dayKeys.add(this.dayKey(sample)));
    exerciseSamples.forEach((sample) => dayKeys.add(this.dayKey(sample)));

    const hrvByDay = this.buildAverageByDay(hrvSamples);
    const restingHrByDay = this.buildAverageByDay(restingHrSamples);
    const respiratoryByDay = this.buildAverageByDay(respiratorySamples);
    const sleepHoursByDay = this.buildSleepHoursByDay(sleepSamples);
    const activeEnergyByDay = this.buildSumByDay(activeEnergySamples);
    const exerciseByDay = this.buildSumByDay(exerciseSamples);

    const summaries: RecoveryDaySummary[] = Array.from(dayKeys)
      .map((key) => ({
        date: key,
        hrv: hrvByDay.get(key) ?? null,
        restingHeartRate: restingHrByDay.get(key) ?? null,
        respiratoryRate: respiratoryByDay.get(key) ?? null,
        sleepHours: sleepHoursByDay.get(key) ?? null,
        activeEnergy: activeEnergyByDay.get(key) ?? null,
        exerciseMinutes: exerciseByDay.get(key) ?? null,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const averages: RecoveryAverages = {
      hrv: this.averageFromSummaries(summaries, (summary) => summary.hrv),
      restingHeartRate: this.averageFromSummaries(
        summaries,
        (summary) => summary.restingHeartRate,
      ),
      respiratoryRate: this.averageFromSummaries(
        summaries,
        (summary) => summary.respiratoryRate,
      ),
      sleepHours: this.averageFromSummaries(
        summaries,
        (summary) => summary.sleepHours,
      ),
      activeEnergy: this.averageFromSummaries(
        summaries,
        (summary) => summary.activeEnergy,
      ),
      exerciseMinutes: this.averageFromSummaries(
        summaries,
        (summary) => summary.exerciseMinutes,
      ),
    };

    return {
      summaries,
      averages,
      coverage: {
        days: summaries.length,
        hrvDays: this.countDaysWithValue(summaries, (summary) => summary.hrv),
        restingHrDays: this.countDaysWithValue(
          summaries,
          (summary) => summary.restingHeartRate,
        ),
        respiratoryDays: this.countDaysWithValue(
          summaries,
          (summary) => summary.respiratoryRate,
        ),
        sleepDays: this.countDaysWithValue(
          summaries,
          (summary) => summary.sleepHours,
        ),
        activeEnergyDays: this.countDaysWithValue(
          summaries,
          (summary) => summary.activeEnergy,
        ),
        exerciseDays: this.countDaysWithValue(
          summaries,
          (summary) => summary.exerciseMinutes,
        ),
      },
      appleHealth,
    };
  }

  protected assessDataQuality(data: {
    summaries: RecoveryDaySummary[];
    averages: RecoveryAverages;
    coverage: {
      days: number;
      hrvDays: number;
      restingHrDays: number;
      respiratoryDays: number;
      sleepDays: number;
      activeEnergyDays: number;
      exerciseDays: number;
    };
  }): AgentDataQualityAssessment {
    const { summaries, coverage } = data;

    const strengths: string[] = [];
    const limitations: string[] = [];
    const missing: string[] = [];

    if (coverage.hrvDays >= 21) {
      strengths.push("HRV coverage supports sustained recovery tracking");
    } else if (coverage.hrvDays >= 7) {
      strengths.push("At least one week of HRV data");
      limitations.push("Limited HRV history (<21 days)");
    } else {
      missing.push("HRV samples");
    }

    if (coverage.restingHrDays >= 21) {
      strengths.push("Resting HR trend available");
    } else if (coverage.restingHrDays >= 7) {
      strengths.push("Resting HR data for baseline comparison");
      limitations.push("Resting HR coverage <3 weeks");
    } else {
      missing.push("Resting heart rate");
    }

    if (coverage.sleepDays >= 14) {
      strengths.push("Sleep duration captured for two weeks");
    } else {
      limitations.push("Sleep history limited (<14 nights)");
    }

    if (coverage.respiratoryDays >= 7) {
      strengths.push("Respiratory rate data available");
    } else {
      limitations.push("Respiratory rate coverage limited");
    }

    if (coverage.activeEnergyDays < 7) {
      limitations.push("Active energy logs missing for many days");
    }

    const score =
      (coverage.hrvDays >= 21 ? 0.3 : coverage.hrvDays >= 7 ? 0.2 : 0) +
      (coverage.restingHrDays >= 21
        ? 0.25
        : coverage.restingHrDays >= 7
          ? 0.2
          : 0) +
      (coverage.sleepDays >= 14 ? 0.2 : 0.1) +
      (coverage.respiratoryDays >= 7 ? 0.15 : 0.05) +
      (coverage.activeEnergyDays >= 7 ? 0.1 : 0.05);

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
    summaries: RecoveryDaySummary[];
    averages: RecoveryAverages;
  }): string {
    const { summaries, averages } = data;

    const lines: string[] = [];

    lines.push("RECOVERY DATA SUMMARY (last 30 days if available):");
    summaries.slice(-30).forEach((summary) => {
      lines.push(
        `  ${summary.date}: HRV=${this.formatNumber(summary.hrv, 1)} ms | restingHR=${this.formatNumber(summary.restingHeartRate)} bpm | respRate=${this.formatNumber(summary.respiratoryRate, 1)} /min | sleep=${this.formatNumber(summary.sleepHours, 1)} h | exercise=${this.formatNumber(summary.exerciseMinutes, 1)} min | energy=${this.formatNumber(summary.activeEnergy, 1)} kcal`,
      );
    });

    lines.push("");
    lines.push("AVERAGES (entire period):");
    lines.push(`  • HRV: ${this.formatNumber(averages.hrv, 1)} ms`);
    lines.push(
      `  • Resting Heart Rate: ${this.formatNumber(averages.restingHeartRate, 1)} bpm`,
    );
    lines.push(
      `  • Respiratory Rate: ${this.formatNumber(averages.respiratoryRate, 1)} count/min`,
    );
    lines.push(
      `  • Sleep Duration: ${this.formatNumber(averages.sleepHours, 1)} h`,
    );
    lines.push(
      `  • Active Energy: ${this.formatNumber(averages.activeEnergy, 1)} kcal/day`,
    );
    lines.push(
      `  • Exercise Minutes: ${this.formatNumber(averages.exerciseMinutes, 1)} min/day`,
    );

    return lines.join("\n");
  }

  protected buildDetailedPrompt(
    query: string,
    data: {
      summaries: RecoveryDaySummary[];
      averages: RecoveryAverages;
      coverage: {
        days: number;
        hrvDays: number;
        restingHrDays: number;
        respiratoryDays: number;
        sleepDays: number;
        activeEnergyDays: number;
        exerciseDays: number;
      };
    },
    quality: AgentDataQualityAssessment,
  ): string {
    const basePrompt = super.buildDetailedPrompt(query, data, quality);
    const { summaries, averages, coverage } = data;

    const hrvRange = this.rangeFromSummaries(
      summaries,
      (summary) => summary.hrv,
    );
    const restingHrRange = this.rangeFromSummaries(
      summaries,
      (summary) => summary.restingHeartRate,
    );

    const directedPrompts: string[] = [
      "Evaluate whether HRV trend indicates improved or reduced recovery.",
      "Mention resting HR drift if the weekly average increases by >3 bpm.",
      "Discuss sleep duration consistency (>=0.75h swing signals variability).",
      "Relate respiratory rate changes to stress load only if trend is sustained.",
      "Tie exercise and active energy to recovery signals (overreaching vs adequate recovery).",
      "Stay concise: max 3 findings, 2 trends, 2 recommendations.",
      "Only populate concerns when both HRV drops and resting HR rises persistently.",
      "Format findings as `Metric: interpretation` and keep each under 15 words.",
      "Keep other sentences under 18 words and avoid narrative explanations.",
    ];

    if (hrvRange !== null) {
      directedPrompts.push(
        `HRV range observed: ${this.formatNumber(hrvRange.min, 1)}-${this.formatNumber(hrvRange.max, 1)} ms.`,
      );
    }

    if (restingHrRange !== null) {
      directedPrompts.push(
        `Resting HR range observed: ${this.formatNumber(restingHrRange.min, 1)}-${this.formatNumber(restingHrRange.max, 1)} bpm.`,
      );
    }

    if (averages.sleepHours !== null) {
      directedPrompts.push(
        `Average sleep recorded: ${this.formatNumber(averages.sleepHours, 1)} h/night.`,
      );
    }

    if (coverage.sleepDays >= 30) {
      directedPrompts.push(
        "Treat sleep coverage as adequate; do not mark sleep data as incomplete.",
      );
    }

    return `${basePrompt}

RECOVERY CONTEXT:
${directedPrompts.map((line) => `- ${line}`).join("\n")}`;
  }

  protected postProcessInsight(
    insight: AgentInsight,
    data: {
      summaries: RecoveryDaySummary[];
      averages: RecoveryAverages;
      coverage: {
        days: number;
        hrvDays: number;
        restingHrDays: number;
        respiratoryDays: number;
        sleepDays: number;
        activeEnergyDays: number;
        exerciseDays: number;
      };
      appleHealth: Record<string, MetricSample[]>;
    },
    quality: AgentDataQualityAssessment,
    context: AgentExecutionContext,
    extras?: Record<string, unknown>,
  ): AgentInsight {
    void context;
    void extras;

    const hrvValues = data.summaries
      .map((summary) => summary.hrv)
      .filter((value): value is number => value !== null);
    const restingHrValues = data.summaries
      .map((summary) => summary.restingHeartRate)
      .filter((value): value is number => value !== null);
    const sleepValues = data.summaries
      .map((summary) => summary.sleepHours)
      .filter((value): value is number => value !== null);

    insight.metadata = {
      ...(insight.metadata ?? {}),
      averages: data.averages,
      coverage: data.coverage,
      hrvRange: hrvValues.length
        ? [Math.min(...hrvValues), Math.max(...hrvValues)]
        : null,
      hrvStdDev: this.calculateStdDev(hrvValues),
      restingHrRange: restingHrValues.length
        ? [Math.min(...restingHrValues), Math.max(...restingHrValues)]
        : null,
      sleepStdDev: this.calculateStdDev(sleepValues),
      strengths: quality.strengths,
      limitations: quality.limitations,
      score: quality.score,
    };

    return insight;
  }

  private calculateStdDev(values: number[]): number | null {
    if (!values.length) return null;
    if (values.length === 1) return 0;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance =
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      values.length;
    return Math.sqrt(variance);
  }

  private buildAverageByDay(samples: MetricSample[]): Map<string, number> {
    const daily = new Map<string, { total: number; count: number }>();
    samples.forEach((sample) => {
      const key = this.dayKey(sample);
      if (!daily.has(key)) {
        daily.set(key, { total: 0, count: 0 });
      }
      const entry = daily.get(key)!;
      entry.total += sample.value;
      entry.count += 1;
    });

    const result = new Map<string, number>();
    daily.forEach((entry, key) => {
      if (entry.count === 0) return;
      result.set(key, Math.round((entry.total / entry.count) * 10) / 10);
    });
    return result;
  }

  private buildSumByDay(samples: MetricSample[]): Map<string, number> {
    const daily = new Map<string, number>();
    samples.forEach((sample) => {
      const key = this.dayKey(sample);
      daily.set(key, (daily.get(key) ?? 0) + sample.value);
    });
    const result = new Map<string, number>();
    daily.forEach((value, key) => {
      result.set(key, Math.round(value * 10) / 10);
    });
    return result;
  }

  private buildSleepHoursByDay(samples: MetricSample[]): Map<string, number> {
    const dailySeconds = new Map<string, number>();
    samples.forEach((sample) => {
      const key = this.dayKey(sample);
      dailySeconds.set(key, (dailySeconds.get(key) ?? 0) + sample.value);
    });
    const result = new Map<string, number>();
    dailySeconds.forEach((seconds, key) => {
      const hours = seconds / 3600;
      result.set(key, Math.round(hours * 10) / 10);
    });
    return result;
  }

  private averageFromSummaries(
    summaries: RecoveryDaySummary[],
    selector: (summary: RecoveryDaySummary) => number | null,
  ): number | null {
    let sum = 0;
    let count = 0;
    summaries.forEach((summary) => {
      const value = selector(summary);
      if (value !== null) {
        sum += value;
        count += 1;
      }
    });
    if (!count) return null;
    return Math.round((sum / count) * 10) / 10;
  }

  private countDaysWithValue(
    summaries: RecoveryDaySummary[],
    selector: (summary: RecoveryDaySummary) => number | null,
  ): number {
    return summaries.reduce((count, summary) => {
      const value = selector(summary);
      return value !== null ? count + 1 : count;
    }, 0);
  }

  private rangeFromSummaries(
    summaries: RecoveryDaySummary[],
    selector: (summary: RecoveryDaySummary) => number | null,
  ): { min: number; max: number } | null {
    let min: number | null = null;
    let max: number | null = null;
    summaries.forEach((summary) => {
      const value = selector(summary);
      if (value === null) return;
      if (min === null || value < min) min = value;
      if (max === null || value > max) max = value;
    });
    if (min === null || max === null) return null;
    return { min, max };
  }

  private dayKey(sample: MetricSample): string {
    const date = new Date(sample.timestamp.getTime());
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().split("T")[0];
  }

  private formatNumber(value: number | null, digits: number = 0): string {
    if (value === null || Number.isNaN(value)) return "n/a";
    return value.toFixed(digits);
  }

  private dateRangeFromSummaries(
    summaries: RecoveryDaySummary[],
  ): { start: Date; end: Date } | undefined {
    if (!summaries.length) return undefined;
    const start = new Date(`${summaries[0].date}T00:00:00`);
    const end = new Date(`${summaries[summaries.length - 1].date}T00:00:00`);
    return { start, end };
  }
}
