/**
 * This file contains the validated, type-safe health metric types used throughout the application.
 * These types represent the processed, validated data after initial parsing from the Apple Health XML export.
 *
 * For raw data types used during initial parsing, see src/my-health-app/types/healthData.ts
 * which contains the HealthDataPoint type and related interfaces.
 */

// Base types for all health metrics
export type MetricUnit =
  | "count"
  | "bpm"
  | "ms"
  | "kcal"
  | "min"
  | "hr"
  | "count/min"
  | "ml/(kg*min)";

// Data source types
export type DataSource = "watch" | "phone" | "pillow" | "other";

// Source priority configuration
export interface SourcePriority {
  priority: number; // Lower number = higher priority
  allowed: boolean; // Whether this source is allowed for this metric
}

export const SOURCE_PRIORITIES: Record<
  MetricType,
  Record<DataSource, SourcePriority>
> = {
  HKQuantityTypeIdentifierStepCount: {
    watch: { priority: 1, allowed: true },
    phone: { priority: 2, allowed: true },
    pillow: { priority: 3, allowed: false },
    other: { priority: 4, allowed: true },
  },
  HKQuantityTypeIdentifierHeartRate: {
    watch: { priority: 1, allowed: true },
    phone: { priority: 2, allowed: true },
    pillow: { priority: 3, allowed: false },
    other: { priority: 4, allowed: true },
  },
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: {
    watch: { priority: 1, allowed: true },
    phone: { priority: 2, allowed: true },
    pillow: { priority: 3, allowed: false },
    other: { priority: 4, allowed: true },
  },
  HKQuantityTypeIdentifierRespiratoryRate: {
    watch: { priority: 1, allowed: true },
    phone: { priority: 2, allowed: true },
    pillow: { priority: 3, allowed: false },
    other: { priority: 4, allowed: true },
  },
  HKQuantityTypeIdentifierAppleExerciseTime: {
    watch: { priority: 1, allowed: true },
    phone: { priority: 2, allowed: true },
    pillow: { priority: 3, allowed: false },
    other: { priority: 4, allowed: true },
  },
  HKQuantityTypeIdentifierRestingHeartRate: {
    watch: { priority: 1, allowed: true },
    phone: { priority: 2, allowed: true },
    pillow: { priority: 3, allowed: false },
    other: { priority: 4, allowed: true },
  },
  HKQuantityTypeIdentifierActiveEnergyBurned: {
    watch: { priority: 1, allowed: true },
    phone: { priority: 2, allowed: true },
    pillow: { priority: 3, allowed: false },
    other: { priority: 4, allowed: true },
  },
  HKQuantityTypeIdentifierVO2Max: {
    watch: { priority: 1, allowed: true },
    phone: { priority: 2, allowed: true },
    pillow: { priority: 3, allowed: false },
    other: { priority: 4, allowed: true },
  },
  HKCategoryTypeIdentifierSleepAnalysis: {
    watch: { priority: 1, allowed: true },
    phone: { priority: 2, allowed: false }, // Phone data not allowed for sleep
    pillow: { priority: 3, allowed: false }, // Pillow app data not allowed
    other: { priority: 4, allowed: false },
  },
} as const;

/**
 * Base interface for all health metrics.
 * This is the validated, type-safe version of the raw HealthDataPoint type.
 *
 * Key differences from HealthDataPoint:
 * - Required unit and source fields
 * - Strict unit type definitions
 * - No chartData (UI-specific data)
 * - Type-specific implementations for each metric type
 */
export interface BaseHealthMetric {
  startDate: string;
  endDate: string;
  value: string;
  unit: MetricUnit;
  source: DataSource; // Made required instead of optional
  device?: string;
}

// Specific metric types
export interface StepCountMetric extends BaseHealthMetric {
  type: "HKQuantityTypeIdentifierStepCount";
  unit: "count";
}

export interface HeartRateMetric extends BaseHealthMetric {
  type: "HKQuantityTypeIdentifierHeartRate";
  unit: "bpm";
}

export interface HRVMetric extends BaseHealthMetric {
  type: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN";
  unit: "ms";
}

export interface RespiratoryRateMetric extends BaseHealthMetric {
  type: "HKQuantityTypeIdentifierRespiratoryRate";
  unit: "count/min";
}

export interface ExerciseTimeMetric extends BaseHealthMetric {
  type: "HKQuantityTypeIdentifierAppleExerciseTime";
  unit: "min";
}

export interface RestingHeartRateMetric extends BaseHealthMetric {
  type: "HKQuantityTypeIdentifierRestingHeartRate";
  unit: "bpm";
}

export interface VO2MaxMetric extends BaseHealthMetric {
  type: "HKQuantityTypeIdentifierVO2Max";
  unit: "ml/(kg*min)";
}

export interface ActiveEnergyMetric extends BaseHealthMetric {
  type: "HKQuantityTypeIdentifierActiveEnergyBurned";
  unit: "kcal";
}

export type SleepStage = "inBed" | "core" | "deep" | "rem" | "awake";

export interface SleepAnalysisMetric extends BaseHealthMetric {
  type: "HKCategoryTypeIdentifierSleepAnalysis";
  unit: "hr";
  value: SleepStage;
  duration?: number; // Duration in hours
  quality?: "poor" | "fair" | "good" | "excellent";
}

// Union type of all supported metrics
export type HealthMetric =
  | StepCountMetric
  | HeartRateMetric
  | HRVMetric
  | RespiratoryRateMetric
  | ExerciseTimeMetric
  | VO2MaxMetric
  | RestingHeartRateMetric
  | ActiveEnergyMetric
  | SleepAnalysisMetric;

// Type for metric identifiers
export type MetricType = HealthMetric["type"];

// Type for the results object returned by the parser
export interface HealthDataResults {
  [key: string]: HealthMetric[];
}

// Type for metric configuration
export interface MetricConfig {
  type: MetricType;
  displayName: string;
  description: string;
  unit: MetricUnit;
  category: "activity" | "cardio" | "sleep";
}

// Configuration for all supported metrics
export const SUPPORTED_METRICS: Record<MetricType, MetricConfig> = {
  HKQuantityTypeIdentifierStepCount: {
    type: "HKQuantityTypeIdentifierStepCount",
    displayName: "Step Count",
    description: "Number of steps taken",
    unit: "count",
    category: "activity",
  },
  HKQuantityTypeIdentifierHeartRate: {
    type: "HKQuantityTypeIdentifierHeartRate",
    displayName: "Heart Rate",
    description: "Heart rate in beats per minute",
    unit: "bpm",
    category: "cardio",
  },
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: {
    type: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
    displayName: "HRV",
    description: "Heart rate variability in milliseconds",
    unit: "ms",
    category: "cardio",
  },
  HKQuantityTypeIdentifierRespiratoryRate: {
    type: "HKQuantityTypeIdentifierRespiratoryRate",
    displayName: "Respiratory Rate",
    description: "Breathing rate in breaths per minute",
    unit: "count/min",
    category: "cardio",
  },
  HKQuantityTypeIdentifierAppleExerciseTime: {
    type: "HKQuantityTypeIdentifierAppleExerciseTime",
    displayName: "Exercise Time",
    description: "Time spent exercising in minutes",
    unit: "min",
    category: "activity",
  },
  HKQuantityTypeIdentifierRestingHeartRate: {
    type: "HKQuantityTypeIdentifierRestingHeartRate",
    displayName: "Resting Heart Rate",
    description: "Resting heart rate in beats per minute",
    unit: "bpm",
    category: "cardio",
  },
  HKQuantityTypeIdentifierVO2Max: {
    type: "HKQuantityTypeIdentifierVO2Max",
    displayName: "VO2 Max",
    description: "Maximal oxygen uptake per kilogram per minute",
    unit: "ml/(kg*min)",
    category: "cardio",
  },
  HKQuantityTypeIdentifierActiveEnergyBurned: {
    type: "HKQuantityTypeIdentifierActiveEnergyBurned",
    displayName: "Active Energy",
    description: "Active energy burned in calories",
    unit: "kcal",
    category: "activity",
  },
  HKCategoryTypeIdentifierSleepAnalysis: {
    type: "HKCategoryTypeIdentifierSleepAnalysis",
    displayName: "Sleep",
    description: "Sleep analysis data including stages (core, deep, REM)",
    unit: "hr",
    category: "sleep",
  },
} as const;

// Helper function to check if a metric type is supported
export function isSupportedMetric(type: string): type is MetricType {
  return type in SUPPORTED_METRICS;
}

// Helper function to get metric config
export function getMetricConfig(type: MetricType): MetricConfig {
  return SUPPORTED_METRICS[type];
}

// Helper function to check if a source is allowed for a metric
export function isSourceAllowed(
  metricType: MetricType,
  source: DataSource,
): boolean {
  return SOURCE_PRIORITIES[metricType][source].allowed;
}

// Helper function to get source priority
export function getSourcePriority(
  metricType: MetricType,
  source: DataSource,
): number {
  return SOURCE_PRIORITIES[metricType][source].priority;
}

// Helper function to filter metrics by source
export function filterMetricsBySource<T extends HealthMetric>(
  metrics: T[],
  timeWindow: { start: Date; end: Date },
): T[] {
  const timeWindowMs = timeWindow.end.getTime() - timeWindow.start.getTime();
  const groupedMetrics = new Map<string, T[]>();

  // Group metrics by time window
  metrics.forEach((metric) => {
    const key = `${Math.floor(new Date(metric.startDate).getTime() / timeWindowMs)}`;
    if (!groupedMetrics.has(key)) {
      groupedMetrics.set(key, []);
    }
    groupedMetrics.get(key)!.push(metric);
  });

  // For each time window, select the highest priority source
  const filteredMetrics: T[] = [];
  groupedMetrics.forEach((windowMetrics) => {
    const metricType = windowMetrics[0].type as MetricType;
    const sortedMetrics = windowMetrics.sort((a, b) => {
      const priorityA = getSourcePriority(metricType, a.source as DataSource);
      const priorityB = getSourcePriority(metricType, b.source as DataSource);
      return priorityA - priorityB;
    });

    // Add the highest priority metric (lowest priority number)
    if (sortedMetrics.length > 0) {
      filteredMetrics.push(sortedMetrics[0]);
    }
  });

  return filteredMetrics;
}
