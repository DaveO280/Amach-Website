/**
 * Metric Aggregation Strategies for Apple Health Data
 *
 * Defines how each metric type should be aggregated for daily summaries.
 * This ensures representative data in Storj storage.
 */

export type AggregationType =
  | "sum" // Cumulative: total for the day (steps, calories, distance)
  | "avg" // Average: mean value (heart rate during activity)
  | "avg_min_max" // Average with range: for continuous metrics (HR, respiratory)
  | "latest" // Single daily value: once-daily measurements (resting HR, VO2 max)
  | "duration" // Time-based: sleep stages, exercise sessions
  | "count"; // Event count: stand hours, high/low HR events

export interface MetricAggregationStrategy {
  aggregationType: AggregationType;
  unit: string;
  description: string;
}

/**
 * Aggregation strategies for ALL Apple Health metrics
 * Organized by HealthKit identifier
 */
export const METRIC_AGGREGATION_STRATEGIES: Record<
  string,
  MetricAggregationStrategy
> = {
  // ============================================
  // CUMULATIVE METRICS (sum per day)
  // ============================================
  HKQuantityTypeIdentifierStepCount: {
    aggregationType: "sum",
    unit: "count",
    description: "Total steps for the day",
  },
  HKQuantityTypeIdentifierDistanceWalkingRunning: {
    aggregationType: "sum",
    unit: "m",
    description: "Total walking/running distance",
  },
  HKQuantityTypeIdentifierDistanceCycling: {
    aggregationType: "sum",
    unit: "m",
    description: "Total cycling distance",
  },
  HKQuantityTypeIdentifierDistanceSwimming: {
    aggregationType: "sum",
    unit: "m",
    description: "Total swimming distance",
  },
  HKQuantityTypeIdentifierFlightsClimbed: {
    aggregationType: "sum",
    unit: "count",
    description: "Total flights climbed",
  },
  HKQuantityTypeIdentifierActiveEnergyBurned: {
    aggregationType: "sum",
    unit: "kcal",
    description: "Total active calories burned",
  },
  HKQuantityTypeIdentifierBasalEnergyBurned: {
    aggregationType: "sum",
    unit: "kcal",
    description: "Total basal/resting calories",
  },
  HKQuantityTypeIdentifierAppleExerciseTime: {
    aggregationType: "sum",
    unit: "min",
    description: "Total exercise minutes",
  },
  HKQuantityTypeIdentifierAppleStandTime: {
    aggregationType: "sum",
    unit: "min",
    description: "Total standing time",
  },
  HKQuantityTypeIdentifierAppleMoveTime: {
    aggregationType: "sum",
    unit: "min",
    description: "Total move time",
  },
  HKQuantityTypeIdentifierDietaryEnergyConsumed: {
    aggregationType: "sum",
    unit: "kcal",
    description: "Total calories consumed",
  },
  HKQuantityTypeIdentifierDietaryWater: {
    aggregationType: "sum",
    unit: "mL",
    description: "Total water intake",
  },
  HKQuantityTypeIdentifierTimeInDaylight: {
    aggregationType: "sum",
    unit: "min",
    description: "Total time in daylight",
  },

  // ============================================
  // CONTINUOUS METRICS (avg + min/max)
  // ============================================
  HKQuantityTypeIdentifierHeartRate: {
    aggregationType: "avg_min_max",
    unit: "bpm",
    description: "Heart rate with daily range",
  },
  HKQuantityTypeIdentifierRespiratoryRate: {
    aggregationType: "avg_min_max",
    unit: "count/min",
    description: "Respiratory rate with range",
  },
  HKQuantityTypeIdentifierOxygenSaturation: {
    aggregationType: "avg_min_max",
    unit: "%",
    description: "Blood oxygen with range",
  },
  HKQuantityTypeIdentifierBodyTemperature: {
    aggregationType: "avg_min_max",
    unit: "degC",
    description: "Body temperature with range",
  },
  HKQuantityTypeIdentifierBloodGlucose: {
    aggregationType: "avg_min_max",
    unit: "mg/dL",
    description: "Blood glucose with range",
  },
  HKQuantityTypeIdentifierEnvironmentalAudioExposure: {
    aggregationType: "avg_min_max",
    unit: "dBASPL",
    description: "Environmental noise levels",
  },
  HKQuantityTypeIdentifierHeadphoneAudioExposure: {
    aggregationType: "avg_min_max",
    unit: "dBASPL",
    description: "Headphone audio levels",
  },

  // ============================================
  // ONCE-DAILY METRICS (single/latest value)
  // ============================================
  HKQuantityTypeIdentifierRestingHeartRate: {
    aggregationType: "latest",
    unit: "bpm",
    description: "Daily resting heart rate",
  },
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: {
    aggregationType: "avg",
    unit: "ms",
    description: "Heart rate variability (can have multiple readings)",
  },
  HKQuantityTypeIdentifierVO2Max: {
    aggregationType: "latest",
    unit: "mL/kg·min",
    description: "VO2 max (rare updates)",
  },
  HKQuantityTypeIdentifierWalkingHeartRateAverage: {
    aggregationType: "avg",
    unit: "bpm",
    description: "Average walking heart rate",
  },
  HKQuantityTypeIdentifierHeartRateRecoveryOneMinute: {
    aggregationType: "avg",
    unit: "bpm",
    description: "Heart rate recovery",
  },
  HKQuantityTypeIdentifierBodyMass: {
    aggregationType: "latest",
    unit: "kg",
    description: "Body weight",
  },
  HKQuantityTypeIdentifierBodyMassIndex: {
    aggregationType: "latest",
    unit: "count",
    description: "BMI",
  },
  HKQuantityTypeIdentifierBodyFatPercentage: {
    aggregationType: "latest",
    unit: "%",
    description: "Body fat percentage",
  },
  HKQuantityTypeIdentifierLeanBodyMass: {
    aggregationType: "latest",
    unit: "kg",
    description: "Lean body mass",
  },
  HKQuantityTypeIdentifierHeight: {
    aggregationType: "latest",
    unit: "m",
    description: "Height",
  },
  HKQuantityTypeIdentifierWaistCircumference: {
    aggregationType: "latest",
    unit: "cm",
    description: "Waist circumference",
  },
  HKQuantityTypeIdentifierBloodPressureSystolic: {
    aggregationType: "avg_min_max",
    unit: "mmHg",
    description: "Systolic blood pressure",
  },
  HKQuantityTypeIdentifierBloodPressureDiastolic: {
    aggregationType: "avg_min_max",
    unit: "mmHg",
    description: "Diastolic blood pressure",
  },

  // ============================================
  // WALKING/RUNNING METRICS (avg per day)
  // ============================================
  HKQuantityTypeIdentifierWalkingSpeed: {
    aggregationType: "avg",
    unit: "m/s",
    description: "Average walking speed",
  },
  HKQuantityTypeIdentifierWalkingStepLength: {
    aggregationType: "avg",
    unit: "m",
    description: "Average step length",
  },
  HKQuantityTypeIdentifierWalkingAsymmetryPercentage: {
    aggregationType: "avg",
    unit: "%",
    description: "Walking asymmetry",
  },
  HKQuantityTypeIdentifierWalkingDoubleSupportPercentage: {
    aggregationType: "avg",
    unit: "%",
    description: "Double support time",
  },
  HKQuantityTypeIdentifierRunningSpeed: {
    aggregationType: "avg_min_max",
    unit: "m/s",
    description: "Running speed with range",
  },
  HKQuantityTypeIdentifierRunningPower: {
    aggregationType: "avg",
    unit: "W",
    description: "Running power",
  },
  HKQuantityTypeIdentifierRunningStrideLength: {
    aggregationType: "avg",
    unit: "m",
    description: "Running stride length",
  },
  HKQuantityTypeIdentifierRunningVerticalOscillation: {
    aggregationType: "avg",
    unit: "cm",
    description: "Vertical oscillation",
  },
  HKQuantityTypeIdentifierRunningGroundContactTime: {
    aggregationType: "avg",
    unit: "ms",
    description: "Ground contact time",
  },
  HKQuantityTypeIdentifierPhysicalEffort: {
    aggregationType: "avg",
    unit: "count",
    description: "Physical effort level",
  },

  // ============================================
  // SLEEP METRICS (duration-based)
  // ============================================
  HKCategoryTypeIdentifierSleepAnalysis: {
    aggregationType: "duration",
    unit: "min",
    description: "Sleep analysis with stages",
  },
  HKQuantityTypeIdentifierAppleSleepingWristTemperature: {
    aggregationType: "avg",
    unit: "degC",
    description: "Wrist temperature during sleep",
  },
  HKQuantityTypeIdentifierAppleSleepingBreathingDisturbances: {
    aggregationType: "avg",
    unit: "count/hr",
    description: "Breathing disturbances during sleep",
  },

  // ============================================
  // EVENT/COUNT METRICS
  // ============================================
  HKCategoryTypeIdentifierAppleStandHour: {
    aggregationType: "count",
    unit: "count",
    description: "Stand hours achieved",
  },
  HKCategoryTypeIdentifierHighHeartRateEvent: {
    aggregationType: "count",
    unit: "count",
    description: "High heart rate events",
  },
  HKCategoryTypeIdentifierLowHeartRateEvent: {
    aggregationType: "count",
    unit: "count",
    description: "Low heart rate events",
  },
  HKCategoryTypeIdentifierIrregularHeartRhythmEvent: {
    aggregationType: "count",
    unit: "count",
    description: "Irregular rhythm events",
  },
  HKCategoryTypeIdentifierMindfulSession: {
    aggregationType: "duration",
    unit: "min",
    description: "Mindfulness session duration",
  },
  HKCategoryTypeIdentifierSleepApneaEvent: {
    aggregationType: "count",
    unit: "count",
    description: "Sleep apnea events",
  },
  HKQuantityTypeIdentifierAtrialFibrillationBurden: {
    aggregationType: "avg",
    unit: "%",
    description: "AFib burden percentage",
  },

  // ============================================
  // LUNG FUNCTION
  // ============================================
  HKQuantityTypeIdentifierForcedVitalCapacity: {
    aggregationType: "latest",
    unit: "L",
    description: "Forced vital capacity",
  },
  HKQuantityTypeIdentifierForcedExpiratoryVolume1: {
    aggregationType: "latest",
    unit: "L",
    description: "FEV1",
  },
  HKQuantityTypeIdentifierPeakExpiratoryFlowRate: {
    aggregationType: "avg_min_max",
    unit: "L/min",
    description: "Peak expiratory flow",
  },

  // ============================================
  // UV/ENVIRONMENTAL
  // ============================================
  HKQuantityTypeIdentifierUVExposure: {
    aggregationType: "sum",
    unit: "count",
    description: "Total UV exposure",
  },
};

/**
 * Get aggregation strategy for a metric type
 * Returns a default "avg" strategy for unknown metrics
 */
export function getAggregationStrategy(
  metricType: string,
): MetricAggregationStrategy {
  return (
    METRIC_AGGREGATION_STRATEGIES[metricType] || {
      aggregationType: "avg",
      unit: "unknown",
      description: `Unknown metric: ${metricType}`,
    }
  );
}

/**
 * Check if a metric is cumulative (should be summed)
 */
export function isCumulativeMetric(metricType: string): boolean {
  const strategy = getAggregationStrategy(metricType);
  return strategy.aggregationType === "sum";
}

/**
 * Get a friendly name for a metric type (strips HK prefix)
 */
export function getMetricDisplayName(metricType: string): string {
  // Remove HK prefix and convert to readable format
  let name = metricType
    .replace("HKQuantityTypeIdentifier", "")
    .replace("HKCategoryTypeIdentifier", "");

  // Add spaces before capitals
  name = name.replace(/([A-Z])/g, " $1").trim();

  return name;
}

/**
 * Normalize metric type to a short key for Storj storage
 */
export function normalizeMetricKey(metricType: string): string {
  // Convert HKQuantityTypeIdentifierHeartRate -> heartRate
  let key = metricType
    .replace("HKQuantityTypeIdentifier", "")
    .replace("HKCategoryTypeIdentifier", "");

  // camelCase the result
  return key.charAt(0).toLowerCase() + key.slice(1);
}
