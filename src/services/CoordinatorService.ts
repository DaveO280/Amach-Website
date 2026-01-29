import type { CoordinatorResult } from "@/agents/CoordinatorAgent";
import { CoordinatorAgent } from "@/agents/CoordinatorAgent";
import type {
  AgentExecutionContext,
  AgentProfile,
  AppleHealthMetricMap,
  MetricSample,
} from "@/agents/types";
import type { VeniceApiService } from "@/api/venice/VeniceApiService";
import type { HealthDataByType } from "@/types/healthData";
import type { ParsedReportSummary } from "@/types/reportData";
import { healthDataProcessor } from "@/data/processors/HealthDataProcessor";
import { processSleepData } from "@/utils/sleepDataProcessor";
import {
  applyTieredAggregation,
  aggregateSamplesByDay,
  aggregateDailyValues,
} from "@/utils/tieredDataAggregation";
import { isCumulativeMetric } from "@/utils/dataDeduplicator";

export type AnalysisMode = "initial" | "ongoing";

interface RunCoordinatorOptions {
  metricData?: HealthDataByType;
  reports?: ParsedReportSummary[] | null;
  profile?: {
    age?: number;
    birthDate?: string;
    sex?: string;
    height?: number;
    heightCm?: number;
    heightIn?: number;
    weight?: number;
    weightKg?: number;
    weightLbs?: number;
    bmi?: number;
  } | null;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  veniceService: VeniceApiService;
  analysisMode?: AnalysisMode; // 'initial' for full historical analysis, 'ongoing' for incremental updates
}

interface TransformResult {
  appleHealth: AppleHealthMetricMap;
  timeWindow: AgentExecutionContext["timeWindow"];
}

const SUPPORTED_METRICS = new Set<string>([
  "HKQuantityTypeIdentifierStepCount",
  "HKQuantityTypeIdentifierHeartRate",
  "HKQuantityTypeIdentifierRestingHeartRate",
  "HKQuantityTypeIdentifierActiveEnergyBurned",
  "HKQuantityTypeIdentifierAppleExerciseTime",
  "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
  "HKQuantityTypeIdentifierRespiratoryRate",
  "HKQuantityTypeIdentifierVO2Max",
  "HKCategoryTypeIdentifierSleepAnalysis",
]);

export async function runCoordinatorAnalysis({
  metricData,
  reports,
  profile,
  conversationHistory,
  veniceService,
  analysisMode = "ongoing",
}: RunCoordinatorOptions): Promise<CoordinatorResult | null> {
  if (!metricData && (!reports || reports.length === 0)) {
    return null;
  }

  // Check if HealthDataProcessor has processed data
  // If not, process it now (backward compatibility)
  if (!healthDataProcessor.hasData() && metricData) {
    console.log(
      "[CoordinatorService] Processing data through HealthDataProcessor...",
    );
    await healthDataProcessor.processRawData(metricData, false); // Don't persist during analysis
  }

  // Get pre-aggregated data from processor
  const useProcessedData = healthDataProcessor.hasData();
  let appleHealth: AppleHealthMetricMap = {};
  let timeWindow: AgentExecutionContext["timeWindow"];

  if (useProcessedData) {
    console.log(
      "[CoordinatorService] Using pre-aggregated data from HealthDataProcessor",
    );

    // Get data optimized for AI agents
    const agentData = healthDataProcessor.getDataForAIAgents({
      tieredAggregation: analysisMode === "initial",
    });

    // Convert to AppleHealthMetricMap
    appleHealth = agentData as AppleHealthMetricMap;

    // Get time window from processor
    const dateRange = healthDataProcessor.getDateRange();
    if (dateRange) {
      timeWindow = { start: dateRange.start, end: dateRange.end };
    } else {
      const now = Date.now();
      timeWindow = {
        start: new Date(now - 90 * 24 * 60 * 60 * 1000),
        end: new Date(now),
      };
    }

    console.log(
      `[CoordinatorService] Using ${analysisMode} mode with ${Object.keys(appleHealth).length} metrics`,
    );
  } else {
    // Fallback to old method if processor not used
    console.log(
      "[CoordinatorService] Fallback: Using legacy transformMetricData",
    );
    const transformed = transformMetricData(metricData ?? {}, analysisMode);
    appleHealth = transformed.appleHealth;
    timeWindow = transformed.timeWindow;
  }

  if (Object.keys(appleHealth).length === 0 && (!reports || !reports.length)) {
    return null;
  }

  const agentProfile = buildAgentProfile(profile ?? undefined);

  const coordinator = new CoordinatorAgent(veniceService);
  const result = await coordinator.analyze(
    {
      availableData: {
        appleHealth,
        reports: reports ?? [],
      },
      timeWindow,
      conversationHistory,
      analysisMode,
    },
    { profile: agentProfile },
  );

  return result;
}

function transformMetricData(
  metricData: HealthDataByType,
  analysisMode: AnalysisMode = "ongoing",
): TransformResult {
  const appleHealth: AppleHealthMetricMap = {};
  let earliest: number | null = null;
  let latest: number | null = null;

  // For ongoing analysis, limit to recent data (simple window)
  // For initial analysis, use tiered aggregation (30d daily, 150d weekly, rest monthly)
  const MAX_DAYS_ONGOING = 60; // ~2 months for ongoing

  console.log(`[CoordinatorService] Transform mode: ${analysisMode}`);

  for (const [metricId, points] of Object.entries(metricData)) {
    if (!SUPPORTED_METRICS.has(metricId)) {
      continue;
    }

    // Special handling for sleep data: convert raw stages to aggregated durations
    if (metricId === "HKCategoryTypeIdentifierSleepAnalysis") {
      console.log(
        `[CoordinatorService] Processing ${points.length} raw sleep stage records (mode: ${analysisMode})`,
      );

      // Process raw sleep stages into daily aggregated data
      const processedSleepData = processSleepData(points);
      console.log(
        `[CoordinatorService] Processed into ${processedSleepData.length} daily sleep summaries`,
      );

      // Convert processed daily data into MetricSample format
      // Deduplicate by date to handle any duplicate daily summaries
      const sleepSamplesByDate = new Map<string, MetricSample>();

      for (const dayData of processedSleepData) {
        const timestamp = new Date(dayData.date);
        if (Number.isNaN(timestamp.getTime())) {
          continue;
        }

        // Use date string as key for deduplication
        const dateKey = dayData.date;

        // Sleep duration in seconds (agents expect numeric values)
        const durationSeconds = dayData.sleepDuration * 60; // Convert minutes to seconds

        // If we already have data for this date, merge sessions (sum durations)
        const existing = sleepSamplesByDate.get(dateKey);
        if (existing) {
          console.warn(
            `[CoordinatorService] Duplicate sleep data detected for date ${dateKey}. Merging sessions.`,
            {
              existingDuration: existing.value / 60,
              newDuration: dayData.sleepDuration,
            },
          );
          // Merge: sum durations, recalculate efficiency, combine stages
          const existingDuration = existing.value / 60; // Convert back to minutes
          const mergedDuration = existingDuration + dayData.sleepDuration;
          const existingTotalDuration =
            (existing.metadata?.totalDuration as number) || 0;
          const mergedTotalDuration =
            existingTotalDuration + dayData.totalDuration;

          // Validate merged duration is reasonable (max 24 hours)
          if (mergedDuration > 24 * 60) {
            console.error(
              `[CoordinatorService] Merged sleep duration exceeds 24h for ${dateKey}: ${mergedDuration} minutes. Using existing value.`,
            );
            continue; // Skip this duplicate, keep existing
          }

          const existingStages =
            (existing.metadata?.stages as {
              core?: number;
              deep?: number;
              rem?: number;
              awake?: number;
            }) || {};

          sleepSamplesByDate.set(dateKey, {
            timestamp,
            value: mergedDuration * 60, // Back to seconds
            unit: "s",
            metadata: {
              efficiency: Math.round(
                (mergedDuration / mergedTotalDuration) * 100,
              ),
              totalDuration: mergedTotalDuration,
              stages: {
                core:
                  (existingStages.core || 0) + (dayData.stageData.core || 0),
                deep:
                  (existingStages.deep || 0) + (dayData.stageData.deep || 0),
                rem: (existingStages.rem || 0) + (dayData.stageData.rem || 0),
                awake:
                  (existingStages.awake || 0) + (dayData.stageData.awake || 0),
              },
              date: dayData.date,
            },
          });
        } else {
          // First entry for this date
          sleepSamplesByDate.set(dateKey, {
            timestamp,
            value: durationSeconds,
            unit: "s",
            metadata: {
              efficiency: dayData.metrics.sleepEfficiency,
              totalDuration: dayData.totalDuration,
              stages: dayData.stageData,
              date: dayData.date,
            },
          });
        }
      }

      const allSleepSamples = Array.from(sleepSamplesByDate.values());

      if (allSleepSamples.length !== processedSleepData.length) {
        console.log(
          `[CoordinatorService] Deduplicated sleep data: ${processedSleepData.length} daily summaries → ${allSleepSamples.length} unique dates`,
        );
      }

      // Apply tiered aggregation for initial mode, simple window for ongoing
      let finalSleepSamples: MetricSample[];
      if (analysisMode === "initial") {
        // Use tiered aggregation for full dataset
        finalSleepSamples = applyTieredAggregation(allSleepSamples, metricId);
        console.log(
          `[CoordinatorService] Applied tiered aggregation: ${allSleepSamples.length} days → ${finalSleepSamples.length} aggregated periods`,
        );
      } else {
        // Use simple recent window for ongoing
        finalSleepSamples = allSleepSamples.slice(-MAX_DAYS_ONGOING);
        console.log(
          `[CoordinatorService] Using ${finalSleepSamples.length} recent days (from ${allSleepSamples.length} total)`,
        );
      }

      // Track time window
      for (const sample of finalSleepSamples) {
        const timeValue = sample.timestamp.getTime();
        if (earliest === null || timeValue < earliest) {
          earliest = timeValue;
        }
        if (latest === null || timeValue > latest) {
          latest = timeValue;
        }
      }

      if (finalSleepSamples.length > 0) {
        appleHealth[metricId] = finalSleepSamples;
        console.log(
          `[CoordinatorService] Added ${finalSleepSamples.length} sleep samples for agents (mode: ${analysisMode})`,
        );
      }
      continue;
    }

    // Handle other metrics (steps, heart rate, HRV, etc.)
    const samples: MetricSample[] = [];

    for (const point of points) {
      if (!point || typeof point.startDate !== "string") {
        continue;
      }

      const timestamp = new Date(point.startDate);
      if (Number.isNaN(timestamp.getTime())) {
        continue;
      }

      const value = parseFloat(point.value);
      if (!Number.isFinite(value)) {
        continue;
      }

      samples.push({
        timestamp,
        value,
        unit: point.unit,
        metadata: {
          source: point.source,
          device: point.device,
          unit: point.unit,
          type: point.type,
        },
      });
    }

    if (samples.length === 0) {
      continue;
    }

    // Special handling: Heart rate needs raw samples for zone calculations
    // Don't aggregate heart rate, keep all individual readings
    if (metricId === "HKQuantityTypeIdentifierHeartRate") {
      const sortedSamples = [...samples].sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
      );
      appleHealth[metricId] = sortedSamples;

      console.log(
        `[CoordinatorService] ${metricId}: ${sortedSamples.length} raw samples (for zone calculations)`,
      );

      // Track time window
      for (const sample of sortedSamples) {
        const timeValue = sample.timestamp.getTime();
        if (earliest === null || timeValue < earliest) {
          earliest = timeValue;
        }
        if (latest === null || timeValue > latest) {
          latest = timeValue;
        }
      }
      continue;
    }

    // Apply tiered aggregation for initial mode, simple window for ongoing
    let finalSamples: MetricSample[];
    if (analysisMode === "initial") {
      // Use tiered aggregation for full dataset
      finalSamples = applyTieredAggregation(samples, metricId);
      console.log(
        `[CoordinatorService] ${metricId}: ${samples.length} samples → ${finalSamples.length} aggregated periods (tiered)`,
      );
    } else {
      // For ongoing mode: ALWAYS aggregate cumulative metrics by day first
      const isCumulative = isCumulativeMetric(metricId);

      if (isCumulative) {
        // Aggregate by day, then take recent 60 days
        const dailyGroups = aggregateSamplesByDay(samples);
        const dailyAggregates = aggregateDailyValues(dailyGroups, true);

        // Convert to array and sort by date
        const sortedDates = Array.from(dailyAggregates.keys()).sort();
        const recentDates = sortedDates.slice(-MAX_DAYS_ONGOING);

        finalSamples = recentDates.map(
          (dateKey) => dailyAggregates.get(dateKey)!,
        );

        console.log(
          `[CoordinatorService] ${metricId}: ${samples.length} samples → ${dailyAggregates.size} days → ${finalSamples.length} recent days`,
        );
      } else {
        // For non-cumulative metrics, just use recent samples
        const sortedSamples = [...samples].sort(
          (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
        );
        finalSamples = sortedSamples.slice(-MAX_DAYS_ONGOING * 50); // ~50 samples per day estimate

        console.log(
          `[CoordinatorService] ${metricId}: Using ${finalSamples.length} recent samples (from ${samples.length} total)`,
        );
      }
    }

    // Track time window
    for (const sample of finalSamples) {
      const timeValue = sample.timestamp.getTime();
      if (earliest === null || timeValue < earliest) {
        earliest = timeValue;
      }
      if (latest === null || timeValue > latest) {
        latest = timeValue;
      }
    }

    if (finalSamples.length > 0) {
      appleHealth[metricId] = finalSamples;
    }
  }

  const now = Date.now();
  const start =
    earliest !== null
      ? new Date(earliest)
      : new Date(now - 90 * 24 * 60 * 60 * 1000);
  const end = latest !== null ? new Date(latest) : new Date(now);

  console.log(
    `[CoordinatorService] Final time window: ${start.toISOString().split("T")[0]} to ${end.toISOString().split("T")[0]} (${Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))} days)`,
  );

  return {
    appleHealth,
    timeWindow: { start, end },
  };
}

function buildAgentProfile(rawProfile?: {
  age?: number;
  birthDate?: string;
  sex?: string;
  height?: number;
  heightCm?: number;
  heightIn?: number;
  weight?: number;
  weightKg?: number;
  weightLbs?: number;
  bmi?: number;
}): AgentProfile | undefined {
  if (!rawProfile) {
    return undefined;
  }

  const profile: AgentProfile = {};

  if (typeof rawProfile.birthDate === "string") {
    profile.birthDate = rawProfile.birthDate;
  }

  if (typeof rawProfile.age === "number" && rawProfile.age > 0) {
    profile.ageYears = rawProfile.age;
  }

  if (typeof rawProfile.sex === "string" && rawProfile.sex.trim()) {
    profile.sex = rawProfile.sex.trim();
  }

  const { heightCm, heightIn } = normalizeHeight(rawProfile);
  if (heightCm !== undefined) {
    profile.heightCm = heightCm;
  }
  if (heightIn !== undefined) {
    profile.heightIn = heightIn;
  }

  const { weightKg, weightLbs } = normalizeWeight(rawProfile);
  if (weightKg !== undefined) {
    profile.weightKg = weightKg;
  }
  if (weightLbs !== undefined) {
    profile.weightLbs = weightLbs;
  }

  if (typeof rawProfile.bmi === "number" && rawProfile.bmi > 0) {
    profile.bmi = rawProfile.bmi;
  }

  if (profile.heightCm && profile.weightKg) {
    const heightMeters = profile.heightCm / 100;
    if (heightMeters > 0) {
      profile.bmi = profile.weightKg / (heightMeters * heightMeters);
    }
  }

  return Object.keys(profile).length > 0 ? profile : undefined;
}

function normalizeHeight(heightSource: {
  height?: number;
  heightCm?: number;
  heightIn?: number;
}): {
  heightCm?: number;
  heightIn?: number;
} {
  const { height, heightCm, heightIn } = heightSource;

  if (typeof heightCm === "number" && heightCm > 0) {
    return {
      heightCm,
      heightIn: heightCm / 2.54,
    };
  }

  if (typeof heightIn === "number" && heightIn > 0) {
    return {
      heightIn,
      heightCm: heightIn * 2.54,
    };
  }

  if (typeof height === "number" && height > 0) {
    if (height > 100) {
      return {
        heightCm: height,
        heightIn: height / 2.54,
      };
    }

    if (height > 10) {
      return {
        heightIn: height,
        heightCm: height * 2.54,
      };
    }

    return {
      heightCm: height * 100,
      heightIn: height * 39.3701,
    };
  }

  return {};
}

function normalizeWeight(weightSource: {
  weight?: number;
  weightKg?: number;
  weightLbs?: number;
}): {
  weightKg?: number;
  weightLbs?: number;
} {
  const { weight, weightKg, weightLbs } = weightSource;

  if (typeof weightKg === "number" && weightKg > 0) {
    return {
      weightKg,
      weightLbs: weightKg * 2.20462,
    };
  }

  if (typeof weightLbs === "number" && weightLbs > 0) {
    return {
      weightLbs,
      weightKg: weightLbs / 2.20462,
    };
  }

  if (typeof weight === "number" && weight > 0) {
    if (weight > 140) {
      return {
        weightLbs: weight,
        weightKg: weight / 2.20462,
      };
    }

    return {
      weightKg: weight,
      weightLbs: weight * 2.20462,
    };
  }

  return {};
}
