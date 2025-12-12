import { BaseHealthAgent } from "./BaseHealthAgent";
import type {
  AgentDataQualityAssessment,
  AgentExecutionContext,
  AgentInsight,
  AppleHealthMetricMap,
  MetricSample,
} from "./types";

interface CardioDaySummary {
  date: string;
  restingHeartRate: number | null;
  hrv: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  exerciseMinutes: number | null;
  vo2Max: number | null;
}

interface CardioAverages {
  restingHeartRate: number | null;
  hrv: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  exerciseMinutes: number | null;
  vo2Max: number | null;
}

interface CardioRecoveryData {
  hrvSamples: MetricSample[];
  restingHeartRateSamples: MetricSample[];
}

export class CardiovascularAgent extends BaseHealthAgent {
  id = "cardiovascular";
  name = "Cardiovascular Specialist";
  expertise = [
    "cardiovascular health",
    "heart rate",
    "recovery",
    "cardio fitness",
  ];
  systemPrompt = `You are a cardiovascular physiologist who evaluates cardiac load, autonomic balance, and recovery readiness.

You specialize in:
- Resting heart rate baselines and variability
- Heart rate variability as a recovery signal
- Training load vs. cardiovascular stress relationships
- Identifying risk patterns from heart rate metrics (tachycardia, elevated resting HR)

Tone requirements:
- Maintain a neutral, evidence-focused voice aligned with the Cosaint coordinator
- Use concise, quantified statements before interpretation
- Highlight risk only when supported by data (avoid alarmist language)`;

  protected extractRelevantData(context: AgentExecutionContext): {
    summaries: CardioDaySummary[];
    averages: CardioAverages;
    coverage: {
      days: number;
      restingHrDays: number;
      hrvDays: number;
      heartRateDays: number;
      exerciseDays: number;
      vo2Days: number;
    };
    recovery: CardioRecoveryData;
    appleHealth: AppleHealthMetricMap;
  } {
    const appleHealth = context.availableData.appleHealth ?? {};

    const restingHeartRateSamples =
      appleHealth.HKQuantityTypeIdentifierRestingHeartRate ?? [];
    const hrvSamples =
      appleHealth.HKQuantityTypeIdentifierHeartRateVariabilitySDNN ?? [];
    const heartRateSamples =
      appleHealth.HKQuantityTypeIdentifierHeartRate ?? [];
    const exerciseSamples =
      appleHealth.HKQuantityTypeIdentifierAppleExerciseTime ?? [];
    const vo2Samples = appleHealth.HKQuantityTypeIdentifierVO2Max ?? [];

    const dayKeys = new Set<string>();
    restingHeartRateSamples.forEach((sample) =>
      dayKeys.add(this.dayKey(sample)),
    );
    hrvSamples.forEach((sample) => dayKeys.add(this.dayKey(sample)));
    heartRateSamples.forEach((sample) => dayKeys.add(this.dayKey(sample)));
    exerciseSamples.forEach((sample) => dayKeys.add(this.dayKey(sample)));
    vo2Samples.forEach((sample) => dayKeys.add(this.dayKey(sample)));

    const heartRateDaily = this.buildHeartRateDailyStats(heartRateSamples);
    const hrvDaily = this.buildAverageByDay(hrvSamples);
    const restingHrDaily = this.buildAverageByDay(restingHeartRateSamples);
    const vo2Daily = this.buildAverageByDay(vo2Samples);

    const summaries: CardioDaySummary[] = Array.from(dayKeys)
      .map((key) => ({
        date: key,
        restingHeartRate: restingHrDaily.get(key) ?? null,
        hrv: hrvDaily.get(key) ?? null,
        avgHeartRate: heartRateDaily.get(key)?.average ?? null,
        maxHeartRate: heartRateDaily.get(key)?.max ?? null,
        exerciseMinutes: this.findValueForDay(exerciseSamples, key),
        vo2Max: vo2Daily.get(key) ?? null,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const averages: CardioAverages = {
      restingHeartRate: this.averageFromSummaries(
        summaries,
        (summary) => summary.restingHeartRate,
      ),
      hrv: this.averageFromSummaries(summaries, (summary) => summary.hrv),
      avgHeartRate: this.averageFromSummaries(
        summaries,
        (summary) => summary.avgHeartRate,
      ),
      maxHeartRate: this.averageFromSummaries(
        summaries,
        (summary) => summary.maxHeartRate,
      ),
      exerciseMinutes: this.averageFromSummaries(
        summaries,
        (summary) => summary.exerciseMinutes,
      ),
      vo2Max: this.averageFromSummaries(summaries, (summary) => summary.vo2Max),
    };

    return {
      summaries,
      averages,
      coverage: {
        days: summaries.length,
        restingHrDays: this.countDaysWithValue(
          summaries,
          (summary) => summary.restingHeartRate,
        ),
        hrvDays: this.countDaysWithValue(summaries, (summary) => summary.hrv),
        heartRateDays: this.countDaysWithValue(
          summaries,
          (summary) => summary.avgHeartRate,
        ),
        exerciseDays: this.countDaysWithValue(
          summaries,
          (summary) => summary.exerciseMinutes,
        ),
        vo2Days: this.countDaysWithValue(
          summaries,
          (summary) => summary.vo2Max,
        ),
      },
      recovery: {
        hrvSamples,
        restingHeartRateSamples,
      },
      appleHealth,
    };
  }

  protected assessDataQuality(data: {
    summaries: CardioDaySummary[];
    averages: CardioAverages;
    coverage: {
      days: number;
      restingHrDays: number;
      hrvDays: number;
      heartRateDays: number;
      exerciseDays: number;
      vo2Days: number;
    };
  }): AgentDataQualityAssessment {
    const { summaries, coverage } = data;

    const strengths: string[] = [];
    const limitations: string[] = [];
    const missing: string[] = [];

    if (coverage.restingHrDays >= 21) {
      strengths.push("Resting heart rate captured across 3+ weeks");
    } else if (coverage.restingHrDays >= 7) {
      strengths.push("At least one week of resting heart rate data");
      limitations.push("Limited resting HR history (<21 days)");
    } else {
      missing.push("Resting heart rate trend");
    }

    if (coverage.hrvDays >= 21) {
      strengths.push("HRV coverage supports recovery analysis");
    } else if (coverage.hrvDays >= 7) {
      limitations.push("Limited HRV history (<21 days)");
    } else {
      missing.push("HRV samples");
    }

    if (coverage.heartRateDays >= 14) {
      strengths.push("Daily heart rate samples available");
    } else {
      limitations.push("Sparse day-level heart rate data");
    }

    if (coverage.exerciseDays >= 14) {
      strengths.push("Exercise minutes logged for load context");
    } else {
      limitations.push("Exercise minutes missing on many days");
    }

    if (coverage.vo2Days === 0) {
      limitations.push("VO2 max data unavailable");
    }

    const score =
      (coverage.restingHrDays >= 21
        ? 0.3
        : coverage.restingHrDays >= 7
          ? 0.2
          : 0) +
      (coverage.hrvDays >= 21 ? 0.25 : coverage.hrvDays >= 7 ? 0.15 : 0) +
      (coverage.heartRateDays >= 14 ? 0.2 : 0.1) +
      (coverage.exerciseDays >= 14 ? 0.15 : 0.05) +
      (coverage.vo2Days > 0 ? 0.1 : 0);

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

  protected formatDataForAnalysis(
    data: {
      summaries: CardioDaySummary[];
      averages: CardioAverages;
      recovery: CardioRecoveryData;
    },
    context?: AgentExecutionContext,
  ): string {
    const { summaries, averages } = data;
    const analysisMode = context?.analysisMode || "ongoing";

    const lines: string[] = [];

    // For initial analysis, use tiered format
    if (analysisMode === "initial") {
      lines.push(
        "═══════════════════════════════════════════════════════════════",
      );
      lines.push(
        "TIERED CARDIOVASCULAR ANALYSIS: ALL-TIME → 90-DAY → 30-DAY → RECENT WEEK",
      );
      lines.push(
        "═══════════════════════════════════════════════════════════════",
      );
      lines.push("");
      lines.push(
        "INSTRUCTIONS: Analyze cardiovascular patterns systematically from baseline to recent period.",
      );
      lines.push("1. Start with ALL-TIME BASELINE (resting HR, HRV averages)");
      lines.push("2. Compare 90-DAY PERIOD to baseline for medium-term trends");
      lines.push(
        "3. Compare 30-DAY PERIOD to identify recent cardiovascular shifts",
      );
      lines.push(
        "4. Examine RECENT WEEK for acute changes in heart rate metrics",
      );
      lines.push(
        "5. Look for CORRELATIONS (e.g., when exercise increases, does resting HR rise?)",
      );
      lines.push("");

      // Calculate period averages
      const recent30d = this.calculatePeriodAverages(summaries, 30);
      const recent90d = this.calculatePeriodAverages(summaries, 90);

      // TIER 1: ALL-TIME BASELINE
      lines.push(
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      );
      lines.push("TIER 1: ALL-TIME BASELINE (Full History)");
      lines.push(
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      );
      lines.push(
        `Resting HR: ${this.formatNumber(averages.restingHeartRate, 1)} bpm (average)`,
      );
      lines.push(
        `HRV: ${this.formatNumber(averages.hrv, 1)} ms (average autonomic balance)`,
      );
      lines.push(
        `Avg Daytime HR: ${this.formatNumber(averages.avgHeartRate, 1)} bpm`,
      );
      lines.push(
        `Peak HR: ${this.formatNumber(averages.maxHeartRate, 1)} bpm (max observed)`,
      );
      if (averages.vo2Max !== null) {
        lines.push(
          `VO2 Max: ${this.formatNumber(averages.vo2Max, 1)} ml/kg/min (cardio fitness)`,
        );
      }
      lines.push("");

      // TIER 2: 90-DAY PERIOD
      lines.push(
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      );
      lines.push("TIER 2: 90-DAY PERIOD (vs Baseline)");
      lines.push(
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      );
      if (
        recent90d.restingHeartRate !== null &&
        averages.restingHeartRate !== null
      ) {
        const diff = recent90d.restingHeartRate - averages.restingHeartRate;
        lines.push(
          `Resting HR: ${this.formatNumber(recent90d.restingHeartRate, 1)} bpm (${diff > 0 ? "+" : ""}${this.formatNumber(diff, 1)} vs baseline)`,
        );
      }
      if (recent90d.hrv !== null && averages.hrv !== null) {
        const diff = recent90d.hrv - averages.hrv;
        lines.push(
          `HRV: ${this.formatNumber(recent90d.hrv, 1)} ms (${diff > 0 ? "+" : ""}${this.formatNumber(diff, 1)} vs baseline)`,
        );
      }
      if (recent90d.exerciseMinutes !== null) {
        lines.push(
          `Exercise: ${this.formatNumber(recent90d.exerciseMinutes, 1)} min/day`,
        );
      }
      lines.push("");

      // TIER 3: 30-DAY PERIOD
      lines.push(
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      );
      lines.push("TIER 3: 30-DAY PERIOD (Recent Trend)");
      lines.push(
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      );
      if (
        recent30d.restingHeartRate !== null &&
        recent90d.restingHeartRate !== null
      ) {
        const diff = recent30d.restingHeartRate - recent90d.restingHeartRate;
        lines.push(
          `Resting HR: ${this.formatNumber(recent30d.restingHeartRate, 1)} bpm (${diff > 0 ? "+" : ""}${this.formatNumber(diff, 1)} vs 90-day)`,
        );
      }
      if (recent30d.hrv !== null && recent90d.hrv !== null) {
        const diff = recent30d.hrv - recent90d.hrv;
        lines.push(
          `HRV: ${this.formatNumber(recent30d.hrv, 1)} ms (${diff > 0 ? "+" : ""}${this.formatNumber(diff, 1)} vs 90-day)`,
        );
      }
      lines.push("");

      // TIER 4: RECENT WEEK
      lines.push(
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      );
      lines.push("TIER 4: RECENT WEEK (Latest Activity)");
      lines.push(
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      );
      summaries.slice(-7).forEach((summary) => {
        lines.push(
          `${summary.date}: RHR=${this.formatNumber(summary.restingHeartRate)}bpm | HRV=${this.formatNumber(summary.hrv, 1)}ms | Avg=${this.formatNumber(summary.avgHeartRate)}bpm | Max=${this.formatNumber(summary.maxHeartRate)}bpm`,
        );
      });
    } else {
      // For ongoing analysis, use simple format
      lines.push("CARDIO DATA SUMMARY (last 30 days if available):");
      summaries.slice(-30).forEach((summary) => {
        lines.push(
          `  ${summary.date}: restingHR=${this.formatNumber(summary.restingHeartRate)} bpm | HRV=${this.formatNumber(summary.hrv, 1)} ms | avgHR=${this.formatNumber(summary.avgHeartRate)} bpm | maxHR=${this.formatNumber(summary.maxHeartRate)} bpm | exercise=${this.formatNumber(summary.exerciseMinutes, 1)} min`,
        );
      });

      lines.push("");
      lines.push("AVERAGES (entire period):");
      lines.push(
        `  • Resting HR: ${this.formatNumber(averages.restingHeartRate, 1)} bpm`,
      );
      lines.push(`  • HRV: ${this.formatNumber(averages.hrv, 1)} ms`);
      lines.push(
        `  • Avg Daytime HR: ${this.formatNumber(averages.avgHeartRate, 1)} bpm`,
      );
      lines.push(
        `  • Peak HR: ${this.formatNumber(averages.maxHeartRate, 1)} bpm`,
      );
      lines.push(
        `  • Exercise Minutes: ${this.formatNumber(averages.exerciseMinutes, 1)} min/day`,
      );
      if (averages.vo2Max !== null) {
        lines.push(
          `  • VO2 Max: ${this.formatNumber(averages.vo2Max, 1)} ml/kg/min`,
        );
      }
    }

    return lines.join("\n");
  }

  private calculatePeriodAverages(
    summaries: CardioDaySummary[],
    days: number,
  ): CardioAverages {
    const recent = summaries.slice(-days);
    return {
      restingHeartRate: this.averageFromSummaries(
        recent,
        (s) => s.restingHeartRate,
      ),
      hrv: this.averageFromSummaries(recent, (s) => s.hrv),
      avgHeartRate: this.averageFromSummaries(recent, (s) => s.avgHeartRate),
      maxHeartRate: this.averageFromSummaries(recent, (s) => s.maxHeartRate),
      exerciseMinutes: this.averageFromSummaries(
        recent,
        (s) => s.exerciseMinutes,
      ),
      vo2Max: this.averageFromSummaries(recent, (s) => s.vo2Max),
    };
  }

  protected buildDetailedPrompt(
    query: string,
    data: {
      summaries: CardioDaySummary[];
      averages: CardioAverages;
      recovery: CardioRecoveryData;
    },
    quality: AgentDataQualityAssessment,
  ): string {
    const basePrompt = super.buildDetailedPrompt(query, data, quality);
    const { summaries, averages } = data;

    const totalRestingHrPoints = summaries.reduce(
      (sum, summary) => sum + (summary.restingHeartRate ?? 0),
      0,
    );
    const totalHrvPoints = summaries.reduce(
      (sum, summary) => sum + (summary.hrv ?? 0),
      0,
    );

    const directedPrompts: string[] = [
      `Total resting HR readings accumulated: ${this.formatNumber(totalRestingHrPoints, 1)}`,
      `Total HRV sum: ${this.formatNumber(totalHrvPoints, 1)} ms`,
      "Identify meaningful changes in resting HR or HRV (e.g., >5 bpm increase in resting HR, >10 ms HRV shifts).",
      "Flag elevated risk only when resting HR trend and HRV trend both deteriorate.",
      "Describe intensity exposure by referencing max heart rate patterns if available.",
      "Connect exercise minutes to recovery signals (resting HR and HRV).",
      "Limit output to the most material findings: max 3 findings, 2 trends, 2 recommendations.",
      "Only populate concerns for clinically relevant issues (severity moderate or high).",
      "Keep sentences under 20 words and lead with the statistic before interpretation.",
    ];

    if (averages.vo2Max !== null) {
      directedPrompts.push(
        `Include VO2 max context (average ${this.formatNumber(averages.vo2Max, 1)} ml/kg/min) when assessing aerobic capacity.`,
      );
    } else {
      directedPrompts.push(
        "Mention VO2 max as unavailable only if it constrains the conclusion.",
      );
    }

    return `${basePrompt}

CARDIOVASCULAR CONTEXT:
${directedPrompts.map((line) => `- ${line}`).join("\n")}`;
  }

  protected postProcessInsight(
    insight: AgentInsight,
    data: {
      summaries: CardioDaySummary[];
      averages: CardioAverages;
      recovery: CardioRecoveryData;
      coverage: {
        days: number;
        restingHrDays: number;
        hrvDays: number;
        heartRateDays: number;
        exerciseDays: number;
        vo2Days: number;
      };
      appleHealth: AppleHealthMetricMap;
    },
    quality: AgentDataQualityAssessment,
    context: AgentExecutionContext,
    extras?: Record<string, unknown>,
  ): AgentInsight {
    void context;
    void extras;

    const vo2Values = data.summaries
      .map((summary) => summary.vo2Max)
      .filter((value): value is number => value !== null);

    const vo2Range = vo2Values.length
      ? [Math.min(...vo2Values), Math.max(...vo2Values)]
      : null;

    const vo2Trend =
      vo2Values.length >= 2
        ? vo2Values[vo2Values.length - 1] - vo2Values[0]
        : null;

    const maxHeartRateValues = data.summaries
      .map((summary) => summary.maxHeartRate)
      .filter((value): value is number => value !== null);

    insight.metadata = {
      ...(insight.metadata ?? {}),
      averages: data.averages,
      coverage: data.coverage,
      vo2: {
        range: vo2Range,
        trend: vo2Trend,
        readings: vo2Values.length,
      },
      heartRate: {
        maxRange: maxHeartRateValues.length
          ? [Math.min(...maxHeartRateValues), Math.max(...maxHeartRateValues)]
          : null,
      },
      strengths: quality.strengths,
      limitations: quality.limitations,
      score: quality.score,
    };

    return insight;
  }

  private buildHeartRateDailyStats(
    samples: MetricSample[],
  ): Map<string, { average: number; max: number }> {
    const daily = new Map<
      string,
      { total: number; count: number; max: number }
    >();

    samples.forEach((sample) => {
      const key = this.dayKey(sample);
      if (!daily.has(key)) {
        daily.set(key, { total: 0, count: 0, max: sample.value });
      }
      const entry = daily.get(key)!;
      entry.total += sample.value;
      entry.count += 1;
      if (sample.value > entry.max) {
        entry.max = sample.value;
      }
    });

    const result = new Map<string, { average: number; max: number }>();
    daily.forEach((entry, key) => {
      if (entry.count === 0) {
        return;
      }
      result.set(key, {
        average: Math.round((entry.total / entry.count) * 10) / 10,
        max: Math.round(entry.max * 10) / 10,
      });
    });
    return result;
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

  private averageFromSummaries(
    summaries: CardioDaySummary[],
    selector: (summary: CardioDaySummary) => number | null,
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
    summaries: CardioDaySummary[],
    selector: (summary: CardioDaySummary) => number | null,
  ): number {
    return summaries.reduce((count, summary) => {
      const value = selector(summary);
      return value !== null ? count + 1 : count;
    }, 0);
  }

  private dayKey(sample: MetricSample): string {
    const date = new Date(sample.timestamp.getTime());
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().split("T")[0];
  }

  private findValueForDay(samples: MetricSample[], key: string): number | null {
    const match = samples.find((sample) => this.dayKey(sample) === key);
    return match ? Math.round(match.value * 10) / 10 : null;
  }

  private formatNumber(value: number | null, digits: number = 0): string {
    if (value === null || Number.isNaN(value)) return "n/a";
    return value.toFixed(digits);
  }

  private dateRangeFromSummaries(
    summaries: CardioDaySummary[],
  ): { start: Date; end: Date } | undefined {
    if (!summaries.length) return undefined;
    const start = new Date(`${summaries[0].date}T00:00:00`);
    const end = new Date(`${summaries[summaries.length - 1].date}T00:00:00`);
    return { start, end };
  }
}
