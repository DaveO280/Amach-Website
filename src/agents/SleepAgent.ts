import { BaseHealthAgent } from "./BaseHealthAgent";
import type {
  AgentDataQualityAssessment,
  AgentExecutionContext,
  AgentInsight,
  MetricSample,
} from "./types";
import { createTieredDataFormat } from "./utils/dataAggregation";

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

    // Daylight removed - not available in meaningful way in data

    const dateRange = this.getDateRange(data.sleepAnalysis) ?? undefined;

    let score = 0;
    if (sleepNights >= 7) score += 0.4;
    if (sleepNights >= 14) score += 0.2;
    if (hasHR) score += 0.15;
    if (hasHRV) score += 0.15;
    if (hasSleepTemp) score += 0.1; // Redistribute daylight's 0.05 here

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

      // Extract sleep stage data from metadata
      // Metadata structure: { efficiency, totalDuration, stages: { core, deep, rem, awake }, date }
      const sleepWithStages = data.sleepAnalysis.filter((s) => {
        const meta = s.metadata as
          | {
              stages?: {
                deep?: number;
                rem?: number;
                core?: number;
                awake?: number;
              };
              efficiency?: number;
              totalDuration?: number;
              date?: string;
            }
          | undefined;
        const stages = meta?.stages;
        return stages && (stages.deep || stages.rem || stages.core);
      });
      const hasStageData = sleepWithStages.length > 0;

      // Calculate stage averages if available
      let avgDeep = 0;
      let avgRem = 0;
      let avgCore = 0;
      let avgEfficiency = 0;
      if (hasStageData) {
        const stageData = sleepWithStages.map((s) => {
          const meta = s.metadata as
            | {
                stages?: {
                  deep?: number;
                  rem?: number;
                  core?: number;
                  awake?: number;
                };
                efficiency?: number;
              }
            | undefined;
          const stages = meta?.stages;
          const efficiency = meta?.efficiency || 0;
          const duration = s.value / 3600; // hours
          return {
            duration,
            deep: (stages?.deep || 0) / 60, // minutes to hours
            rem: (stages?.rem || 0) / 60,
            core: (stages?.core || 0) / 60,
            efficiency,
          };
        });

        avgDeep =
          stageData.reduce((sum, s) => sum + s.deep, 0) / stageData.length;
        avgRem =
          stageData.reduce((sum, s) => sum + s.rem, 0) / stageData.length;
        avgCore =
          stageData.reduce((sum, s) => sum + s.core, 0) / stageData.length;
        avgEfficiency =
          stageData.reduce((sum, s) => sum + s.efficiency, 0) /
          stageData.length;
      }

      // Use tiered format for initial analysis, simple format for ongoing
      if (analysisMode === "initial") {
        const tiered = createTieredDataFormat(data.sleepAnalysis);
        // Convert seconds to hours for display - ALL values need conversion
        const tieredHours = {
          ...tiered,
          daily: tiered.daily.slice(-30).map((d) => ({
            ...d,
            value: d.value / 3600,
            min: d.min ? d.min / 3600 : undefined,
            max: d.max ? d.max / 3600 : undefined,
          })),
          weekly: tiered.weekly.slice(-12).map((w) => ({
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
        // Use compact format instead of verbose tiered format
        sections.push("SLEEP DURATION:");
        sections.push(
          `Avg: ${tieredHours.fullPeriodStats.average.toFixed(1)}h | Range: ${tieredHours.fullPeriodStats.min.toFixed(1)}h-${tieredHours.fullPeriodStats.max.toFixed(1)}h | Days: ${tieredHours.fullPeriodStats.totalDays}`,
        );
        sections.push(
          `Period: ${tieredHours.fullPeriodStats.dateRange.start.toLocaleDateString()} to ${tieredHours.fullPeriodStats.dateRange.end.toLocaleDateString()}`,
        );
        sections.push("");

        // Monthly summary (compact)
        if (tieredHours.monthly.length > 0) {
          sections.push(
            "Monthly: " +
              tieredHours.monthly
                .map((m) => `${m.month}: ${m.value.toFixed(1)}h`)
                .join(" | "),
          );
          sections.push("");
        }

        // Weekly summary (last 6 weeks only, more compact)
        if (tieredHours.weekly.length > 0) {
          const recentWeeks = tieredHours.weekly.slice(-6);
          sections.push("Recent weeks:");
          recentWeeks.forEach((w) => {
            sections.push(
              `  ${w.weekStart}: ${w.value.toFixed(1)}h (${w.count}d)`,
            );
          });
          sections.push("");
        }

        // Daily (last 10 days only, more compact)
        if (tieredHours.daily.length > 0) {
          const recentDays = tieredHours.daily.slice(-10);
          sections.push("Recent days:");
          recentDays.forEach((d) => {
            const date = new Date(d.date);
            const dow = date.toLocaleDateString("en-US", { weekday: "short" });
            sections.push(`  ${d.date} (${dow}): ${d.value.toFixed(1)}h`);
          });
          sections.push("");
        }

        // Add sleep stage summary if available
        if (hasStageData) {
          const avgSleepHours = tiered.fullPeriodStats.average / 3600;
          sections.push("SLEEP STAGES (6-month averages):");
          sections.push(
            `Deep: ${avgDeep.toFixed(1)}h (${((avgDeep / avgSleepHours) * 100).toFixed(0)}%) | REM: ${avgRem.toFixed(1)}h (${((avgRem / avgSleepHours) * 100).toFixed(0)}%) | Core: ${avgCore.toFixed(1)}h (${((avgCore / avgSleepHours) * 100).toFixed(0)}%)`,
          );
          sections.push(`Sleep Efficiency: ${avgEfficiency.toFixed(0)}%`);
          sections.push("");
        }
      } else {
        // Ongoing mode: compact format
        const durations = data.sleepAnalysis.map((sample) => {
          const timestamp = sample.timestamp ?? new Date();
          const hours = sample.value / 3600;
          return {
            date: timestamp.toLocaleDateString(),
            hours,
            stages: sample.metadata?.stages as
              | { deep?: number; rem?: number; core?: number }
              | undefined,
            efficiency: (sample.metadata?.efficiency as number) || undefined,
          };
        });

        const avgSleep =
          durations.reduce((sum, entry) => sum + entry.hours, 0) /
          durations.length;
        const minSleep = Math.min(...durations.map((entry) => entry.hours));
        const maxSleep = Math.max(...durations.map((entry) => entry.hours));

        sections.push("SLEEP DURATION:");
        sections.push(
          `Avg: ${avgSleep.toFixed(1)}h | Range: ${minSleep.toFixed(1)}h-${maxSleep.toFixed(1)}h | Days: ${durations.length}`,
        );

        if (hasStageData) {
          sections.push(
            `Stages: Deep ${avgDeep.toFixed(1)}h | REM ${avgRem.toFixed(1)}h | Core ${avgCore.toFixed(1)}h | Efficiency: ${avgEfficiency.toFixed(0)}%`,
          );
        }

        // Only show last 14 days (more compact)
        const recent = durations.slice(-14);
        sections.push(`Recent (${recent.length} days):`);
        recent.forEach((entry) => {
          const stageInfo = entry.stages
            ? ` | D:${((entry.stages.deep || 0) / 60).toFixed(1)}h R:${((entry.stages.rem || 0) / 60).toFixed(1)}h`
            : "";
          const effInfo = entry.efficiency
            ? ` Eff:${entry.efficiency.toFixed(0)}%`
            : "";
          sections.push(
            `  ${entry.date}: ${entry.hours.toFixed(1)}h${stageInfo}${effInfo}`,
          );
        });
        sections.push("");
      }
    }

    // Add daily HRV/RHR aligned with sleep dates for correlation (compact format)
    if (data.hrv.length > 0 && data.sleepAnalysis.length > 0) {
      // Create date-indexed maps for correlation
      const sleepByDate = new Map<string, number>();
      data.sleepAnalysis.forEach((s) => {
        const dateKey = s.timestamp.toISOString().split("T")[0];
        sleepByDate.set(dateKey, s.value / 3600);
      });

      const hrvByDate = new Map<string, number[]>();
      data.hrv.forEach((s) => {
        const dateKey = s.timestamp.toISOString().split("T")[0];
        if (!hrvByDate.has(dateKey)) hrvByDate.set(dateKey, []);
        hrvByDate.get(dateKey)!.push(s.value);
      });

      // Find dates with both sleep and HRV
      const correlatedDates = Array.from(sleepByDate.keys()).filter((date) =>
        hrvByDate.has(date),
      );

      if (correlatedDates.length > 0) {
        const avgHRV =
          data.hrv.reduce((sum, s) => sum + s.value, 0) / data.hrv.length;
        sections.push(
          `HRV: Avg ${avgHRV.toFixed(1)}ms | ${correlatedDates.length} days with sleep+HRV`,
        );
        // Only show last 5 days for compactness
        const recentCorrelated = correlatedDates.slice(-5);
        if (recentCorrelated.length > 0) {
          const recentPairs = recentCorrelated.map((date) => {
            const sleep = sleepByDate.get(date)!;
            const hrvAvg =
              hrvByDate.get(date)!.reduce((a, b) => a + b, 0) /
              hrvByDate.get(date)!.length;
            return `${date}: ${hrvAvg.toFixed(0)}ms/${sleep.toFixed(1)}h`;
          });
          sections.push(`Recent: ${recentPairs.join(" | ")}`);
        }
        sections.push("");
      } else {
        const avgHRV =
          data.hrv.reduce((sum, sample) => sum + sample.value, 0) /
          data.hrv.length;
        sections.push(
          `HRV: Avg ${avgHRV.toFixed(1)}ms (${data.hrv.length} samples)`,
        );
        sections.push("");
      }
    }

    if (data.restingHeartRate.length > 0) {
      // Try daily correlation with sleep (compact format)
      const rhrByDate = new Map<string, number[]>();
      data.restingHeartRate.forEach((s) => {
        const dateKey = s.timestamp.toISOString().split("T")[0];
        if (!rhrByDate.has(dateKey)) rhrByDate.set(dateKey, []);
        rhrByDate.get(dateKey)!.push(s.value);
      });

      const sleepByDate = new Map<string, number>();
      data.sleepAnalysis.forEach((s) => {
        const dateKey = s.timestamp.toISOString().split("T")[0];
        sleepByDate.set(dateKey, s.value / 3600);
      });

      const correlatedDates = Array.from(sleepByDate.keys()).filter((date) =>
        rhrByDate.has(date),
      );

      if (correlatedDates.length > 0) {
        const avgRHR =
          data.restingHeartRate.reduce((sum, s) => sum + s.value, 0) /
          data.restingHeartRate.length;
        sections.push(
          `RHR: Avg ${avgRHR.toFixed(1)}bpm | ${correlatedDates.length} days with sleep+RHR`,
        );
        // Only show last 5 days for compactness
        const recentCorrelated = correlatedDates.slice(-5);
        if (recentCorrelated.length > 0) {
          const recentPairs = recentCorrelated.map((date) => {
            const sleep = sleepByDate.get(date)!;
            const rhrAvg =
              rhrByDate.get(date)!.reduce((a, b) => a + b, 0) /
              rhrByDate.get(date)!.length;
            return `${date}: ${rhrAvg.toFixed(0)}bpm/${sleep.toFixed(1)}h`;
          });
          sections.push(`Recent: ${recentPairs.join(" | ")}`);
        }
        sections.push("");
      } else {
        const avgRHR =
          data.restingHeartRate.reduce((sum, sample) => sum + sample.value, 0) /
          data.restingHeartRate.length;
        sections.push(
          `RHR: Avg ${avgRHR.toFixed(1)}bpm (${data.restingHeartRate.length} samples)`,
        );
        sections.push("");
      }
    }

    // Daylight removed - not available in meaningful way in data

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
