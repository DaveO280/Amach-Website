/** @jest-environment node */
/**
 * Deduplication Behavior Tests
 *
 * These tests capture the CURRENT behavior of the deduplication system
 * BEFORE any refactoring. They serve as a safety net to ensure we don't
 * break existing functionality during consolidation.
 *
 * Test categories:
 * 1. dataDeduplicator - multi-device handling (watch vs phone)
 * 2. dataDeduplicator - cumulative metrics (steps, exercise)
 * 3. dataDeduplicator - non-cumulative metrics (HR, HRV)
 * 4. HealthDataProcessor - daily aggregation
 * 5. Integration - full pipeline behavior
 */

import {
  deduplicateData,
  deduplicateCumulativeData,
  deduplicateHeartRateData,
  isWatchData,
  isCumulativeMetric,
  extractDatePart,
  extractHour,
} from "@/utils/dataDeduplicator";
import {
  aggregateSamplesByDay,
  aggregateDailyValues,
  isCumulativeMetric as isCumulativeMetricAggregation,
} from "@/utils/tieredDataAggregation";
import type { HealthDataPoint } from "@/types/healthData";
import type { MetricSample } from "@/agents/types";

// =============================================================================
// Helper Functions
// =============================================================================

function createHealthDataPoint(
  startDate: string,
  value: string,
  overrides: Partial<HealthDataPoint> = {},
): HealthDataPoint {
  return {
    startDate,
    endDate: startDate,
    value,
    unit: "count",
    source: "Apple Watch",
    device: "Apple Watch",
    type: "HKQuantityTypeIdentifierStepCount",
    ...overrides,
  };
}

function createWatchRecord(
  startDate: string,
  value: string,
  type: string = "HKQuantityTypeIdentifierStepCount",
): HealthDataPoint {
  return createHealthDataPoint(startDate, value, {
    source: "Apple Watch",
    device: "Apple Watch Series 9",
    type,
  });
}

function createPhoneRecord(
  startDate: string,
  value: string,
  type: string = "HKQuantityTypeIdentifierStepCount",
): HealthDataPoint {
  return createHealthDataPoint(startDate, value, {
    source: "iPhone",
    device: "iPhone 15 Pro",
    type,
  });
}

function createMetricSample(
  timestamp: Date,
  value: number,
  unit: string = "count",
): MetricSample {
  return {
    timestamp,
    value,
    unit,
  };
}

// =============================================================================
// 1. Device Detection Tests
// =============================================================================

describe("Device Detection (isWatchData)", () => {
  test("identifies Apple Watch from device field", () => {
    const record = createWatchRecord("2024-01-15T10:00:00Z", "100");
    expect(isWatchData(record)).toBe(true);
  });

  test("identifies iPhone as non-watch from device field", () => {
    const record = createPhoneRecord("2024-01-15T10:00:00Z", "100");
    expect(isWatchData(record)).toBe(false);
  });

  test("identifies watch from source field when device is empty", () => {
    const record = createHealthDataPoint("2024-01-15T10:00:00Z", "100", {
      device: "",
      source: "Apple Watch",
    });
    expect(isWatchData(record)).toBe(true);
  });

  test("returns false for unknown device", () => {
    const record = createHealthDataPoint("2024-01-15T10:00:00Z", "100", {
      device: "",
      source: "Some App",
    });
    expect(isWatchData(record)).toBe(false);
  });
});

// =============================================================================
// 2. Date/Time Extraction Tests
// =============================================================================

describe("Date/Time Extraction", () => {
  test("extractDatePart returns YYYY-MM-DD format", () => {
    expect(extractDatePart("2024-01-15T10:30:00Z")).toBe("2024-01-15");
    expect(extractDatePart("2024-01-15T23:59:59Z")).toBe("2024-01-15");
  });

  test("extractHour returns hour from timestamp", () => {
    // Note: This will be affected by timezone
    const date = new Date("2024-01-15T10:30:00Z");
    const expectedHour = date.getHours();
    expect(extractHour("2024-01-15T10:30:00Z")).toBe(expectedHour);
  });
});

// =============================================================================
// 3. Cumulative Metric Detection Tests
// =============================================================================

describe("Cumulative Metric Detection", () => {
  test("identifies step count as cumulative", () => {
    expect(isCumulativeMetric("HKQuantityTypeIdentifierStepCount")).toBe(true);
  });

  test("identifies active energy as cumulative", () => {
    expect(
      isCumulativeMetric("HKQuantityTypeIdentifierActiveEnergyBurned"),
    ).toBe(true);
  });

  test("identifies exercise time as cumulative", () => {
    expect(
      isCumulativeMetric("HKQuantityTypeIdentifierAppleExerciseTime"),
    ).toBe(true);
  });

  test("identifies heart rate as non-cumulative", () => {
    expect(isCumulativeMetric("HKQuantityTypeIdentifierHeartRate")).toBe(false);
  });

  test("identifies HRV as non-cumulative", () => {
    expect(
      isCumulativeMetric("HKQuantityTypeIdentifierHeartRateVariabilitySDNN"),
    ).toBe(false);
  });

  // Also test the aggregation module's version
  test("aggregation module agrees on cumulative metrics", () => {
    expect(
      isCumulativeMetricAggregation("HKQuantityTypeIdentifierStepCount"),
    ).toBe(true);
    expect(
      isCumulativeMetricAggregation("HKQuantityTypeIdentifierHeartRate"),
    ).toBe(false);
  });
});

// =============================================================================
// 4. Multi-Device Deduplication Tests (Watch Priority)
// =============================================================================

describe("Multi-Device Deduplication - Watch Priority", () => {
  test("prefers watch data over phone data for same hour", () => {
    const data: HealthDataPoint[] = [
      createWatchRecord("2024-01-15T10:00:00Z", "500"),
      createPhoneRecord("2024-01-15T10:30:00Z", "600"),
    ];

    const result = deduplicateCumulativeData(
      data,
      "HKQuantityTypeIdentifierStepCount",
    );

    // Should only have watch data
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe("500");
    expect(result[0].device).toContain("Watch");
  });

  test("uses phone data when no watch data exists for that hour", () => {
    const data: HealthDataPoint[] = [
      createPhoneRecord("2024-01-15T10:00:00Z", "500"),
      createPhoneRecord("2024-01-15T10:30:00Z", "100"),
    ];

    const result = deduplicateCumulativeData(
      data,
      "HKQuantityTypeIdentifierStepCount",
    );

    // Should sum phone data for that hour
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe("600"); // 500 + 100
  });

  test("keeps separate hours separate", () => {
    const data: HealthDataPoint[] = [
      createWatchRecord("2024-01-15T10:00:00Z", "500"),
      createWatchRecord("2024-01-15T11:00:00Z", "600"),
    ];

    const result = deduplicateCumulativeData(
      data,
      "HKQuantityTypeIdentifierStepCount",
    );

    expect(result).toHaveLength(2);
  });

  test("sums multiple watch records within same hour for cumulative metrics", () => {
    const data: HealthDataPoint[] = [
      createWatchRecord("2024-01-15T10:00:00Z", "200"),
      createWatchRecord("2024-01-15T10:15:00Z", "150"),
      createWatchRecord("2024-01-15T10:30:00Z", "150"),
    ];

    const result = deduplicateCumulativeData(
      data,
      "HKQuantityTypeIdentifierStepCount",
    );

    expect(result).toHaveLength(1);
    expect(result[0].value).toBe("500"); // 200 + 150 + 150
  });
});

// =============================================================================
// 5. Cumulative Metric Deduplication Tests
// =============================================================================

describe("Cumulative Metric Deduplication (Steps, Exercise)", () => {
  test("sums step counts within hourly blocks", () => {
    const data: HealthDataPoint[] = [
      createWatchRecord("2024-01-15T10:00:00Z", "100"),
      createWatchRecord("2024-01-15T10:15:00Z", "200"),
      createWatchRecord("2024-01-15T10:45:00Z", "300"),
    ];

    const result = deduplicateCumulativeData(
      data,
      "HKQuantityTypeIdentifierStepCount",
    );

    expect(result).toHaveLength(1);
    expect(result[0].value).toBe("600"); // 100 + 200 + 300
  });

  test("handles multiple days correctly", () => {
    const data: HealthDataPoint[] = [
      createWatchRecord("2024-01-15T10:00:00Z", "1000"),
      createWatchRecord("2024-01-16T10:00:00Z", "2000"),
    ];

    const result = deduplicateCumulativeData(
      data,
      "HKQuantityTypeIdentifierStepCount",
    );

    expect(result).toHaveLength(2);
    const values = result.map((r) => r.value).sort();
    expect(values).toEqual(["1000", "2000"]);
  });

  test("handles exercise time as cumulative", () => {
    const data: HealthDataPoint[] = [
      createWatchRecord(
        "2024-01-15T10:00:00Z",
        "15",
        "HKQuantityTypeIdentifierAppleExerciseTime",
      ),
      createWatchRecord(
        "2024-01-15T10:30:00Z",
        "10",
        "HKQuantityTypeIdentifierAppleExerciseTime",
      ),
    ];

    const result = deduplicateCumulativeData(
      data,
      "HKQuantityTypeIdentifierAppleExerciseTime",
    );

    expect(result).toHaveLength(1);
    expect(result[0].value).toBe("25"); // 15 + 10
  });
});

// =============================================================================
// 6. Non-Cumulative Metric Deduplication Tests (Heart Rate)
// =============================================================================

describe("Heart Rate Deduplication", () => {
  test("keeps all watch heart rate data", () => {
    const data: HealthDataPoint[] = [
      createWatchRecord(
        "2024-01-15T10:00:00Z",
        "72",
        "HKQuantityTypeIdentifierHeartRate",
      ),
      createWatchRecord(
        "2024-01-15T10:01:00Z",
        "75",
        "HKQuantityTypeIdentifierHeartRate",
      ),
      createWatchRecord(
        "2024-01-15T10:02:00Z",
        "73",
        "HKQuantityTypeIdentifierHeartRate",
      ),
    ];

    const result = deduplicateHeartRateData(data);

    expect(result).toHaveLength(3); // All watch data kept
  });

  test("deduplicates phone heart rate data by minute", () => {
    const data: HealthDataPoint[] = [
      createPhoneRecord(
        "2024-01-15T10:00:00Z",
        "72",
        "HKQuantityTypeIdentifierHeartRate",
      ),
      createPhoneRecord(
        "2024-01-15T10:00:30Z",
        "75",
        "HKQuantityTypeIdentifierHeartRate",
      ),
      createPhoneRecord(
        "2024-01-15T10:01:00Z",
        "73",
        "HKQuantityTypeIdentifierHeartRate",
      ),
    ];

    const result = deduplicateHeartRateData(data);

    // Should dedupe to one per minute (2 unique minutes)
    expect(result).toHaveLength(2);
  });

  test("combines watch and deduplicated phone data", () => {
    const data: HealthDataPoint[] = [
      createWatchRecord(
        "2024-01-15T10:00:00Z",
        "72",
        "HKQuantityTypeIdentifierHeartRate",
      ),
      createPhoneRecord(
        "2024-01-15T10:00:00Z",
        "74",
        "HKQuantityTypeIdentifierHeartRate",
      ),
      createPhoneRecord(
        "2024-01-15T10:00:30Z",
        "76",
        "HKQuantityTypeIdentifierHeartRate",
      ),
    ];

    const result = deduplicateHeartRateData(data);

    // Watch: 1, Phone: deduplicated to 1 (same minute)
    expect(result).toHaveLength(2);
  });
});

// =============================================================================
// 7. Daily Aggregation Tests (tieredDataAggregation)
// =============================================================================

describe("Daily Aggregation (tieredDataAggregation)", () => {
  test("groups samples by day correctly", () => {
    const samples: MetricSample[] = [
      createMetricSample(new Date("2024-01-15T10:00:00Z"), 100),
      createMetricSample(new Date("2024-01-15T14:00:00Z"), 200),
      createMetricSample(new Date("2024-01-16T10:00:00Z"), 300),
    ];

    const dailyGroups = aggregateSamplesByDay(samples);

    expect(dailyGroups.size).toBe(2);
    expect(dailyGroups.get("2024-01-15")).toHaveLength(2);
    expect(dailyGroups.get("2024-01-16")).toHaveLength(1);
  });

  test("sums cumulative metrics within a day", () => {
    const samples: MetricSample[] = [
      createMetricSample(new Date("2024-01-15T10:00:00Z"), 1000),
      createMetricSample(new Date("2024-01-15T14:00:00Z"), 2000),
      createMetricSample(new Date("2024-01-15T18:00:00Z"), 3000),
    ];

    const dailyGroups = aggregateSamplesByDay(samples);
    const dailyAggregates = aggregateDailyValues(dailyGroups, true); // cumulative

    expect(dailyAggregates.size).toBe(1);
    expect(dailyAggregates.get("2024-01-15")?.value).toBe(6000); // 1000 + 2000 + 3000
  });

  test("averages non-cumulative metrics within a day", () => {
    const samples: MetricSample[] = [
      createMetricSample(new Date("2024-01-15T10:00:00Z"), 60),
      createMetricSample(new Date("2024-01-15T14:00:00Z"), 70),
      createMetricSample(new Date("2024-01-15T18:00:00Z"), 80),
    ];

    const dailyGroups = aggregateSamplesByDay(samples);
    const dailyAggregates = aggregateDailyValues(dailyGroups, false); // non-cumulative

    expect(dailyAggregates.size).toBe(1);
    expect(dailyAggregates.get("2024-01-15")?.value).toBe(70); // (60 + 70 + 80) / 3
  });

  test("includes metadata with aggregation info", () => {
    const samples: MetricSample[] = [
      createMetricSample(new Date("2024-01-15T10:00:00Z"), 100),
      createMetricSample(new Date("2024-01-15T14:00:00Z"), 200),
    ];

    const dailyGroups = aggregateSamplesByDay(samples);
    const dailyAggregates = aggregateDailyValues(dailyGroups, true);

    const aggregate = dailyAggregates.get("2024-01-15");
    expect(aggregate?.metadata?.sampleCount).toBe(2);
    expect(aggregate?.metadata?.aggregationType).toBe("sum");
    expect(aggregate?.metadata?.min).toBe(100);
    expect(aggregate?.metadata?.max).toBe(200);
  });
});

// =============================================================================
// 8. Integration Tests - Full deduplicateData Pipeline
// =============================================================================

describe("Integration: deduplicateData Pipeline", () => {
  test("handles step count through full pipeline", () => {
    const data: HealthDataPoint[] = [
      // Hour 10: Watch and phone data (watch should be preferred)
      createWatchRecord("2024-01-15T10:00:00Z", "500"),
      createPhoneRecord("2024-01-15T10:30:00Z", "600"),
      // Hour 11: Only watch data
      createWatchRecord("2024-01-15T11:00:00Z", "1000"),
      createWatchRecord("2024-01-15T11:30:00Z", "500"),
    ];

    const result = deduplicateData(data, "HKQuantityTypeIdentifierStepCount");

    expect(result).toHaveLength(2); // 2 hours

    // Find each hour's result
    const values = result.map((r) => r.value).sort();
    expect(values).toContain("500"); // Hour 10: just watch data
    expect(values).toContain("1500"); // Hour 11: watch summed (1000 + 500)
  });

  test("handles heart rate through full pipeline", () => {
    const data: HealthDataPoint[] = [
      createWatchRecord(
        "2024-01-15T10:00:00Z",
        "72",
        "HKQuantityTypeIdentifierHeartRate",
      ),
      createWatchRecord(
        "2024-01-15T10:01:00Z",
        "75",
        "HKQuantityTypeIdentifierHeartRate",
      ),
      createPhoneRecord(
        "2024-01-15T10:00:00Z",
        "70",
        "HKQuantityTypeIdentifierHeartRate",
      ),
    ];

    const result = deduplicateData(data, "HKQuantityTypeIdentifierHeartRate");

    // All watch data kept, phone deduplicated by minute
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  test("returns raw sleep data (processed separately)", () => {
    const data: HealthDataPoint[] = [
      createHealthDataPoint(
        "2024-01-15T22:00:00Z",
        "HKCategoryValueSleepAnalysisAsleepCore",
        {
          type: "HKCategoryTypeIdentifierSleepAnalysis",
          endDate: "2024-01-16T06:00:00Z",
        },
      ),
    ];

    const result = deduplicateData(
      data,
      "HKCategoryTypeIdentifierSleepAnalysis",
    );

    // Sleep data is returned as-is (processed by sleepDataProcessor separately)
    expect(result).toHaveLength(1);
  });
});

// =============================================================================
// 9. Edge Cases
// =============================================================================

describe("Edge Cases", () => {
  test("handles empty input", () => {
    expect(deduplicateData([], "HKQuantityTypeIdentifierStepCount")).toEqual(
      [],
    );
    expect(
      deduplicateCumulativeData([], "HKQuantityTypeIdentifierStepCount"),
    ).toEqual([]);
    expect(deduplicateHeartRateData([])).toEqual([]);
  });

  test("handles single record", () => {
    const data = [createWatchRecord("2024-01-15T10:00:00Z", "100")];
    const result = deduplicateCumulativeData(
      data,
      "HKQuantityTypeIdentifierStepCount",
    );

    expect(result).toHaveLength(1);
    expect(result[0].value).toBe("100");
  });

  test("handles records with missing values", () => {
    const data: HealthDataPoint[] = [
      createWatchRecord("2024-01-15T10:00:00Z", "100"),
      {
        ...createWatchRecord("2024-01-15T10:30:00Z", ""),
        value: undefined as unknown as string,
      },
    ];

    const result = deduplicateCumulativeData(
      data,
      "HKQuantityTypeIdentifierStepCount",
    );

    // Should only process valid records
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe("100");
  });

  test("handles records with invalid dates", () => {
    const data: HealthDataPoint[] = [
      createWatchRecord("2024-01-15T10:00:00Z", "100"),
      { ...createWatchRecord("invalid-date", "200"), startDate: "" },
    ];

    const result = deduplicateCumulativeData(
      data,
      "HKQuantityTypeIdentifierStepCount",
    );

    // Should skip invalid records
    expect(result).toHaveLength(1);
  });

  test("handles very large values", () => {
    const data: HealthDataPoint[] = [
      createWatchRecord("2024-01-15T10:00:00Z", "50000"),
      createWatchRecord("2024-01-15T10:30:00Z", "50000"),
    ];

    const result = deduplicateCumulativeData(
      data,
      "HKQuantityTypeIdentifierStepCount",
    );

    expect(result).toHaveLength(1);
    expect(result[0].value).toBe("100000");
  });
});

// =============================================================================
// 10. Behavioral Snapshots for Refactoring Safety
// =============================================================================

describe("Behavioral Snapshots", () => {
  /**
   * These tests capture specific behaviors that MUST be preserved during refactoring.
   * If any of these fail after changes, it indicates a regression.
   */

  test("SNAPSHOT: Watch priority over phone in same hour", () => {
    const data: HealthDataPoint[] = [
      createWatchRecord("2024-01-15T10:00:00Z", "1000"),
      createPhoneRecord("2024-01-15T10:15:00Z", "5000"), // Phone has more steps but should be ignored
    ];

    const result = deduplicateCumulativeData(
      data,
      "HKQuantityTypeIdentifierStepCount",
    );

    // CRITICAL: Watch data must be preferred even when phone shows higher value
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe("1000");
    expect(isWatchData(result[0])).toBe(true);
  });

  test("SNAPSHOT: Cumulative metrics sum within hour, not average", () => {
    const data: HealthDataPoint[] = [
      createWatchRecord("2024-01-15T10:00:00Z", "1000"),
      createWatchRecord("2024-01-15T10:15:00Z", "1000"),
      createWatchRecord("2024-01-15T10:30:00Z", "1000"),
      createWatchRecord("2024-01-15T10:45:00Z", "1000"),
    ];

    const result = deduplicateCumulativeData(
      data,
      "HKQuantityTypeIdentifierStepCount",
    );

    // CRITICAL: Must be sum (4000), not average (1000)
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe("4000");
  });

  test("SNAPSHOT: Heart rate keeps all watch samples (for zone calculation)", () => {
    const data: HealthDataPoint[] = [
      createWatchRecord(
        "2024-01-15T10:00:00Z",
        "120",
        "HKQuantityTypeIdentifierHeartRate",
      ),
      createWatchRecord(
        "2024-01-15T10:00:05Z",
        "125",
        "HKQuantityTypeIdentifierHeartRate",
      ),
      createWatchRecord(
        "2024-01-15T10:00:10Z",
        "130",
        "HKQuantityTypeIdentifierHeartRate",
      ),
    ];

    const result = deduplicateHeartRateData(data);

    // CRITICAL: All 3 samples must be kept for accurate zone calculations
    expect(result).toHaveLength(3);
  });

  test("SNAPSHOT: Daily aggregation sums cumulative metrics across hours", () => {
    const samples: MetricSample[] = [
      createMetricSample(new Date("2024-01-15T08:00:00Z"), 2000), // Morning
      createMetricSample(new Date("2024-01-15T12:00:00Z"), 3000), // Lunch
      createMetricSample(new Date("2024-01-15T18:00:00Z"), 5000), // Evening
    ];

    const dailyGroups = aggregateSamplesByDay(samples);
    const dailyAggregates = aggregateDailyValues(dailyGroups, true);

    // CRITICAL: Daily total must be 10000 (sum of all hours)
    expect(dailyAggregates.get("2024-01-15")?.value).toBe(10000);
  });
});
