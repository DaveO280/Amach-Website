import {
  HealthDataResults,
  HealthMetric,
  MetricType,
  SUPPORTED_METRICS,
  SleepStage,
} from "../types/healthMetrics";

export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export class HealthDataValidator {
  static validateMetric(metric: HealthMetric): void {
    // Validate required fields
    if (
      !metric.startDate ||
      !metric.endDate ||
      !metric.value ||
      !metric.unit ||
      !metric.type
    ) {
      throw new ValidationError("Missing required fields in metric");
    }

    // Validate date format
    const startDate = new Date(metric.startDate);
    const endDate = new Date(metric.endDate);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new ValidationError("Invalid date format");
    }

    // Validate date range
    if (startDate > endDate) {
      throw new ValidationError("Start date must be before end date");
    }

    // Validate metric type
    if (!SUPPORTED_METRICS[metric.type as MetricType]) {
      throw new ValidationError(`Unsupported metric type: ${metric.type}`);
    }

    // Validate unit matches metric type
    const expectedUnit = SUPPORTED_METRICS[metric.type as MetricType].unit;
    if (metric.unit !== expectedUnit) {
      throw new ValidationError(
        `Invalid unit for ${metric.type}: expected ${expectedUnit}, got ${metric.unit}`,
      );
    }

    // Validate value format
    if (metric.type === "HKCategoryTypeIdentifierSleepAnalysis") {
      const validSleepStages: SleepStage[] = [
        "inBed",
        "core",
        "deep",
        "rem",
        "awake",
      ];
      if (!validSleepStages.includes(metric.value as SleepStage)) {
        throw new ValidationError(
          `Invalid sleep value: must be one of ${validSleepStages.join(", ")}`,
        );
      }
    } else {
      const numValue = Number(metric.value);
      if (isNaN(numValue)) {
        throw new ValidationError("Invalid numeric value");
      }
    }
  }

  static validateResults(results: HealthDataResults): void {
    if (!results || typeof results !== "object") {
      throw new ValidationError("Invalid results format");
    }

    for (const [metricType, metrics] of Object.entries(results)) {
      if (!Array.isArray(metrics)) {
        throw new ValidationError(
          `Invalid format for ${metricType}: expected array`,
        );
      }

      metrics.forEach((metric, index) => {
        try {
          this.validateMetric(metric);
        } catch (error) {
          if (error instanceof ValidationError) {
            throw new ValidationError(
              `Error in ${metricType}[${index}]: ${error.message}`,
              `${metricType}[${index}]`,
            );
          }
          throw error;
        }
      });
    }
  }

  static validateMetricData(
    metricType: MetricType,
    data: HealthMetric[],
  ): void {
    if (!Array.isArray(data)) {
      throw new ValidationError("Data must be an array");
    }

    data.forEach((metric, index) => {
      try {
        this.validateMetric(metric);
        if (metric.type !== metricType) {
          throw new ValidationError(
            `Metric type mismatch: expected ${metricType}, got ${metric.type}`,
          );
        }
      } catch (error) {
        if (error instanceof ValidationError) {
          throw new ValidationError(
            `Error in metric[${index}]: ${error.message}`,
            `metric[${index}]`,
          );
        }
        throw error;
      }
    });
  }
}
