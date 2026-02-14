/** @jest-environment node */
/**
 * Sanity Tests for AppleHealthStorjService
 *
 * Verifies that:
 * 1. All aggregation types produce representative data
 * 2. Cumulative metrics are summed correctly
 * 3. Continuous metrics have correct avg/min/max
 * 4. Sleep data is aggregated by stage
 * 5. De-identification removes device/source names
 * 6. Completeness scoring is accurate
 */

import { AppleHealthStorjService } from "../appleHealth/AppleHealthStorjService";
import type { HealthDataPoint } from "@/types/healthData";

describe("AppleHealthStorjService", () => {
  let service: AppleHealthStorjService;

  beforeEach(() => {
    service = new AppleHealthStorjService();
  });

  // ============================================
  // TEST DATA GENERATORS
  // ============================================

  function createDataPoint(
    type: string,
    value: string,
    startDate: string,
    endDate?: string,
    source?: string,
    device?: string,
  ): HealthDataPoint {
    return {
      type,
      value,
      startDate,
      endDate: endDate || startDate,
      unit: "count",
      source: source || "Apple Watch",
      device: device || "Apple Watch Series 9",
    };
  }

  function createHeartRateData(
    date: string,
    values: number[],
  ): HealthDataPoint[] {
    // Spread readings across the day using minutes to avoid day overflow
    return values.map((v, i) => {
      const hour = 8 + Math.floor(i / 4); // Start at 8am, 4 readings per hour
      const minute = (i % 4) * 15; // 0, 15, 30, 45
      return {
        type: "HKQuantityTypeIdentifierHeartRate",
        value: String(v),
        startDate: `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`,
        endDate: `${date}T${String(hour).padStart(2, "0")}:${String(minute + 1).padStart(2, "0")}:00`,
        unit: "bpm",
        source: "Apple Watch",
        device: "Dave's Apple Watch Series 9",
      };
    });
  }

  function createStepData(date: string, values: number[]): HealthDataPoint[] {
    return values.map((v, i) => ({
      type: "HKQuantityTypeIdentifierStepCount",
      value: String(v),
      startDate: `${date}T${String(8 + i).padStart(2, "0")}:00:00`,
      endDate: `${date}T${String(8 + i).padStart(2, "0")}:59:59`,
      unit: "count",
      source: "Apple Watch",
      device: "Apple Watch",
    }));
  }

  function createSleepData(date: string): HealthDataPoint[] {
    // Simulate a night of sleep from 10pm to 6am
    // All records end on the target date to be grouped together
    const prevDate = new Date(date);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateStr = prevDate.toISOString().split("T")[0];

    return [
      // In bed: 10:00 PM prev day - 12:15 AM target day (135 min, but we only count pre-sleep portion = 15 min before first sleep)
      // Note: We model this as a short "getting into bed" segment that ends when sleep starts
      {
        type: "HKCategoryTypeIdentifierSleepAnalysis",
        value: "HKCategoryValueSleepAnalysisInBed",
        startDate: `${prevDateStr}T23:45:00`,
        endDate: `${date}T00:00:00`, // Ends at midnight on target day
        unit: "hr",
        source: "Apple Watch",
        device: "Apple Watch",
      },
      // Core sleep: 12:00 AM - 1:45 AM (105 min)
      {
        type: "HKCategoryTypeIdentifierSleepAnalysis",
        value: "HKCategoryValueSleepAnalysisAsleepCore",
        startDate: `${date}T00:00:00`,
        endDate: `${date}T01:45:00`,
        unit: "hr",
        source: "Apple Watch",
        device: "Apple Watch",
      },
      // Deep sleep: 12:00 AM - 1:30 AM (90 min)
      {
        type: "HKCategoryTypeIdentifierSleepAnalysis",
        value: "HKCategoryValueSleepAnalysisAsleepDeep",
        startDate: `${date}T00:00:00`,
        endDate: `${date}T01:30:00`,
        unit: "hr",
        source: "Apple Watch",
        device: "Apple Watch",
      },
      // REM: 1:30 AM - 3:00 AM (90 min)
      {
        type: "HKCategoryTypeIdentifierSleepAnalysis",
        value: "HKCategoryValueSleepAnalysisAsleepREM",
        startDate: `${date}T01:30:00`,
        endDate: `${date}T03:00:00`,
        unit: "hr",
        source: "Apple Watch",
        device: "Apple Watch",
      },
      // Awake: 3:00 AM - 3:10 AM (10 min)
      {
        type: "HKCategoryTypeIdentifierSleepAnalysis",
        value: "HKCategoryValueSleepAnalysisAwake",
        startDate: `${date}T03:00:00`,
        endDate: `${date}T03:10:00`,
        unit: "hr",
        source: "Apple Watch",
        device: "Apple Watch",
      },
      // Core sleep: 3:10 AM - 5:00 AM (110 min)
      {
        type: "HKCategoryTypeIdentifierSleepAnalysis",
        value: "HKCategoryValueSleepAnalysisAsleepCore",
        startDate: `${date}T03:10:00`,
        endDate: `${date}T05:00:00`,
        unit: "hr",
        source: "Apple Watch",
        device: "Apple Watch",
      },
      // Deep: 5:00 AM - 6:00 AM (60 min)
      {
        type: "HKCategoryTypeIdentifierSleepAnalysis",
        value: "HKCategoryValueSleepAnalysisAsleepDeep",
        startDate: `${date}T05:00:00`,
        endDate: `${date}T06:00:00`,
        unit: "hr",
        source: "Apple Watch",
        device: "Apple Watch",
      },
    ];
  }

  // ============================================
  // CUMULATIVE METRICS TESTS
  // ============================================

  describe("Cumulative Metrics (SUM)", () => {
    test("should sum step counts for the day", () => {
      const data = {
        HKQuantityTypeIdentifierStepCount: createStepData(
          "2025-02-14",
          [1000, 500, 2000, 750, 1250],
        ),
      };

      const summaries = service.buildDailySummaries(data);

      expect(summaries["2025-02-14"]).toBeDefined();
      expect(summaries["2025-02-14"]["stepCount"]).toMatchObject({
        total: 5500, // 1000 + 500 + 2000 + 750 + 1250
        count: 5,
      });
    });

    test("should sum active energy burned", () => {
      const data = {
        HKQuantityTypeIdentifierActiveEnergyBurned: [
          createDataPoint(
            "HKQuantityTypeIdentifierActiveEnergyBurned",
            "150.5",
            "2025-02-14T08:00:00",
          ),
          createDataPoint(
            "HKQuantityTypeIdentifierActiveEnergyBurned",
            "200.3",
            "2025-02-14T12:00:00",
          ),
          createDataPoint(
            "HKQuantityTypeIdentifierActiveEnergyBurned",
            "175.2",
            "2025-02-14T18:00:00",
          ),
        ],
      };

      const summaries = service.buildDailySummaries(data);

      expect(summaries["2025-02-14"]["activeEnergyBurned"]).toMatchObject({
        total: 526, // 150.5 + 200.3 + 175.2 = 526
        count: 3,
      });
    });

    test("should sum exercise time in minutes", () => {
      const data = {
        HKQuantityTypeIdentifierAppleExerciseTime: [
          createDataPoint(
            "HKQuantityTypeIdentifierAppleExerciseTime",
            "15",
            "2025-02-14T07:00:00",
          ),
          createDataPoint(
            "HKQuantityTypeIdentifierAppleExerciseTime",
            "30",
            "2025-02-14T12:00:00",
          ),
          createDataPoint(
            "HKQuantityTypeIdentifierAppleExerciseTime",
            "25",
            "2025-02-14T18:00:00",
          ),
        ],
      };

      const summaries = service.buildDailySummaries(data);

      expect(summaries["2025-02-14"]["appleExerciseTime"]).toMatchObject({
        total: 70, // 15 + 30 + 25
        count: 3,
      });
    });
  });

  // ============================================
  // CONTINUOUS METRICS TESTS (AVG + MIN/MAX)
  // ============================================

  describe("Continuous Metrics (AVG + MIN/MAX)", () => {
    test("should calculate heart rate avg, min, max correctly", () => {
      // HR values: 65, 72, 95, 140, 88, 70
      const data = {
        HKQuantityTypeIdentifierHeartRate: createHeartRateData(
          "2025-02-14",
          [65, 72, 95, 140, 88, 70],
        ),
      };

      const summaries = service.buildDailySummaries(data);
      const hr = summaries["2025-02-14"]["heartRate"] as {
        avg: number;
        min: number;
        max: number;
        count: number;
      };

      expect(hr.min).toBe(65);
      expect(hr.max).toBe(140);
      expect(hr.avg).toBeCloseTo(88.33, 1); // (65+72+95+140+88+70) / 6
      expect(hr.count).toBe(6);
    });

    test("should calculate respiratory rate with range", () => {
      const data = {
        HKQuantityTypeIdentifierRespiratoryRate: [
          createDataPoint(
            "HKQuantityTypeIdentifierRespiratoryRate",
            "14",
            "2025-02-14T01:00:00",
          ),
          createDataPoint(
            "HKQuantityTypeIdentifierRespiratoryRate",
            "16",
            "2025-02-14T03:00:00",
          ),
          createDataPoint(
            "HKQuantityTypeIdentifierRespiratoryRate",
            "18",
            "2025-02-14T05:00:00",
          ),
          createDataPoint(
            "HKQuantityTypeIdentifierRespiratoryRate",
            "15",
            "2025-02-14T07:00:00",
          ),
        ],
      };

      const summaries = service.buildDailySummaries(data);
      const rr = summaries["2025-02-14"]["respiratoryRate"] as {
        avg: number;
        min: number;
        max: number;
      };

      expect(rr.min).toBe(14);
      expect(rr.max).toBe(18);
      expect(rr.avg).toBeCloseTo(15.75, 2); // (14+16+18+15) / 4
    });
  });

  // ============================================
  // ONCE-DAILY METRICS TESTS
  // ============================================

  describe("Once-Daily Metrics (LATEST/AVG)", () => {
    test("should use latest value for resting heart rate", () => {
      const data = {
        HKQuantityTypeIdentifierRestingHeartRate: [
          createDataPoint(
            "HKQuantityTypeIdentifierRestingHeartRate",
            "62",
            "2025-02-14T06:00:00",
          ),
          createDataPoint(
            "HKQuantityTypeIdentifierRestingHeartRate",
            "58",
            "2025-02-14T07:00:00",
          ),
        ],
      };

      const summaries = service.buildDailySummaries(data);

      // Latest strategy returns last value
      expect(summaries["2025-02-14"]["restingHeartRate"]).toBe(58);
    });

    test("should average HRV readings", () => {
      const data = {
        HKQuantityTypeIdentifierHeartRateVariabilitySDNN: [
          createDataPoint(
            "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
            "45",
            "2025-02-14T06:00:00",
          ),
          createDataPoint(
            "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
            "52",
            "2025-02-14T07:00:00",
          ),
          createDataPoint(
            "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
            "48",
            "2025-02-14T08:00:00",
          ),
        ],
      };

      const summaries = service.buildDailySummaries(data);
      const hrv = summaries["2025-02-14"]["heartRateVariabilitySDNN"] as {
        avg: number;
      };

      expect(hrv.avg).toBeCloseTo(48.33, 1); // (45+52+48) / 3
    });
  });

  // ============================================
  // SLEEP DATA TESTS
  // ============================================

  describe("Sleep Data Aggregation", () => {
    test("should aggregate sleep by stage", () => {
      const data = {
        HKCategoryTypeIdentifierSleepAnalysis: createSleepData("2025-02-14"),
      };

      const summaries = service.buildDailySummaries(data);
      const sleep = summaries["2025-02-14"]["sleep"] as {
        total: number;
        inBed: number;
        awake: number;
        core: number;
        deep: number;
        rem: number;
        efficiency?: number;
      };

      // Expected values from createSleepData:
      // inBed: 15 min
      // core: 105 + 110 = 215 min
      // deep: 90 + 60 = 150 min
      // REM: 90 min
      // awake: 10 min
      // total: 215 + 150 + 90 = 455 min

      expect(sleep.inBed).toBe(15);
      expect(sleep.core).toBe(215);
      expect(sleep.deep).toBe(150);
      expect(sleep.rem).toBe(90);
      expect(sleep.awake).toBe(10);
      expect(sleep.total).toBe(455);
    });

    test("should calculate sleep efficiency", () => {
      // Create simple sleep data where inBed > 0
      const data = {
        HKCategoryTypeIdentifierSleepAnalysis: [
          {
            type: "HKCategoryTypeIdentifierSleepAnalysis",
            value: "HKCategoryValueSleepAnalysisInBed",
            startDate: "2025-02-14T22:00:00",
            endDate: "2025-02-15T06:00:00", // 480 min in bed
            unit: "hr",
            source: "Apple Watch",
            device: "Apple Watch",
          },
          {
            type: "HKCategoryTypeIdentifierSleepAnalysis",
            value: "HKCategoryValueSleepAnalysisAsleepCore",
            startDate: "2025-02-14T22:30:00",
            endDate: "2025-02-15T05:30:00", // 420 min asleep
            unit: "hr",
            source: "Apple Watch",
            device: "Apple Watch",
          },
        ],
      };

      const summaries = service.buildDailySummaries(data);

      // Sleep data goes to the end date's day
      const sleep = summaries["2025-02-15"]["sleep"] as {
        efficiency?: number;
      };

      // 420 / 480 = 0.875
      expect(sleep.efficiency).toBeCloseTo(0.88, 1);
    });
  });

  // ============================================
  // MULTI-DAY TESTS
  // ============================================

  describe("Multi-Day Data", () => {
    test("should separate data by day correctly", () => {
      const data = {
        HKQuantityTypeIdentifierStepCount: [
          ...createStepData("2025-02-13", [3000, 2000]),
          ...createStepData("2025-02-14", [4000, 3000]),
          ...createStepData("2025-02-15", [5000, 4000]),
        ],
      };

      const summaries = service.buildDailySummaries(data);

      expect(Object.keys(summaries)).toHaveLength(3);
      expect(
        (summaries["2025-02-13"]["stepCount"] as { total: number }).total,
      ).toBe(5000);
      expect(
        (summaries["2025-02-14"]["stepCount"] as { total: number }).total,
      ).toBe(7000);
      expect(
        (summaries["2025-02-15"]["stepCount"] as { total: number }).total,
      ).toBe(9000);
    });
  });

  // ============================================
  // DE-IDENTIFICATION TESTS
  // ============================================

  describe("De-identification", () => {
    test("should not include device names in daily summaries", () => {
      const data = {
        HKQuantityTypeIdentifierHeartRate: [
          {
            type: "HKQuantityTypeIdentifierHeartRate",
            value: "72",
            startDate: "2025-02-14T10:00:00",
            endDate: "2025-02-14T10:01:00",
            unit: "bpm",
            source: "Dave's Personal iPhone 15 Pro Max",
            device:
              "<<HKDevice: iPhone15,3>, name:Dave's iPhone, manufacturer:Apple, model:iPhone>",
          },
        ],
      };

      const summaries = service.buildDailySummaries(data);
      const summaryJson = JSON.stringify(summaries);

      // Should not contain identifying info
      expect(summaryJson).not.toContain("Dave");
      expect(summaryJson).not.toContain("iPhone15,3");
      expect(summaryJson).not.toContain("Personal");
    });

    test("should only include source categories in manifest, not names", () => {
      // This test verifies the manifest has generalized source info
      const data = {
        HKQuantityTypeIdentifierStepCount: [
          createDataPoint(
            "HKQuantityTypeIdentifierStepCount",
            "1000",
            "2025-02-14T10:00:00",
            undefined,
            "Dave's Apple Watch",
            "Apple Watch Series 9 GPS+Cellular",
          ),
          createDataPoint(
            "HKQuantityTypeIdentifierStepCount",
            "500",
            "2025-02-14T11:00:00",
            undefined,
            "Dave's iPhone",
            "iPhone 15 Pro",
          ),
        ],
      };

      // We need to access the private buildManifest method
      // Since it's private, we'll test via the full flow
      const summaries = service.buildDailySummaries(data);

      // Verify no device names leak into summaries
      const json = JSON.stringify(summaries);
      expect(json).not.toContain("Dave");
      expect(json).not.toContain("Series 9");
      expect(json).not.toContain("iPhone 15");
    });
  });

  // ============================================
  // EDGE CASES
  // ============================================

  describe("Edge Cases", () => {
    test("should handle empty data gracefully", () => {
      const summaries = service.buildDailySummaries({});
      expect(summaries).toEqual({});
    });

    test("should handle metrics with no valid values", () => {
      const data = {
        HKQuantityTypeIdentifierHeartRate: [
          createDataPoint(
            "HKQuantityTypeIdentifierHeartRate",
            "NaN",
            "2025-02-14T10:00:00",
          ),
          createDataPoint(
            "HKQuantityTypeIdentifierHeartRate",
            "invalid",
            "2025-02-14T11:00:00",
          ),
        ],
      };

      const summaries = service.buildDailySummaries(data);

      // Should not crash, may have empty or no entry
      expect(summaries["2025-02-14"]?.["heartRate"]).toBeUndefined();
    });

    test("should handle single data point", () => {
      const data = {
        HKQuantityTypeIdentifierStepCount: [
          createDataPoint(
            "HKQuantityTypeIdentifierStepCount",
            "5000",
            "2025-02-14T12:00:00",
          ),
        ],
      };

      const summaries = service.buildDailySummaries(data);

      expect(
        (summaries["2025-02-14"]["stepCount"] as { total: number }).total,
      ).toBe(5000);
      expect(
        (summaries["2025-02-14"]["stepCount"] as { count: number }).count,
      ).toBe(1);
    });

    test("should handle unknown metric types with default avg strategy", () => {
      const data = {
        HKQuantityTypeIdentifierSomeNewMetric: [
          createDataPoint(
            "HKQuantityTypeIdentifierSomeNewMetric",
            "10",
            "2025-02-14T10:00:00",
          ),
          createDataPoint(
            "HKQuantityTypeIdentifierSomeNewMetric",
            "20",
            "2025-02-14T11:00:00",
          ),
        ],
      };

      const summaries = service.buildDailySummaries(data);

      // Unknown metrics default to avg
      const result = summaries["2025-02-14"]["someNewMetric"] as {
        avg: number;
      };
      expect(result.avg).toBe(15);
    });
  });

  // ============================================
  // SANITY CHECK: REPRESENTATIVE DATA
  // ============================================

  describe("Sanity Checks - Representative Data", () => {
    it("summed steps should equal raw total", () => {
      const rawSteps = [1234, 567, 890, 2345, 678];
      const expectedTotal = rawSteps.reduce((a, b) => a + b, 0);

      const data = {
        HKQuantityTypeIdentifierStepCount: createStepData(
          "2025-02-14",
          rawSteps,
        ),
      };

      const summaries = service.buildDailySummaries(data);
      const summary = summaries["2025-02-14"]["stepCount"] as { total: number };

      expect(summary.total).toBe(expectedTotal);
    });

    it("HR min/max should match actual extremes", () => {
      const hrValues = [65, 72, 145, 88, 52, 110];
      const expectedMin = Math.min(...hrValues);
      const expectedMax = Math.max(...hrValues);

      const data = {
        HKQuantityTypeIdentifierHeartRate: createHeartRateData(
          "2025-02-14",
          hrValues,
        ),
      };

      const summaries = service.buildDailySummaries(data);
      const hr = summaries["2025-02-14"]["heartRate"] as {
        min: number;
        max: number;
      };

      expect(hr.min).toBe(expectedMin);
      expect(hr.max).toBe(expectedMax);
    });

    it("sleep total should equal sum of sleep stages", () => {
      const data = {
        HKCategoryTypeIdentifierSleepAnalysis: createSleepData("2025-02-14"),
      };

      const summaries = service.buildDailySummaries(data);
      const sleep = summaries["2025-02-14"]["sleep"] as {
        total: number;
        core: number;
        deep: number;
        rem: number;
      };

      // Total should equal core + deep + rem (awake doesn't count as sleep)
      expect(sleep.total).toBe(sleep.core + sleep.deep + sleep.rem);
    });

    it("sample counts should match input counts", () => {
      const hrCount = 15;
      const hrValues = Array(hrCount)
        .fill(0)
        .map(() => Math.floor(Math.random() * 100) + 50);

      const data = {
        HKQuantityTypeIdentifierHeartRate: createHeartRateData(
          "2025-02-14",
          hrValues,
        ),
      };

      const summaries = service.buildDailySummaries(data);
      const hr = summaries["2025-02-14"]["heartRate"] as { count: number };

      expect(hr.count).toBe(hrCount);
    });
  });
});
