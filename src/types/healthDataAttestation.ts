/**
 * Health Data Attestation Types
 * Defines metrics required for complete dataset attestation with tolerances
 */

// ============================================
// APPLE HEALTH METRIC DEFINITIONS
// ============================================

/**
 * Complete list of Apple Health metrics organized by category
 * Based on HealthKit HKQuantityTypeIdentifier and HKCategoryTypeIdentifier
 */
export const APPLE_HEALTH_METRICS = {
  // HEART & CARDIOVASCULAR (8 metrics)
  heart: [
    "HKQuantityTypeIdentifierHeartRate",
    "HKQuantityTypeIdentifierRestingHeartRate",
    "HKQuantityTypeIdentifierWalkingHeartRateAverage",
    "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
    "HKQuantityTypeIdentifierHeartRateRecoveryOneMinute",
    "HKQuantityTypeIdentifierAtrialFibrillationBurden",
    "HKCategoryTypeIdentifierHighHeartRateEvent",
    "HKCategoryTypeIdentifierLowHeartRateEvent",
  ],

  // ACTIVITY & MOBILITY (12 metrics)
  activity: [
    "HKQuantityTypeIdentifierStepCount",
    "HKQuantityTypeIdentifierDistanceWalkingRunning",
    "HKQuantityTypeIdentifierDistanceCycling",
    "HKQuantityTypeIdentifierDistanceSwimming",
    "HKQuantityTypeIdentifierFlightsClimbed",
    "HKQuantityTypeIdentifierAppleExerciseTime",
    "HKQuantityTypeIdentifierAppleStandTime",
    "HKQuantityTypeIdentifierAppleMoveTime",
    "HKCategoryTypeIdentifierAppleStandHour",
    "HKQuantityTypeIdentifierWalkingSpeed",
    "HKQuantityTypeIdentifierWalkingStepLength",
    "HKQuantityTypeIdentifierWalkingAsymmetryPercentage",
  ],

  // ENERGY (4 metrics)
  energy: [
    "HKQuantityTypeIdentifierActiveEnergyBurned",
    "HKQuantityTypeIdentifierBasalEnergyBurned",
    "HKQuantityTypeIdentifierDietaryEnergyConsumed",
    "HKQuantityTypeIdentifierAppleStandHour",
  ],

  // RESPIRATORY (5 metrics)
  respiratory: [
    "HKQuantityTypeIdentifierRespiratoryRate",
    "HKQuantityTypeIdentifierOxygenSaturation",
    "HKQuantityTypeIdentifierForcedVitalCapacity",
    "HKQuantityTypeIdentifierPeakExpiratoryFlowRate",
    "HKQuantityTypeIdentifierVO2Max",
  ],

  // BODY MEASUREMENTS (7 metrics)
  body: [
    "HKQuantityTypeIdentifierBodyMass",
    "HKQuantityTypeIdentifierBodyMassIndex",
    "HKQuantityTypeIdentifierBodyFatPercentage",
    "HKQuantityTypeIdentifierLeanBodyMass",
    "HKQuantityTypeIdentifierHeight",
    "HKQuantityTypeIdentifierWaistCircumference",
    "HKQuantityTypeIdentifierBodyTemperature",
  ],

  // SLEEP (4 metrics)
  sleep: [
    "HKCategoryTypeIdentifierSleepAnalysis",
    "HKQuantityTypeIdentifierSleepingWristTemperature",
    "HKQuantityTypeIdentifierAppleSleepingBreathingDisturbances",
    "HKCategoryTypeIdentifierSleepApneaEvent",
  ],

  // VITALS (4 metrics)
  vitals: [
    "HKQuantityTypeIdentifierBloodPressureSystolic",
    "HKQuantityTypeIdentifierBloodPressureDiastolic",
    "HKQuantityTypeIdentifierBloodGlucose",
    "HKQuantityTypeIdentifierBodyTemperature",
  ],

  // RUNNING & FITNESS (6 metrics)
  fitness: [
    "HKQuantityTypeIdentifierRunningSpeed",
    "HKQuantityTypeIdentifierRunningPower",
    "HKQuantityTypeIdentifierRunningStrideLength",
    "HKQuantityTypeIdentifierRunningVerticalOscillation",
    "HKQuantityTypeIdentifierRunningGroundContactTime",
    "HKQuantityTypeIdentifierPhysicalEffort",
  ],

  // ENVIRONMENTAL (4 metrics)
  environmental: [
    "HKQuantityTypeIdentifierTimeInDaylight",
    "HKQuantityTypeIdentifierUVExposure",
    "HKQuantityTypeIdentifierEnvironmentalAudioExposure",
    "HKQuantityTypeIdentifierHeadphoneAudioExposure",
  ],

  // MINDFULNESS (2 metrics)
  mindfulness: [
    "HKCategoryTypeIdentifierMindfulSession",
    "HKQuantityTypeIdentifierAppleSleepingBreathingDisturbances",
  ],
} as const;

/**
 * Get all Apple Health metric IDs as flat array
 */
export function getAllAppleHealthMetrics(): string[] {
  return Object.values(APPLE_HEALTH_METRICS).flat();
}

/**
 * Total count of Apple Health metrics
 */
export const APPLE_HEALTH_METRIC_COUNT = getAllAppleHealthMetrics().length;

// ============================================
// ATTESTATION REQUIREMENTS
// ============================================

/**
 * Core metrics required for a "complete" Apple Health dataset
 * These are the minimum metrics needed for meaningful health analysis
 */
export const APPLE_HEALTH_CORE_METRICS = [
  // Must have heart data
  "HKQuantityTypeIdentifierHeartRate",
  "HKQuantityTypeIdentifierRestingHeartRate",

  // Must have activity data
  "HKQuantityTypeIdentifierStepCount",
  "HKQuantityTypeIdentifierActiveEnergyBurned",

  // Must have sleep data
  "HKCategoryTypeIdentifierSleepAnalysis",
] as const;

/**
 * Recommended metrics (higher completeness score if present)
 */
export const APPLE_HEALTH_RECOMMENDED_METRICS = [
  "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
  "HKQuantityTypeIdentifierRespiratoryRate",
  "HKQuantityTypeIdentifierVO2Max",
  "HKQuantityTypeIdentifierAppleExerciseTime",
  "HKQuantityTypeIdentifierDistanceWalkingRunning",
  "HKQuantityTypeIdentifierFlightsClimbed",
  "HKQuantityTypeIdentifierBodyMass",
  "HKQuantityTypeIdentifierOxygenSaturation",
] as const;

// ============================================
// COMPLETENESS CALCULATION
// ============================================

export interface DatasetCompleteness {
  // Overall score 0-100
  score: number;

  // Are all core metrics present?
  coreComplete: boolean;

  // Breakdown by category
  categoryScores: Record<string, number>;

  // Missing metrics
  missingCore: string[];
  missingRecommended: string[];

  // Present metrics count
  presentCount: number;
  totalPossible: number;

  // Coverage
  startDate: string;
  endDate: string;
  daysCovered: number;
}

/**
 * Calculate completeness score for Apple Health data
 */
export function calculateAppleHealthCompleteness(
  presentMetrics: string[],
  startDate: Date,
  endDate: Date,
): DatasetCompleteness {
  const presentSet = new Set(presentMetrics.map((m) => m.toLowerCase()));

  // Check core metrics
  const missingCore = APPLE_HEALTH_CORE_METRICS.filter(
    (m) => !presentSet.has(m.toLowerCase()),
  );
  const coreComplete = missingCore.length === 0;

  // Check recommended metrics
  const missingRecommended = APPLE_HEALTH_RECOMMENDED_METRICS.filter(
    (m) => !presentSet.has(m.toLowerCase()),
  );

  // Calculate category scores
  const categoryScores: Record<string, number> = {};
  for (const [category, metrics] of Object.entries(APPLE_HEALTH_METRICS)) {
    const categoryPresent = metrics.filter((m) =>
      presentSet.has(m.toLowerCase()),
    ).length;
    categoryScores[category] = Math.round(
      (categoryPresent / metrics.length) * 100,
    );
  }

  // Calculate overall score
  // - 50% weight on core metrics
  // - 30% weight on recommended metrics
  // - 20% weight on all other metrics
  const coreScore =
    ((APPLE_HEALTH_CORE_METRICS.length - missingCore.length) /
      APPLE_HEALTH_CORE_METRICS.length) *
    50;
  const recommendedScore =
    ((APPLE_HEALTH_RECOMMENDED_METRICS.length - missingRecommended.length) /
      APPLE_HEALTH_RECOMMENDED_METRICS.length) *
    30;
  const allMetrics = getAllAppleHealthMetrics();
  const otherPresent = presentMetrics.filter(
    (m) =>
      !APPLE_HEALTH_CORE_METRICS.includes(
        m as (typeof APPLE_HEALTH_CORE_METRICS)[number],
      ) &&
      !APPLE_HEALTH_RECOMMENDED_METRICS.includes(
        m as (typeof APPLE_HEALTH_RECOMMENDED_METRICS)[number],
      ),
  ).length;
  const otherTotal =
    allMetrics.length -
    APPLE_HEALTH_CORE_METRICS.length -
    APPLE_HEALTH_RECOMMENDED_METRICS.length;
  const otherScore = (otherPresent / Math.max(otherTotal, 1)) * 20;

  const score = Math.round(coreScore + recommendedScore + otherScore);

  // Calculate days covered
  const daysCovered = Math.ceil(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  return {
    score,
    coreComplete,
    categoryScores,
    missingCore,
    missingRecommended,
    presentCount: presentMetrics.length,
    totalPossible: allMetrics.length,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    daysCovered,
  };
}

// ============================================
// ATTESTATION THRESHOLDS
// ============================================

/**
 * Minimum requirements for different attestation tiers
 */
export const ATTESTATION_TIERS = {
  // Gold: Full dataset, all core + most recommended, 90+ days
  gold: {
    minScore: 80,
    coreRequired: true,
    minDays: 90,
    minRecommendedPercent: 75,
  },

  // Silver: Core complete, 60+ days
  silver: {
    minScore: 60,
    coreRequired: true,
    minDays: 60,
    minRecommendedPercent: 50,
  },

  // Bronze: Core mostly complete (4/5), 30+ days
  bronze: {
    minScore: 40,
    coreRequired: false,
    minCorePercent: 80, // 4 of 5 core metrics
    minDays: 30,
    minRecommendedPercent: 25,
  },
} as const;

export type AttestationTier = keyof typeof ATTESTATION_TIERS | "none";

/**
 * Determine attestation tier based on completeness
 */
export function getAttestationTier(
  completeness: DatasetCompleteness,
): AttestationTier {
  const { score, coreComplete, daysCovered, missingCore, missingRecommended } =
    completeness;

  const corePercent =
    ((APPLE_HEALTH_CORE_METRICS.length - missingCore.length) /
      APPLE_HEALTH_CORE_METRICS.length) *
    100;
  const recommendedPercent =
    ((APPLE_HEALTH_RECOMMENDED_METRICS.length - missingRecommended.length) /
      APPLE_HEALTH_RECOMMENDED_METRICS.length) *
    100;

  // Check Gold
  if (
    score >= ATTESTATION_TIERS.gold.minScore &&
    coreComplete &&
    daysCovered >= ATTESTATION_TIERS.gold.minDays &&
    recommendedPercent >= ATTESTATION_TIERS.gold.minRecommendedPercent
  ) {
    return "gold";
  }

  // Check Silver
  if (
    score >= ATTESTATION_TIERS.silver.minScore &&
    coreComplete &&
    daysCovered >= ATTESTATION_TIERS.silver.minDays &&
    recommendedPercent >= ATTESTATION_TIERS.silver.minRecommendedPercent
  ) {
    return "silver";
  }

  // Check Bronze
  if (
    score >= ATTESTATION_TIERS.bronze.minScore &&
    corePercent >= ATTESTATION_TIERS.bronze.minCorePercent &&
    daysCovered >= ATTESTATION_TIERS.bronze.minDays &&
    recommendedPercent >= ATTESTATION_TIERS.bronze.minRecommendedPercent
  ) {
    return "bronze";
  }

  return "none";
}

// ============================================
// DATA TYPES FOR CONTRACT
// ============================================

export enum HealthDataType {
  DEXA = 0,
  BLOODWORK = 1,
  APPLE_HEALTH = 2,
  CGM = 3,
  // Add more as integrated
}

export interface OnChainAttestation {
  contentHash: string; // bytes32 - hash of encrypted data
  dataType: HealthDataType;
  startDate: number; // uint40 - unix timestamp
  endDate: number; // uint40 - unix timestamp
  completenessScore: number; // uint16 - 0-10000 (0-100.00%)
  tier: AttestationTier; // Derived from score
  recordCount: number; // uint16 - days or records
  coreComplete: boolean;
}

// ============================================
// DEXA COMPLETENESS (for reference)
// ============================================

export const DEXA_CORE_METRICS = [
  "totalBodyFatPercent",
  "totalLeanMassKg",
  "boneDensityTotal.bmd",
  "visceralFatRating",
] as const;

export const DEXA_RECOMMENDED_METRICS = [
  "boneDensityTotal.tScore",
  "boneDensityTotal.zScore",
  "androidGynoidRatio",
  "visceralFatVolumeCm3",
  "visceralFatAreaCm2",
] as const;

export function calculateDexaCompleteness(presentFields: string[]): {
  score: number;
  coreComplete: boolean;
  missing: string[];
} {
  const missingCore = DEXA_CORE_METRICS.filter(
    (m) => !presentFields.includes(m),
  );
  const missingRecommended = DEXA_RECOMMENDED_METRICS.filter(
    (m) => !presentFields.includes(m),
  );

  const coreScore =
    ((DEXA_CORE_METRICS.length - missingCore.length) /
      DEXA_CORE_METRICS.length) *
    70;
  const recommendedScore =
    ((DEXA_RECOMMENDED_METRICS.length - missingRecommended.length) /
      DEXA_RECOMMENDED_METRICS.length) *
    30;

  return {
    score: Math.round(coreScore + recommendedScore),
    coreComplete: missingCore.length === 0,
    missing: [...missingCore, ...missingRecommended],
  };
}
