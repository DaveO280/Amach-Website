/**
 * Comprehensive mapping between Apple Health IDs and user-friendly metric names
 *
 * This mapping serves multiple purposes:
 * 1. AI tool queries (user-friendly -> Apple ID)
 * 2. Data normalization for Storj storage (Apple ID -> generic name)
 * 3. Display and reporting (Apple ID -> display name)
 *
 * When storing to Storj, we normalize to generic names for:
 * - Better AI digestibility
 * - Platform independence (not tied to Apple Health)
 * - Easier data sharing and portability
 */

/**
 * User-friendly metric names for AI queries and general use
 * These are the canonical names used in tool definitions and AI responses
 */
export type MetricName =
  // Heart & Cardiovascular
  | "heartRate"
  | "restingHeartRate"
  | "hrv"
  | "vo2max"
  | "respiratoryRate"

  // Activity
  | "steps"
  | "activeEnergy"
  | "exerciseTime"
  | "distance"
  | "flightsClimbed"

  // Sleep
  | "sleep"

  // Body Metrics
  | "bodyTemperature"
  | "wristTemperature"
  | "timeInDaylight";

/**
 * Comprehensive mapping: User-friendly name -> Apple Health ID
 * Multiple aliases can map to the same Apple Health ID
 */
export const METRIC_NAME_TO_APPLE_ID: Record<string, string> = {
  // Heart & Cardiovascular Metrics
  heartRate: "HKQuantityTypeIdentifierHeartRate",
  heartrate: "HKQuantityTypeIdentifierHeartRate",
  hr: "HKQuantityTypeIdentifierHeartRate",
  bpm: "HKQuantityTypeIdentifierHeartRate",

  restingHeartRate: "HKQuantityTypeIdentifierRestingHeartRate",
  restingheartrate: "HKQuantityTypeIdentifierRestingHeartRate",
  rhr: "HKQuantityTypeIdentifierRestingHeartRate",
  restinghr: "HKQuantityTypeIdentifierRestingHeartRate",

  hrv: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
  heartRateVariability: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
  heartratevariability: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
  hrv_sdnn: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",

  vo2max: "HKQuantityTypeIdentifierVO2Max",
  vo2: "HKQuantityTypeIdentifierVO2Max",
  vo2_max: "HKQuantityTypeIdentifierVO2Max",
  maximaloxygenuptake: "HKQuantityTypeIdentifierVO2Max",

  respiratoryRate: "HKQuantityTypeIdentifierRespiratoryRate",
  respiratoryrate: "HKQuantityTypeIdentifierRespiratoryRate",
  respiration: "HKQuantityTypeIdentifierRespiratoryRate",
  breathingRate: "HKQuantityTypeIdentifierRespiratoryRate",
  breathingrate: "HKQuantityTypeIdentifierRespiratoryRate",

  // Activity Metrics
  steps: "HKQuantityTypeIdentifierStepCount",
  stepCount: "HKQuantityTypeIdentifierStepCount",
  stepcount: "HKQuantityTypeIdentifierStepCount",
  step_count: "HKQuantityTypeIdentifierStepCount",

  activeEnergy: "HKQuantityTypeIdentifierActiveEnergyBurned",
  activeEnergyBurned: "HKQuantityTypeIdentifierActiveEnergyBurned",
  activeenergy: "HKQuantityTypeIdentifierActiveEnergyBurned",
  activeenergyburned: "HKQuantityTypeIdentifierActiveEnergyBurned",
  calories: "HKQuantityTypeIdentifierActiveEnergyBurned",
  activecalories: "HKQuantityTypeIdentifierActiveEnergyBurned",
  caloriesburned: "HKQuantityTypeIdentifierActiveEnergyBurned",

  exerciseTime: "HKQuantityTypeIdentifierAppleExerciseTime",
  exercisetime: "HKQuantityTypeIdentifierAppleExerciseTime",
  exercise: "HKQuantityTypeIdentifierAppleExerciseTime",
  workoutTime: "HKQuantityTypeIdentifierAppleExerciseTime",
  workouttime: "HKQuantityTypeIdentifierAppleExerciseTime",

  distance: "HKQuantityTypeIdentifierDistanceWalkingRunning",
  walkingDistance: "HKQuantityTypeIdentifierDistanceWalkingRunning",
  walkingdistance: "HKQuantityTypeIdentifierDistanceWalkingRunning",
  runningDistance: "HKQuantityTypeIdentifierDistanceWalkingRunning",
  runningdistance: "HKQuantityTypeIdentifierDistanceWalkingRunning",
  distancewalkingrunning: "HKQuantityTypeIdentifierDistanceWalkingRunning",

  flightsClimbed: "HKQuantityTypeIdentifierFlightsClimbed",
  flightsclimbed: "HKQuantityTypeIdentifierFlightsClimbed",
  stairs: "HKQuantityTypeIdentifierFlightsClimbed",
  flights: "HKQuantityTypeIdentifierFlightsClimbed",

  // Sleep Metrics
  sleep: "HKCategoryTypeIdentifierSleepAnalysis",
  sleepAnalysis: "HKCategoryTypeIdentifierSleepAnalysis",
  sleepanalysis: "HKCategoryTypeIdentifierSleepAnalysis",
  sleepdata: "HKCategoryTypeIdentifierSleepAnalysis",

  // Body Metrics (for future expansion)
  bodyTemperature: "HKQuantityTypeIdentifierBodyTemperature",
  bodytemperature: "HKQuantityTypeIdentifierBodyTemperature",
  temp: "HKQuantityTypeIdentifierBodyTemperature",
  temperature: "HKQuantityTypeIdentifierBodyTemperature",

  wristTemperature: "HKQuantityTypeIdentifierSleepingWristTemperature",
  wristtemperature: "HKQuantityTypeIdentifierSleepingWristTemperature",
  sleepingwristtemperature: "HKQuantityTypeIdentifierSleepingWristTemperature",

  timeInDaylight: "HKQuantityTypeIdentifierTimeInDaylight",
  timeindaylight: "HKQuantityTypeIdentifierTimeInDaylight",
  daylight: "HKQuantityTypeIdentifierTimeInDaylight",
  sunlight: "HKQuantityTypeIdentifierTimeInDaylight",
} as const;

/**
 * Reverse mapping: Apple Health ID -> Canonical user-friendly name
 * This is the primary mapping used for responses and data normalization
 */
export const APPLE_ID_TO_METRIC_NAME: Record<string, MetricName> = {
  // Heart & Cardiovascular
  HKQuantityTypeIdentifierHeartRate: "heartRate",
  HKQuantityTypeIdentifierRestingHeartRate: "restingHeartRate",
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: "hrv",
  HKQuantityTypeIdentifierVO2Max: "vo2max",
  HKQuantityTypeIdentifierRespiratoryRate: "respiratoryRate",

  // Activity
  HKQuantityTypeIdentifierStepCount: "steps",
  HKQuantityTypeIdentifierActiveEnergyBurned: "activeEnergy",
  HKQuantityTypeIdentifierAppleExerciseTime: "exerciseTime",
  HKQuantityTypeIdentifierDistanceWalkingRunning: "distance",
  HKQuantityTypeIdentifierFlightsClimbed: "flightsClimbed",

  // Sleep
  HKCategoryTypeIdentifierSleepAnalysis: "sleep",

  // Body Metrics (for future expansion)
  HKQuantityTypeIdentifierBodyTemperature: "bodyTemperature",
  HKQuantityTypeIdentifierSleepingWristTemperature: "wristTemperature",
  HKQuantityTypeIdentifierTimeInDaylight: "timeInDaylight",
} as const;

/**
 * Display names for UI and reports
 */
export const METRIC_DISPLAY_NAMES: Record<MetricName, string> = {
  // Heart & Cardiovascular
  heartRate: "Heart Rate",
  restingHeartRate: "Resting Heart Rate",
  hrv: "Heart Rate Variability",
  vo2max: "VO₂ Max",
  respiratoryRate: "Respiratory Rate",

  // Activity
  steps: "Steps",
  activeEnergy: "Active Energy",
  exerciseTime: "Exercise Time",
  distance: "Distance",
  flightsClimbed: "Flights Climbed",

  // Sleep
  sleep: "Sleep",

  // Body Metrics
  bodyTemperature: "Body Temperature",
  wristTemperature: "Wrist Temperature",
  timeInDaylight: "Time in Daylight",
} as const;

/**
 * Metric units for each metric type
 */
export const METRIC_UNITS: Record<MetricName, string> = {
  // Heart & Cardiovascular
  heartRate: "bpm",
  restingHeartRate: "bpm",
  hrv: "ms",
  vo2max: "ml/(kg·min)",
  respiratoryRate: "breaths/min",

  // Activity
  steps: "count",
  activeEnergy: "kcal",
  exerciseTime: "min",
  distance: "m",
  flightsClimbed: "count",

  // Sleep
  sleep: "hr",

  // Body Metrics
  bodyTemperature: "°C",
  wristTemperature: "°C",
  timeInDaylight: "min",
} as const;

/**
 * Metric categories for organization
 */
export const METRIC_CATEGORIES: Record<
  MetricName,
  "cardio" | "activity" | "sleep" | "body"
> = {
  // Heart & Cardiovascular
  heartRate: "cardio",
  restingHeartRate: "cardio",
  hrv: "cardio",
  vo2max: "cardio",
  respiratoryRate: "cardio",

  // Activity
  steps: "activity",
  activeEnergy: "activity",
  exerciseTime: "activity",
  distance: "activity",
  flightsClimbed: "activity",

  // Sleep
  sleep: "sleep",

  // Body Metrics
  bodyTemperature: "body",
  wristTemperature: "body",
  timeInDaylight: "body",
} as const;

/**
 * Normalize a metric name to Apple Health ID
 * Handles user-friendly names, aliases, and already-normalized IDs
 */
export function normalizeToAppleId(metricName: string): string {
  const normalized = metricName.toLowerCase().trim();

  // If already an Apple Health ID, return as-is
  if (metricName.startsWith("HK")) {
    return metricName;
  }

  // Try to map from user-friendly name
  return METRIC_NAME_TO_APPLE_ID[normalized] || metricName;
}

/**
 * Convert Apple Health ID to canonical user-friendly name
 * Used for responses and data normalization
 */
export function toMetricName(appleId: string): MetricName | string {
  return APPLE_ID_TO_METRIC_NAME[appleId] || appleId;
}

/**
 * Get display name for a metric (either from Apple ID or metric name)
 */
export function getMetricDisplayName(metric: string): string {
  const metricName = metric.startsWith("HK")
    ? toMetricName(metric)
    : (metric as MetricName);

  if (metricName in METRIC_DISPLAY_NAMES) {
    return METRIC_DISPLAY_NAMES[metricName as MetricName];
  }

  // Fallback: format the metric name nicely
  return metricName
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

/**
 * Get unit for a metric (either from Apple ID or metric name)
 */
export function getMetricUnit(metric: string): string {
  const metricName = metric.startsWith("HK")
    ? toMetricName(metric)
    : (metric as MetricName);

  if (metricName in METRIC_UNITS) {
    return METRIC_UNITS[metricName as MetricName];
  }

  return "unknown";
}

/**
 * Normalize health data point for Storj storage
 * Converts Apple Health IDs to generic metric names for better portability
 */
export interface NormalizedHealthDataPoint {
  metric: MetricName | string; // Generic metric name
  date: string; // ISO date string
  value: number;
  unit: string;
  source?: string;
  device?: string;
  // Keep original Apple ID for reference if needed
  originalMetricId?: string;
}

/**
 * Normalize a health data point for storage
 * This is used when saving to Storj to make data platform-independent
 */
export function normalizeDataPointForStorage(
  appleId: string,
  date: Date | string,
  value: number | string,
  unit?: string,
  source?: string,
  device?: string,
): NormalizedHealthDataPoint {
  const metricName = toMetricName(appleId);
  const normalizedUnit = unit || getMetricUnit(metricName);
  const dateStr = typeof date === "string" ? date : date.toISOString();
  const numValue = typeof value === "string" ? parseFloat(value) : value;

  return {
    metric: metricName,
    date: dateStr,
    value: numValue,
    unit: normalizedUnit,
    source,
    device,
    originalMetricId: appleId, // Keep for reference/debugging
  };
}

/**
 * Normalize a health data object (like HealthDataByType) for Storj storage
 * Converts all Apple Health IDs to generic metric names
 *
 * @example
 * ```typescript
 * const rawData = {
 *   HKQuantityTypeIdentifierHeartRate: [...],
 *   HKQuantityTypeIdentifierStepCount: [...]
 * };
 * const normalized = normalizeHealthDataForStorage(rawData);
 * // Result: {
 * //   heartRate: [...],
 * //   steps: [...]
 * // }
 * ```
 */
export function normalizeHealthDataForStorage(
  healthData: Record<
    string,
    Array<{
      startDate: string;
      value: string;
      unit?: string;
      source?: string;
      device?: string;
    }>
  >,
): Record<string, NormalizedHealthDataPoint[]> {
  const normalized: Record<string, NormalizedHealthDataPoint[]> = {};

  for (const [appleId, dataPoints] of Object.entries(healthData)) {
    const metricName = toMetricName(appleId);

    if (!normalized[metricName]) {
      normalized[metricName] = [];
    }

    normalized[metricName].push(
      ...dataPoints.map((point) =>
        normalizeDataPointForStorage(
          appleId,
          point.startDate,
          point.value,
          point.unit,
          point.source,
          point.device,
        ),
      ),
    );
  }

  return normalized;
}

/**
 * Check if a metric name is supported
 */
export function isSupportedMetricName(name: string): boolean {
  const normalized = normalizeToAppleId(name);
  return normalized in APPLE_ID_TO_METRIC_NAME || normalized.startsWith("HK");
}
