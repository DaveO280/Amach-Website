import { BaseHealthAgent } from "./BaseHealthAgent";
import type {
  AgentDataQualityAssessment,
  AgentExecutionContext,
  AgentInsight,
  AppleHealthMetricMap,
  MetricSample,
} from "./types";

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

    const dayKeys = new Set<string>();
    stepsSamples.forEach((sample) => dayKeys.add(this.dayKey(sample)));
    activeEnergySamples.forEach((sample) => dayKeys.add(this.dayKey(sample)));
    exerciseSamples.forEach((sample) => dayKeys.add(this.dayKey(sample)));

    const summaries: DailyActivitySummary[] = Array.from(dayKeys)
      .map((key) => ({
        date: key,
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
  }): AgentDataQualityAssessment {
    const { summaries, averages, coverage, heartRateZones } = data;

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
  }): string {
    const { summaries, averages, recovery, heartRateZones } = data;

    const lines: string[] = [];

    lines.push("DAILY ACTIVITY SUMMARY (last 30 days if available):");
    summaries
      .slice(-30)
      .forEach(({ date, steps, activeEnergy, exerciseMinutes }) => {
        lines.push(
          `  ${date}: steps=${this.formatNumber(steps)} | activeEnergy=${this.formatNumber(activeEnergy)} kcal | exercise=${this.formatNumber(exerciseMinutes)} min`,
        );
      });

    lines.push("");
    lines.push("AVERAGES (entire period):");
    lines.push(`  • Steps: ${this.formatNumber(averages.steps)} steps/day`);
    lines.push(
      `  • Active Energy: ${this.formatNumber(averages.activeEnergy, 1)} kcal/day`,
    );
    lines.push(
      `  • Exercise Minutes: ${this.formatNumber(averages.exerciseMinutes, 1)} min/day`,
    );
    if (averages.hrv !== null) {
      lines.push(`  • HRV: ${this.formatNumber(averages.hrv, 1)} ms`);
    }
    if (averages.restingHeartRate !== null) {
      lines.push(
        `  • Resting Heart Rate: ${this.formatNumber(averages.restingHeartRate, 1)} bpm`,
      );
    }
    if (averages.highIntensityMinutes !== null) {
      lines.push(
        `  • High-Intensity (Zones 4-5): ${this.formatNumber(averages.highIntensityMinutes, 1)} min/day (~${this.formatNumber(averages.highIntensityMinutes * 7, 1)} min/week)`,
      );
    }
    if (averages.moderateIntensityMinutes !== null) {
      lines.push(
        `  • Moderate Intensity (Zones 2-3): ${this.formatNumber(averages.moderateIntensityMinutes, 1)} min/day (~${this.formatNumber(averages.moderateIntensityMinutes * 7, 1)} min/week)`,
      );
    }
    if (
      averages.highIntensityMinutes !== null ||
      averages.moderateIntensityMinutes !== null
    ) {
      const weeklyModerateEquivalent =
        (averages.moderateIntensityMinutes ?? 0) * 7 +
        (averages.highIntensityMinutes ?? 0) * 7 * 2;
      lines.push(
        `  • Moderate-equivalent aerobic load: ~${this.formatNumber(weeklyModerateEquivalent, 1)} minutes/week`,
      );
    }

    if (heartRateZones) {
      lines.push("");
      lines.push("HEART RATE ZONE DISTRIBUTION (estimated):");
      lines.push(
        `  • Zone 1 (<60% max): ${this.formatNumber(heartRateZones.zone1Minutes, 1)} min`,
      );
      lines.push(
        `  • Zone 2 (60-70%): ${this.formatNumber(heartRateZones.zone2Minutes, 1)} min`,
      );
      lines.push(
        `  • Zone 3 (70-80%): ${this.formatNumber(heartRateZones.zone3Minutes, 1)} min`,
      );
      lines.push(
        `  • Zone 4 (80-90%): ${this.formatNumber(heartRateZones.zone4Minutes, 1)} min`,
      );
      lines.push(
        `  • Zone 5 (>90%): ${this.formatNumber(heartRateZones.zone5Minutes, 1)} min`,
      );
      lines.push(
        `  • Total sampled time: ${this.formatNumber(heartRateZones.totalMinutes, 1)} min`,
      );
    }

    if (recovery.hrv.length || recovery.restingHeartRate.length) {
      lines.push("");
      lines.push("RECOVERY METRICS:");
      if (recovery.hrv.length) {
        const latest = recovery.hrv[recovery.hrv.length - 1];
        lines.push(
          `  • Latest HRV: ${this.formatNumber(latest.value, 1)} ms (${latest.timestamp.toISOString().split("T")[0]})`,
        );
      }
      if (recovery.restingHeartRate.length) {
        const latest =
          recovery.restingHeartRate[recovery.restingHeartRate.length - 1];
        lines.push(
          `  • Latest Resting HR: ${this.formatNumber(latest.value, 1)} bpm (${latest.timestamp.toISOString().split("T")[0]})`,
        );
      }
    }

    return lines.join("\n");
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
    },
    quality: AgentDataQualityAssessment,
  ): string {
    const basePrompt = super.buildDetailedPrompt(query, data, quality);
    const { summaries, averages, recovery, heartRateZones } = data;

    const latest = summaries[summaries.length - 1];

    const directedPrompts: string[] = [
      "Focus on trends in daily movement, exercise consistency, and energy expenditure.",
      "Identify any sedentary patterns or significant deviations from average activity levels.",
      "Provide actionable recommendations to optimize activity and energy balance.",
      "Only populate the `concerns` array for moderate or high severity issues.",
      "When data appears healthy, frame recommendations as positive reinforcement rather than warnings.",
      "Reference specific metrics and their values in your findings and recommendations.",
    ];

    if (averages.steps !== null) {
      directedPrompts.push(
        `Reference average steps ${this.formatNumber(averages.steps)} steps/day.`,
      );
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

    if (latest) {
      directedPrompts.push(
        `Include the most recent day snapshot (${latest.date}) with steps ${this.formatNumber(latest.steps)}, active energy ${this.formatNumber(latest.activeEnergy)} kcal, exercise ${this.formatNumber(latest.exerciseMinutes)} min.`,
      );
    }
    if (recovery.hrv.length) {
      const recent = recovery.hrv[recovery.hrv.length - 1];
      directedPrompts.push(
        `Reference latest HRV sample ${this.formatNumber(recent.value, 1)} ms (${recent.timestamp.toISOString().split("T")[0]}).`,
      );
    }
    if (recovery.restingHeartRate.length) {
      const recent =
        recovery.restingHeartRate[recovery.restingHeartRate.length - 1];
      directedPrompts.push(
        `Reference latest resting HR ${this.formatNumber(recent.value, 1)} bpm (${recent.timestamp.toISOString().split("T")[0]}).`,
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

    // Count sedentary days (<5000 steps)
    const sedentaryDayCount = summaries.filter(
      (s) => (s.steps ?? 0) < 5000,
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

  private averageValue(samples: MetricSample[]): number | null {
    if (!samples.length) return null;
    const sum = samples.reduce((total, sample) => total + sample.value, 0);
    return Math.round((sum / samples.length) * 10) / 10;
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
