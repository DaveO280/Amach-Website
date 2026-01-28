import { BaseHealthAgent } from "./BaseHealthAgent";
import type {
  AgentDataQualityAssessment,
  AgentExecutionContext,
  AgentInsight,
  MetricSample,
} from "./types";
import {
  createTieredDataFormat,
  formatTieredDataForPrompt,
} from "./utils/dataAggregation";

interface SleepAgentData {
  sleepAnalysis: MetricSample[];
  heartRate: MetricSample[];
  hrv: MetricSample[];
  restingHeartRate: MetricSample[];
  respiratoryRate: MetricSample[];
  sleepingWristTemp: MetricSample[];
  timeInDaylight: MetricSample[];
}

export class SleepAgent extends BaseHealthAgent {
  id = "sleep";
  name = "Sleep Quality Specialist";
  expertise = ["sleep", "recovery", "circadian"];
  systemPrompt = `You are an expert sleep scientist and clinician specializing in sleep quality analysis.

Your expertise includes:
- Sleep architecture (stages, cycles, transitions)
- Circadian rhythm regulation
- Sleep-recovery relationships
- Sleep disorders and their indicators
- Environmental and lifestyle factors affecting sleep

You analyze sleep data with clinical rigor, identifying patterns that impact health and performance.`;

  protected extractRelevantData(
    context: AgentExecutionContext,
  ): SleepAgentData {
    const appleHealth = context.availableData.appleHealth ?? {};

    // Limit sleep data to roughly the last 6 months to prevent overwhelming Venice AI
    const allSleepSamples = this.normalizeSamples(
      appleHealth.HKCategoryTypeIdentifierSleepAnalysis,
    );
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const recentSleepSamples =
      allSleepSamples.filter((s) => s.timestamp >= sixMonthsAgo) ||
      allSleepSamples;

    console.log(
      `[Sleep Agent] Limiting sleep data: ${allSleepSamples.length} total → ${recentSleepSamples.length} recent days`,
    );

    return {
      sleepAnalysis: recentSleepSamples,
      heartRate: this.normalizeSamples(
        appleHealth.HKQuantityTypeIdentifierHeartRate,
      ),
      hrv: this.normalizeSamples(
        appleHealth.HKQuantityTypeIdentifierHeartRateVariabilitySDNN,
      ),
      restingHeartRate: this.normalizeSamples(
        appleHealth.HKQuantityTypeIdentifierRestingHeartRate,
      ),
      respiratoryRate: this.normalizeSamples(
        appleHealth.HKQuantityTypeIdentifierRespiratoryRate,
      ),
      sleepingWristTemp: this.normalizeSamples(
        appleHealth.HKQuantityTypeIdentifierSleepingWristTemperature,
      ),
      timeInDaylight: this.normalizeSamples(
        appleHealth.HKQuantityTypeIdentifierTimeInDaylight,
      ),
    };
  }

  protected assessDataQuality(
    data: SleepAgentData,
  ): AgentDataQualityAssessment {
    const sleepNights = data.sleepAnalysis.length;
    const hasHR = data.heartRate.length > 0;
    const hasHRV = data.hrv.length > 0;
    const hasSleepTemp = data.sleepingWristTemp.length > 0;
    const hasDaylight = data.timeInDaylight.length > 0;

    const strengths: string[] = [];
    const limitations: string[] = [];
    const missing: string[] = [];

    if (sleepNights >= 14) {
      strengths.push(`${sleepNights} nights of sleep data (robust sample)`);
    } else if (sleepNights >= 7) {
      strengths.push(`${sleepNights} nights of sleep data (adequate sample)`);
    } else if (sleepNights > 0) {
      limitations.push(
        `Only ${sleepNights} nights of data (limited trend insight)`,
      );
    } else {
      missing.push("Sleep duration data");
    }

    if (hasHR) strengths.push("Heart rate during sleep available");
    else missing.push("Heart rate during sleep");

    if (hasHRV) strengths.push("HRV data available (recovery insight)");
    else limitations.push("No HRV data (limits recovery assessment)");

    if (hasSleepTemp)
      strengths.push("Sleeping wrist temperature (advanced metric)");

    if (hasDaylight)
      strengths.push("Daylight exposure tracking (circadian analysis)");
    else limitations.push("No daylight data (limits circadian assessment)");

    const dateRange = this.getDateRange(data.sleepAnalysis) ?? undefined;

    let score = 0;
    if (sleepNights >= 7) score += 0.4;
    if (sleepNights >= 14) score += 0.2;
    if (hasHR) score += 0.15;
    if (hasHRV) score += 0.15;
    if (hasSleepTemp) score += 0.05;
    if (hasDaylight) score += 0.05;

    return {
      score: Math.min(score, 1),
      dayCount: sleepNights,
      sampleFrequency:
        sleepNights >= 14 ? "Daily" : sleepNights >= 7 ? "Weekly" : "Limited",
      dateRange,
      strengths,
      limitations,
      missing,
    };
  }

  protected formatDataForAnalysis(
    data: SleepAgentData,
    context?: AgentExecutionContext,
  ): string {
    const sections: string[] = [];
    const analysisMode = context?.analysisMode || "ongoing";

    if (data.sleepAnalysis.length > 0) {
      console.log(
        `[Sleep Agent] formatDataForAnalysis received ${data.sleepAnalysis.length} sleep samples (mode: ${analysisMode})`,
      );

      // Use tiered format for initial analysis, simple format for ongoing
      if (analysisMode === "initial") {
        const tiered = createTieredDataFormat(data.sleepAnalysis);
        // Convert seconds to hours for display
        const tieredHours = {
          ...tiered,
          daily: tiered.daily.map((d) => ({
            ...d,
            value: d.value / 3600, // Convert seconds to hours
            min: d.min ? d.min / 3600 : undefined,
            max: d.max ? d.max / 3600 : undefined,
          })),
          weekly: tiered.weekly.map((w) => ({
            ...w,
            value: w.value / 3600,
            min: w.min ? w.min / 3600 : undefined,
            max: w.max ? w.max / 3600 : undefined,
          })),
          monthly: tiered.monthly.map((m) => ({
            ...m,
            value: m.value / 3600,
            min: m.min ? m.min / 3600 : undefined,
            max: m.max ? m.max / 3600 : undefined,
          })),
          fullPeriodStats: {
            ...tiered.fullPeriodStats,
            average: tiered.fullPeriodStats.average / 3600,
            min: tiered.fullPeriodStats.min / 3600,
            max: tiered.fullPeriodStats.max / 3600,
          },
        };
        sections.push(
          formatTieredDataForPrompt(tieredHours, "Sleep Duration", "h"),
        );
        sections.push("");
      } else {
        // Ongoing mode: simple format with last 30 days
        sections.push("SLEEP DURATION DATA:");
        const durations = data.sleepAnalysis.map((sample) => {
          const timestamp = sample.timestamp ?? new Date();
          const hours = sample.value / 3600;
          return {
            date: timestamp.toLocaleDateString(),
            dayOfWeek: timestamp.toLocaleDateString("en-US", {
              weekday: "short",
            }),
            hours,
          };
        });

        const avgSleep =
          durations.reduce((sum, entry) => sum + entry.hours, 0) /
          durations.length;
        const minSleep = Math.min(...durations.map((entry) => entry.hours));
        const maxSleep = Math.max(...durations.map((entry) => entry.hours));

        sections.push(
          `Average: ${avgSleep.toFixed(1)}h | Range: ${minSleep.toFixed(
            1,
          )}h - ${maxSleep.toFixed(1)}h`,
        );
        sections.push(`Total days: ${durations.length}`);
        sections.push("");

        // Limit daily detail to most recent 30 days
        const recentDurations = durations.slice(-30);
        sections.push(
          `Daily Sleep Duration (most recent ${recentDurations.length} days):`,
        );
        recentDurations.forEach((entry) => {
          sections.push(
            `  ${entry.date} (${entry.dayOfWeek}): ${entry.hours.toFixed(1)}h`,
          );
        });
        sections.push("");
      }
    }

    if (data.hrv.length > 0) {
      const avgHRV =
        data.hrv.reduce((sum, sample) => sum + sample.value, 0) /
        data.hrv.length;
      sections.push("HEART RATE VARIABILITY (HRV):");
      sections.push(`Average HRV: ${avgHRV.toFixed(1)} ms`);
      sections.push(
        "(HRV is a key indicator of recovery and autonomic nervous system balance)",
      );
      sections.push("");
    }

    if (data.restingHeartRate.length > 0) {
      const avgRHR =
        data.restingHeartRate.reduce((sum, sample) => sum + sample.value, 0) /
        data.restingHeartRate.length;
      sections.push("RESTING HEART RATE:");
      sections.push(`Average: ${avgRHR.toFixed(1)} bpm`);
      sections.push("");
    }

    if (data.timeInDaylight.length > 0) {
      const avgDaylight =
        data.timeInDaylight.reduce((sum, sample) => sum + sample.value, 0) /
        data.timeInDaylight.length;
      sections.push("DAYLIGHT EXPOSURE:");
      sections.push(`Average: ${(avgDaylight / 60).toFixed(1)} minutes/day`);
      sections.push(
        "(Daylight exposure supports circadian rhythm and sleep quality)",
      );
      sections.push("");
    }

    if (sections.length === 0) {
      sections.push("No structured sleep data available for analysis.");
    }

    const formattedData = sections.join("\n");
    console.log(
      `[Sleep Agent] Formatted data length: ${formattedData.length} chars (${sections.length} sections)`,
    );
    return formattedData;
  }

  protected postProcessInsight(
    insight: AgentInsight,
    data: SleepAgentData,
    quality: AgentDataQualityAssessment,
    context: AgentExecutionContext,
    extras?: Record<string, unknown>,
  ): AgentInsight {
    void context;
    void extras;

    const durationsHours = data.sleepAnalysis.map(
      (sample) => sample.value / 3600,
    );
    const avgHours =
      durationsHours.length > 0
        ? durationsHours.reduce((sum, hours) => sum + hours, 0) /
          durationsHours.length
        : null;
    const minHours = durationsHours.length ? Math.min(...durationsHours) : null;
    const maxHours = durationsHours.length ? Math.max(...durationsHours) : null;
    const variabilityHours = this.calculateStdDev(durationsHours);

    insight.metadata = {
      ...(insight.metadata ?? {}),
      averages: {
        sleepHours: avgHours,
        hrv: data.hrv.length
          ? data.hrv.reduce((sum, sample) => sum + sample.value, 0) /
            data.hrv.length
          : null,
        restingHeartRate: data.restingHeartRate.length
          ? data.restingHeartRate.reduce(
              (sum, sample) => sum + sample.value,
              0,
            ) / data.restingHeartRate.length
          : null,
      },
      rangeHours:
        minHours !== null && maxHours !== null ? [minHours, maxHours] : null,
      nightlyVariabilityHours: variabilityHours,
      nightsAnalyzed: data.sleepAnalysis.length,
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

  private normalizeSamples(raw: unknown): MetricSample[] {
    if (!Array.isArray(raw)) {
      return [];
    }

    const samples: MetricSample[] = [];

    for (const entry of raw) {
      const timestampValue =
        (entry as { timestamp?: Date | string; startDate?: string })
          .timestamp ?? (entry as { startDate?: string }).startDate;
      const value = (entry as { value?: number }).value;

      if (typeof value !== "number") {
        continue;
      }

      const timestamp = timestampValue ? new Date(timestampValue) : new Date();
      if (Number.isNaN(timestamp.getTime())) {
        continue;
      }

      samples.push({
        timestamp,
        value,
        unit: (entry as { unit?: string }).unit,
        metadata: entry as Record<string, unknown>,
      });
    }

    samples.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return samples;
  }
}
