import type { HealthDataResults } from "@/data/types/healthMetrics";
import type { HealthScore } from "@/types/HealthContext";
import { healthDataStore } from "../data/store/healthDataStore";
import { extractDatePart } from "./dataDeduplicator";
import { processSleepData } from "./sleepDataProcessor";
import type { MetricSample } from "@/agents/types";
import type { DailyProcessedSleepData } from "./sleepDataProcessor";
import {
  calculateAgeFromBirthDate,
  type NormalizedUserProfile,
} from "./userProfileUtils";

export interface DailyHealthScores {
  date: string;
  scores: HealthScore[];
}

export interface DailyMetrics {
  steps: number;
  exercise: number;
  heartRate: { avg: number; max: number; min: number };
  heartRateValues?: number[];
  hrv: { avg: number; max: number; min: number };
  hrvValues?: number[];
  restingHR: number;
  respiratory: number;
  activeEnergy: number;
  sleep: { duration: number; efficiency: number };
}

export interface ProcessedDailyInputs {
  dailyAggregates: Record<string, Map<string, MetricSample>>;
  sleepData: DailyProcessedSleepData[];
}

/**
 * Calculate health scores for each day in the dataset
 * Uses the same logic as Health Score Cards but applied to daily data
 */
export function calculateDailyHealthScores(
  healthData: HealthDataResults,
  userProfile: NormalizedUserProfile = {},
): DailyHealthScores[] {
  if (!healthData || Object.keys(healthData).length === 0) {
    return [];
  }

  const age =
    userProfile.age ??
    calculateAgeFromBirthDate(userProfile.birthDate ?? undefined) ??
    40;
  const sex: "male" | "female" =
    userProfile.sex === "female" ? "female" : "male";
  const heightCm =
    userProfile.heightCm ??
    (typeof userProfile.heightIn === "number"
      ? userProfile.heightIn * 2.54
      : undefined) ??
    170;
  const weightKg =
    userProfile.weightKg ??
    (typeof userProfile.weightLbs === "number"
      ? userProfile.weightLbs / 2.20462
      : undefined) ??
    70;

  // Process sleep data using the same function as regular health score calculation
  const sleepData = healthData["HKCategoryTypeIdentifierSleepAnalysis"] || [];
  const processedSleepData = processSleepData(sleepData);

  // Build a map from YYYY-MM-DD to processed sleep metrics
  const sleepDataByDate = new Map<
    string,
    { duration: number; efficiency: number }
  >();
  processedSleepData.forEach((dayData) => {
    const dayKey = extractDatePart(dayData.date); // normalize to YYYY-MM-DD
    sleepDataByDate.set(dayKey, {
      duration: dayData.sleepDuration / 60, // minutes to hours
      efficiency: dayData.metrics.sleepEfficiency,
    });
  });

  // Group metrics by date (excluding sleep, which is handled above)
  const dailyData: Record<string, DailyMetrics> = {};

  Object.entries(healthData).forEach(([metricType, metrics]) => {
    if (metricType === "HKCategoryTypeIdentifierSleepAnalysis") return; // skip sleep here
    metrics.forEach((metric) => {
      const date = extractDatePart(metric.startDate);
      if (!dailyData[date]) {
        dailyData[date] = {
          steps: 0,
          exercise: 0,
          heartRate: { avg: 0, max: 0, min: 0 },
          hrv: { avg: 0, max: 0, min: 0 },
          restingHR: 0,
          respiratory: 0,
          activeEnergy: 0,
          sleep: { duration: 0, efficiency: 0 },
        };
      }
      const value = parseFloat(metric.value);
      if (isNaN(value)) {
        return;
      }
      switch (metricType) {
        case "HKQuantityTypeIdentifierStepCount":
          dailyData[date].steps += value;
          break;
        case "HKQuantityTypeIdentifierAppleExerciseTime":
          dailyData[date].exercise += value;
          break;
        case "HKQuantityTypeIdentifierHeartRate":
          if (dailyData[date].heartRate.avg === 0) {
            dailyData[date].heartRate = { avg: value, max: value, min: value };
            dailyData[date].heartRateValues = [value];
          } else {
            dailyData[date].heartRateValues!.push(value);
            dailyData[date].heartRate.avg =
              dailyData[date].heartRateValues!.reduce(
                (sum: number, val: number) => sum + val,
                0,
              ) / dailyData[date].heartRateValues!.length;
            dailyData[date].heartRate.max = Math.max(
              dailyData[date].heartRate.max,
              value,
            );
            dailyData[date].heartRate.min = Math.min(
              dailyData[date].heartRate.min,
              value,
            );
          }
          break;
        case "HKQuantityTypeIdentifierHeartRateVariabilitySDNN":
          if (dailyData[date].hrv.avg === 0) {
            dailyData[date].hrv = { avg: value, max: value, min: value };
            dailyData[date].hrvValues = [value];
          } else {
            dailyData[date].hrvValues!.push(value);
            dailyData[date].hrv.avg =
              dailyData[date].hrvValues!.reduce(
                (sum: number, val: number) => sum + val,
                0,
              ) / dailyData[date].hrvValues!.length;
            dailyData[date].hrv.max = Math.max(dailyData[date].hrv.max, value);
            dailyData[date].hrv.min = Math.min(dailyData[date].hrv.min, value);
          }
          break;
        case "HKQuantityTypeIdentifierRestingHeartRate":
          dailyData[date].restingHR = value;
          break;
        case "HKQuantityTypeIdentifierRespiratoryRate":
          dailyData[date].respiratory = value;
          break;
        case "HKQuantityTypeIdentifierActiveEnergyBurned":
          dailyData[date].activeEnergy += value;
          break;
      }
    });
  });

  // Assign processed sleep data to dailyData
  // Ensure we include sleep-only days as well (days where only sleep exists but no other metric was recorded).
  for (const [date, sleep] of sleepDataByDate.entries()) {
    if (!dailyData[date]) {
      dailyData[date] = {
        steps: 0,
        exercise: 0,
        heartRate: { avg: 0, max: 0, min: 0 },
        hrv: { avg: 0, max: 0, min: 0 },
        restingHR: 0,
        respiratory: 0,
        activeEnergy: 0,
        sleep: { duration: 0, efficiency: 0 },
      };
    }
    dailyData[date].sleep = sleep;
  }

  // Calculate health scores for each day
  const dailyScores: DailyHealthScores[] = Object.entries(dailyData).map(
    ([date, metrics]) => {
      // Use the same calculation logic as Health Score Cards
      const scores = calculateScoresForDay(metrics, {
        age,
        sex,
        height: heightCm,
        weight: weightKg,
      });

      return {
        date,
        scores,
      };
    },
  );

  return dailyScores;
}

/**
 * Calculate daily health scores from processed daily aggregates + processed sleep.
 * This avoids "missing category" days caused by raw trimming or sparse raw samples.
 */
export function calculateDailyHealthScoresFromProcessed(
  processed: ProcessedDailyInputs,
  userProfile: NormalizedUserProfile = {},
): DailyHealthScores[] {
  const age =
    userProfile.age ??
    calculateAgeFromBirthDate(userProfile.birthDate ?? undefined) ??
    40;
  const sex: "male" | "female" =
    userProfile.sex === "female" ? "female" : "male";
  const heightCm =
    userProfile.heightCm ??
    (typeof userProfile.heightIn === "number"
      ? userProfile.heightIn * 2.54
      : undefined) ??
    170;
  const weightKg =
    userProfile.weightKg ??
    (typeof userProfile.weightLbs === "number"
      ? userProfile.weightLbs / 2.20462
      : undefined) ??
    70;

  // Build a map from YYYY-MM-DD to processed sleep metrics
  const sleepDataByDate = new Map<
    string,
    { duration: number; efficiency: number }
  >();
  processed.sleepData.forEach((dayData) => {
    const dayKey = extractDatePart(dayData.date);
    sleepDataByDate.set(dayKey, {
      duration: dayData.sleepDuration / 60, // minutes -> hours
      efficiency: dayData.metrics.sleepEfficiency,
    });
  });

  // Union of all date keys across daily aggregates + sleep
  const dateKeys = new Set<string>();
  Object.values(processed.dailyAggregates).forEach((m) => {
    for (const dateKey of m.keys()) dateKeys.add(dateKey);
  });
  for (const dateKey of sleepDataByDate.keys()) dateKeys.add(dateKey);

  const dailyScores: DailyHealthScores[] = [];

  const getDailyValue = (
    appleMetricId: string,
    dateKey: string,
  ): number | null => {
    const map = processed.dailyAggregates[appleMetricId];
    if (!map) return null;
    const sample = map.get(dateKey);
    if (!sample) return null;
    if (Number.isNaN(sample.value)) return null;
    return sample.value;
  };

  for (const dateKey of Array.from(dateKeys).sort()) {
    const metrics: DailyMetrics = {
      steps: getDailyValue("HKQuantityTypeIdentifierStepCount", dateKey) ?? 0,
      exercise:
        getDailyValue("HKQuantityTypeIdentifierAppleExerciseTime", dateKey) ??
        0,
      heartRate: {
        avg: getDailyValue("HKQuantityTypeIdentifierHeartRate", dateKey) ?? 0,
        max: 0,
        min: 0,
      },
      hrv: {
        avg:
          getDailyValue(
            "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
            dateKey,
          ) ?? 0,
        max: 0,
        min: 0,
      },
      restingHR:
        getDailyValue("HKQuantityTypeIdentifierRestingHeartRate", dateKey) ?? 0,
      respiratory:
        getDailyValue("HKQuantityTypeIdentifierRespiratoryRate", dateKey) ?? 0,
      activeEnergy:
        getDailyValue("HKQuantityTypeIdentifierActiveEnergyBurned", dateKey) ??
        0,
      sleep: sleepDataByDate.get(dateKey) ?? { duration: 0, efficiency: 0 },
    };

    // Pull min/max from metadata when present (helps heart/HRV)
    const hrSample =
      processed.dailyAggregates["HKQuantityTypeIdentifierHeartRate"]?.get(
        dateKey,
      );
    if (hrSample?.metadata && typeof hrSample.metadata === "object") {
      const meta = hrSample.metadata as Record<string, unknown>;
      if (typeof meta.min === "number") metrics.heartRate.min = meta.min;
      if (typeof meta.max === "number") metrics.heartRate.max = meta.max;
    }
    const hrvSample =
      processed.dailyAggregates[
        "HKQuantityTypeIdentifierHeartRateVariabilitySDNN"
      ]?.get(dateKey);
    if (hrvSample?.metadata && typeof hrvSample.metadata === "object") {
      const meta = hrvSample.metadata as Record<string, unknown>;
      if (typeof meta.min === "number") metrics.hrv.min = meta.min;
      if (typeof meta.max === "number") metrics.hrv.max = meta.max;
    }

    const scores = calculateScoresForDay(metrics, {
      age,
      sex,
      height: heightCm,
      weight: weightKg,
    });
    dailyScores.push({ date: dateKey, scores });
  }

  return dailyScores;
}

/**
 * Calculate health scores for a specific day
 * Uses EXACTLY the same logic as HealthDataContextWrapper
 */
function calculateScoresForDay(
  metrics: DailyMetrics,
  profile: {
    age: number;
    sex: "male" | "female";
    height: number;
    weight: number;
  },
): HealthScore[] {
  const { age, sex, height, weight } = profile;

  // Sleep Quality Score (SQS) - FIXED to match regular calculation
  const sleepDurationScore = 0.7 * (metrics.sleep.duration / 8); // duration is already in hours, divide by 8 for target ratio
  const sleepEfficiencyScore = 0.3 * (metrics.sleep.efficiency / 100); // Convert percentage to decimal
  const sleepQualityScore =
    Math.min(1, sleepDurationScore + sleepEfficiencyScore) * 100;

  // Heart Health Score (HHS) - EXACTLY matches regular calculation
  const normalizeHRV = (
    hrv: number,
    age: number,
    sex: "male" | "female",
  ): number => {
    const ageRanges = {
      "20-30": { min: 55, max: 105 },
      "31-40": { min: 45, max: 95 },
      "41-50": { min: 35, max: 85 },
      "51-60": { min: 25, max: 75 },
      "61+": { min: 15, max: 65 },
    };
    const ageGroup =
      age <= 30
        ? "20-30"
        : age <= 40
          ? "31-40"
          : age <= 50
            ? "41-50"
            : age <= 60
              ? "51-60"
              : "61+";
    const { min, max } = ageRanges[ageGroup];
    const sexAdjustment = sex === "female" ? 7.5 : 0;
    return Math.min(
      100,
      Math.max(
        0,
        ((hrv - (min + sexAdjustment)) /
          (max + sexAdjustment - (min + sexAdjustment))) *
          100,
      ),
    );
  };

  const normalizeRestingHR = (
    rhr: number,
    age: number,
    sex: "male" | "female",
  ): number => {
    const ageRanges = {
      "20-30": { min: 55, max: 85 },
      "31-40": { min: 57, max: 87 },
      "41-50": { min: 60, max: 90 },
      "51-60": { min: 62, max: 92 },
      "61+": { min: 65, max: 95 },
    };
    const ageGroup =
      age <= 30
        ? "20-30"
        : age <= 40
          ? "31-40"
          : age <= 50
            ? "41-50"
            : age <= 60
              ? "51-60"
              : "61+";
    const { min, max } = ageRanges[ageGroup];
    const sexAdjustment = sex === "female" ? 4 : 0;
    return Math.min(
      100,
      Math.max(
        0,
        ((max + sexAdjustment - rhr) /
          (max + sexAdjustment - (min + sexAdjustment))) *
          100,
      ),
    );
  };

  const normalizeHRVariability = (
    avgHR: number,
    rhr: number,
    age: number,
  ): number => {
    const hrRange = avgHR - rhr;
    const ageFactor = Math.max(0.7, 1 - (age - 30) * 0.005);

    // New approach: Reward heart rate responsiveness
    // Base score on the ratio of actual range to expected range
    // Higher ratios (more responsive heart) get higher scores
    const expectedRange = rhr * 0.5 * ageFactor;
    const responsivenessRatio = hrRange / expectedRange;

    // Score based on responsiveness:
    // - Ratio < 0.5: Low responsiveness (penalize)
    // - Ratio 0.5-1.5: Good responsiveness (reward)
    // - Ratio > 1.5: Excellent responsiveness (reward, but cap)
    let score;
    if (responsivenessRatio < 0.5) {
      // Low responsiveness - linear penalty
      score = Math.max(0, responsivenessRatio * 100);
    } else if (responsivenessRatio <= 1.5) {
      // Good responsiveness - reward
      score = 50 + (responsivenessRatio - 0.5) * 50; // 50-100 range
    } else {
      // Excellent responsiveness - cap at 100
      score = Math.min(100, 100 + (responsivenessRatio - 1.5) * 20);
    }

    return score;
  };

  const normHRV = normalizeHRV(metrics.hrv.avg, age, sex);
  const normRestingHR = normalizeRestingHR(metrics.restingHR, age, sex);
  const normHRVar = normalizeHRVariability(
    metrics.heartRate.avg,
    metrics.restingHR,
    age,
  );

  const heartHealthScore = Math.min(
    100,
    Math.max(0, normHRV * 0.4 + normRestingHR * 0.3 + normHRVar * 0.3),
  );

  // Physical Activity Score (PAS) - FIXED to match regular calculation
  const normalizeSteps = (
    steps: number,
    age: number,
    sex: "male" | "female",
  ): number => {
    const ageFactor = Math.max(0.7, 1 - (age - 30) * 0.005);
    const sexFactor = sex === "female" ? 0.9 : 1.0;
    const targetSteps = 10000 * ageFactor * sexFactor;
    return Math.min(100, Math.max(0, (steps / targetSteps) * 100));
  };

  const normalizeExercise = (minutes: number, age: number): number => {
    const ageFactor = Math.max(0.7, 1 - (age - 30) * 0.005);
    const targetMinutes = 60 * ageFactor;
    return Math.min(100, Math.max(0, (minutes / targetMinutes) * 100));
  };

  const normalizeRespiratory = (
    rate: number,
    age: number,
    sex: "male" | "female",
  ): number => {
    const ageFactor = Math.max(0.8, 1 - (age - 30) * 0.003);
    const sexFactor = sex === "female" ? 1.05 : 1.0;
    const optimalRate = 16 * ageFactor * sexFactor;
    const range = 4 * ageFactor;
    return Math.min(
      100,
      Math.max(0, ((range - Math.abs(rate - optimalRate)) / range) * 100),
    );
  };

  // FIXED: Use the exact same getActivityLevelMultiplier as regular calculation
  const getActivityLevelMultiplier = (
    activeEnergy: number,
    age: number,
    sex: "male" | "female",
  ): number => {
    const ranges = {
      male: {
        low: { min: 0, max: 300, multiplier: 0.2 },
        moderate: { min: 301, max: 500, multiplier: 0.4 },
        average: { min: 501, max: 800, multiplier: 0.6 },
        high: { min: 801, max: 1100, multiplier: 0.8 },
        elite: { min: 1101, max: Infinity, multiplier: 1.0 },
      },
      female: {
        low: { min: 0, max: 250, multiplier: 0.2 },
        moderate: { min: 251, max: 400, multiplier: 0.4 },
        average: { min: 401, max: 650, multiplier: 0.6 },
        high: { min: 651, max: 900, multiplier: 0.8 },
        elite: { min: 901, max: Infinity, multiplier: 1.0 },
      },
    };
    const ageAdjustment = age < 30 ? 1.0 : age < 50 ? 0.9 : 0.8;
    const adjustedRanges = sex === "male" ? ranges.male : ranges.female;
    for (const [, range] of Object.entries(adjustedRanges)) {
      if (
        activeEnergy >= range.min * ageAdjustment &&
        activeEnergy <= range.max * ageAdjustment
      ) {
        return range.multiplier;
      }
    }
    return 0.2;
  };

  const stepsScore = normalizeSteps(metrics.steps, age, sex);
  const exerciseScore = normalizeExercise(metrics.exercise, age);
  const respiratoryScore = normalizeRespiratory(metrics.respiratory, age, sex);
  const activityLevelMultiplier = getActivityLevelMultiplier(
    metrics.activeEnergy,
    age,
    sex,
  );

  // FIXED: Use exact same physical activity score calculation as regular
  const physicalActivityScore = Math.min(
    100,
    Math.max(
      0,
      stepsScore * 0.3 +
        exerciseScore * 0.2 +
        activityLevelMultiplier * 100 * 0.3 +
        respiratoryScore * 0.2,
    ),
  );

  // Energy Balance Score - EXACTLY matches regular calculation
  const calculateEnergyTarget = (
    weightKg: number,
    heightCm: number,
    age: number,
    sex: "male" | "female",
    activityLevel: number,
  ): number => {
    const weightLbs = weightKg * 2.20462;
    const heightFeet = heightCm / 30.48;
    const heightInches = heightFeet * 12;
    const bmr =
      sex === "male"
        ? 4.536 * weightLbs + 15.88 * heightInches - 5 * age + 5
        : 4.536 * weightLbs + 15.88 * heightInches - 5 * age - 161;
    const baseActiveTarget = bmr * 0.5;
    const scaledActivity = 0.5 + activityLevel;
    return baseActiveTarget * scaledActivity;
  };

  const energyTarget = calculateEnergyTarget(
    weight,
    height,
    age,
    sex,
    getActivityLevelMultiplier(metrics.activeEnergy, age, sex),
  );
  const energyBalanceScore = Math.min(
    100,
    Math.max(
      0,
      (1 - Math.abs(metrics.activeEnergy - energyTarget) / 1000) * 100,
    ),
  );

  // Overall Health Score (OHS)
  // Instead of forcing overall=0 when sleep is missing, re-weight across available domains.
  // This prevents "phantom zeros" while still avoiding penalizing missing data.
  const domainWeights = {
    sleep: 0.3,
    activity: 0.3,
    energy: 0.2,
    heart: 0.2,
  } as const;

  const hasSleep = metrics.sleep.duration > 0;
  const hasActivity =
    metrics.steps > 0 || metrics.exercise > 0 || metrics.activeEnergy > 0;
  const hasEnergy = metrics.activeEnergy > 0;
  const hasHeart =
    metrics.hrv.avg > 0 || metrics.restingHR > 0 || metrics.heartRate.avg > 0;

  const weightedParts: Array<{ w: number; v: number }> = [];
  if (hasSleep)
    weightedParts.push({ w: domainWeights.sleep, v: sleepQualityScore });
  if (hasActivity)
    weightedParts.push({ w: domainWeights.activity, v: physicalActivityScore });
  if (hasEnergy)
    weightedParts.push({ w: domainWeights.energy, v: energyBalanceScore });
  if (hasHeart)
    weightedParts.push({ w: domainWeights.heart, v: heartHealthScore });

  const weightSum = weightedParts.reduce((acc, p) => acc + p.w, 0);
  const overallHealthScore =
    weightSum > 0
      ? weightedParts.reduce((acc, p) => acc + p.w * p.v, 0) / weightSum
      : 0;

  return [
    {
      type: "overall",
      value: Math.round(overallHealthScore),
      date: new Date().toISOString(),
    },
    {
      type: "activity",
      value: Math.round(physicalActivityScore),
      date: new Date().toISOString(),
    },
    {
      type: "sleep",
      value: Math.round(sleepQualityScore),
      date: new Date().toISOString(),
    },
    {
      type: "heart",
      value: Math.round(heartHealthScore),
      date: new Date().toISOString(),
    },
    {
      type: "energy",
      value: Math.round(energyBalanceScore),
      date: new Date().toISOString(),
    },
  ];
}

/**
 * Get daily health scores from IndexDB
 */
export async function getDailyHealthScores(): Promise<
  DailyHealthScores[] | null
> {
  try {
    return await healthDataStore.getDailyHealthScores();
  } catch (error) {
    console.error("Failed to retrieve daily health scores:", error);
    return null;
  }
}

/**
 * Clear all stored daily health scores
 * This will force a recalculation on next data load
 */
export async function clearDailyHealthScores(): Promise<void> {
  try {
    await healthDataStore.clearDailyHealthScores();
    console.log("✅ Daily health scores cleared successfully");
  } catch (error) {
    console.error("❌ Failed to clear daily health scores:", error);
    throw error;
  }
}

/**
 * Calculate and store daily health scores for the given health data
 */
export async function calculateAndStoreDailyHealthScores(
  healthData: HealthDataResults,
  userProfile: NormalizedUserProfile = {},
): Promise<DailyHealthScores[]> {
  try {
    const dailyScores = calculateDailyHealthScores(healthData, userProfile);

    if (dailyScores.length === 0) {
      return dailyScores;
    }

    await healthDataStore.saveDailyHealthScores(dailyScores);
    return dailyScores;
  } catch (error) {
    console.error(
      "❌ [Daily Scores] Error in calculateAndStoreDailyHealthScores:",
      error,
    );
    throw error;
  }
}

export async function calculateAndStoreDailyHealthScoresFromProcessed(
  processed: ProcessedDailyInputs,
  userProfile: NormalizedUserProfile = {},
): Promise<DailyHealthScores[]> {
  const dailyScores = calculateDailyHealthScoresFromProcessed(
    processed,
    userProfile,
  );
  if (dailyScores.length === 0) return dailyScores;
  await healthDataStore.saveDailyHealthScores(dailyScores);
  return dailyScores;
}

/**
 * Calculate trend averages for different time windows
 */
export interface TrendAverages {
  last7Days: number;
  last30Days: number;
  last3Months: number;
  last6Months: number; // Added 6-month trend
}

export interface ScoreTrends {
  overall: TrendAverages;
  activity: TrendAverages;
  sleep: TrendAverages;
  heart: TrendAverages;
  energy: TrendAverages;
}

/**
 * Calculate trend averages for a specific score type
 */
function calculateTrendAverages(
  dailyScores: DailyHealthScores[],
  scoreType: string,
): TrendAverages {
  if (!dailyScores || dailyScores.length === 0) {
    return { last7Days: 0, last30Days: 0, last3Months: 0, last6Months: 0 };
  }

  // Sort scores by date (newest first)
  const sortedScores = dailyScores
    .map((dayScore) => {
      const score = dayScore.scores.find((s) => s.type === scoreType);
      return {
        date: dayScore.date,
        value: score?.value || 0,
      };
    })
    .filter((score) => score.value > 0)
    .sort((a, b) => {
      // Parse dates properly for comparison
      const dateA = new Date(a.date + "T00:00:00");
      const dateB = new Date(b.date + "T00:00:00");
      return dateB.getTime() - dateA.getTime(); // newest first
    });

  if (sortedScores.length === 0) {
    return { last7Days: 0, last30Days: 0, last3Months: 0, last6Months: 0 };
  }

  // Get the most recent scores for each time window
  const last7DaysScores = sortedScores.slice(
    0,
    Math.min(7, sortedScores.length),
  );
  const last30DaysScores = sortedScores.slice(
    0,
    Math.min(30, sortedScores.length),
  );
  const last3MonthsScores = sortedScores.slice(
    0,
    Math.min(90, sortedScores.length),
  );
  const last6MonthsScores = sortedScores.slice(
    0,
    Math.min(180, sortedScores.length),
  );

  // Clean up: Remove all previous debug logging

  // Debug utility: Print activity score stats - Commented out to reduce console noise
  // if (scoreType === "activity") {
  //   ... debug code removed for cleaner console output
  // }

  // Calculate averages based on available data
  const calculateAverage = (scores: typeof sortedScores): number => {
    if (scores.length === 0) return 0;
    const sum = scores.reduce((total, score) => total + score.value, 0);
    return Math.round(sum / scores.length);
  };

  return {
    last7Days: calculateAverage(last7DaysScores),
    last30Days: calculateAverage(last30DaysScores),
    last3Months: calculateAverage(last3MonthsScores),
    last6Months: calculateAverage(last6MonthsScores),
  };
}

/**
 * Calculate all score trends from daily scores
 */
export function calculateScoreTrends(
  dailyScores: DailyHealthScores[],
): ScoreTrends {
  if (!dailyScores || dailyScores.length === 0) {
    const emptyTrends: TrendAverages = {
      last7Days: 0,
      last30Days: 0,
      last3Months: 0,
      last6Months: 0,
    };
    return {
      overall: emptyTrends,
      activity: emptyTrends,
      sleep: emptyTrends,
      heart: emptyTrends,
      energy: emptyTrends,
    };
  }

  return {
    overall: calculateTrendAverages(dailyScores, "overall"),
    activity: calculateTrendAverages(dailyScores, "activity"),
    sleep: calculateTrendAverages(dailyScores, "sleep"),
    heart: calculateTrendAverages(dailyScores, "heart"),
    energy: calculateTrendAverages(dailyScores, "energy"),
  };
}

/**
 * Get score trends from IndexDB
 */
export async function getScoreTrends(): Promise<ScoreTrends | null> {
  try {
    const dailyScores = await getDailyHealthScores();
    if (!dailyScores) {
      return null;
    }

    // Debug: Show the first few entries to see what data we're working with
    console.log("[Trends] Raw daily scores from IndexDB:");
    dailyScores.slice(0, 10).forEach((score, index) => {
      console.log(
        `[Trends] Entry ${index}: date=${score.date}, overall=${score.scores.find((s) => s.type === "overall")?.value}, activity=${score.scores.find((s) => s.type === "activity")?.value}`,
      );
    });

    // Debug: Check for duplicate dates
    const dateCounts: Record<string, number> = {};
    dailyScores.forEach((score) => {
      dateCounts[score.date] = (dateCounts[score.date] || 0) + 1;
    });

    const duplicates = Object.entries(dateCounts).filter(
      ([, count]) => count > 1,
    );
    if (duplicates.length > 0) {
      console.log("[Trends] Found duplicate dates:", duplicates);
      // Show all entries for duplicate dates
      duplicates.forEach(([date, count]) => {
        const entries = dailyScores.filter((score) => score.date === date);
        console.log(
          `[Trends] Date ${date} has ${count} entries:`,
          entries.map((e) => ({
            overall: e.scores.find((s) => s.type === "overall")?.value,
            activity: e.scores.find((s) => s.type === "activity")?.value,
          })),
        );
      });
    } else {
      console.log("[Trends] No duplicate dates found");
    }

    return calculateScoreTrends(dailyScores);
  } catch (error) {
    console.error("Failed to retrieve score trends:", error);
    return null;
  }
}
