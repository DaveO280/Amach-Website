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
import { processSleepData } from "@/utils/sleepDataProcessor";

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
}: RunCoordinatorOptions): Promise<CoordinatorResult | null> {
  if (!metricData && (!reports || reports.length === 0)) {
    return null;
  }

  const { appleHealth, timeWindow } = transformMetricData(metricData ?? {});

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
    },
    { profile: agentProfile },
  );

  return result;
}

function transformMetricData(metricData: HealthDataByType): TransformResult {
  const appleHealth: AppleHealthMetricMap = {};
  let earliest: number | null = null;
  let latest: number | null = null;

  for (const [metricId, points] of Object.entries(metricData)) {
    if (!SUPPORTED_METRICS.has(metricId)) {
      continue;
    }

    // Special handling for sleep data: convert raw stages to aggregated durations
    if (metricId === "HKCategoryTypeIdentifierSleepAnalysis") {
      console.log(
        `[CoordinatorService] Processing ${points.length} raw sleep stage records`,
      );

      // Process raw sleep stages into daily aggregated data
      const processedSleepData = processSleepData(points);
      console.log(
        `[CoordinatorService] Processed into ${processedSleepData.length} daily sleep summaries`,
      );

      // Limit to most recent 60 days to prevent overwhelming Venice AI with too much context
      const recentSleepData = processedSleepData.slice(-60);
      console.log(
        `[CoordinatorService] Limiting to ${recentSleepData.length} most recent days (from ${processedSleepData.length} total)`,
      );

      // Convert processed daily data into MetricSample format for agents
      const sleepSamples: MetricSample[] = [];
      for (const dayData of recentSleepData) {
        const timestamp = new Date(dayData.date);
        if (Number.isNaN(timestamp.getTime())) {
          continue;
        }

        // Sleep duration in seconds (agents expect numeric values)
        const durationSeconds = dayData.sleepDuration * 60; // Convert minutes to seconds

        sleepSamples.push({
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

        const timeValue = timestamp.getTime();
        if (earliest === null || timeValue < earliest) {
          earliest = timeValue;
        }
        if (latest === null || timeValue > latest) {
          latest = timeValue;
        }
      }

      if (sleepSamples.length > 0) {
        appleHealth[metricId] = sleepSamples;
        console.log(
          `[CoordinatorService] Added ${sleepSamples.length} aggregated sleep duration samples for agents`,
        );
      }
      continue;
    }

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

      const timeValue = timestamp.getTime();
      if (earliest === null || timeValue < earliest) {
        earliest = timeValue;
      }
      if (latest === null || timeValue > latest) {
        latest = timeValue;
      }
    }

    if (samples.length > 0) {
      appleHealth[metricId] = samples;
    }
  }

  const now = Date.now();
  const start =
    earliest !== null
      ? new Date(earliest)
      : new Date(now - 90 * 24 * 60 * 60 * 1000);
  const end = latest !== null ? new Date(latest) : new Date(now);

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
