/** @jest-environment node */

import { calculateDailyHealthScores } from "../dailyHealthScoreCalculator";
import type { HealthDataResults, MetricType } from "@/data/types/healthMetrics";

function metric(
  metricType: MetricType,
  startDate: string,
  value: string,
  unit?: string,
  endDate?: string,
): {
  type: MetricType;
  startDate: string;
  endDate: string;
  value: string;
  unit?: string;
  source: string;
  device: string;
} {
  return {
    type: metricType,
    startDate,
    endDate: endDate ?? startDate,
    value,
    unit,
    source: "Apple Health",
    device: "Apple Watch",
  };
}

describe("dailyHealthScoreCalculator - missing-data handling", () => {
  test("does not force overall=0 on days with activity but missing sleep", () => {
    const data = {
      HKQuantityTypeIdentifierStepCount: [
        metric(
          "HKQuantityTypeIdentifierStepCount",
          "2026-01-05T12:00:00.000Z",
          "8000",
          "count",
        ),
      ],
      // No sleep records for this day
    } as unknown as HealthDataResults;

    const daily = calculateDailyHealthScores(data, { age: 40, sex: "male" });
    expect(daily).toHaveLength(1);
    const overall = daily[0].scores.find((s) => s.type === "overall")?.value;
    expect(overall).toBeDefined();
    expect(overall).toBeGreaterThan(0);
  });

  test("includes sleep-only days in daily scores", () => {
    const data = {
      HKCategoryTypeIdentifierSleepAnalysis: [
        metric(
          "HKCategoryTypeIdentifierSleepAnalysis",
          "2026-01-04T23:00:00.000Z",
          "HKCategoryValueSleepAnalysisInBed",
          "hr",
          "2026-01-05T07:00:00.000Z",
        ),
        metric(
          "HKCategoryTypeIdentifierSleepAnalysis",
          "2026-01-05T00:00:00.000Z",
          "HKCategoryValueSleepAnalysisAsleepCore",
          "hr",
          "2026-01-05T03:00:00.000Z",
        ),
        metric(
          "HKCategoryTypeIdentifierSleepAnalysis",
          "2026-01-05T01:00:00.000Z",
          "HKCategoryValueSleepAnalysisAsleepCore",
          "hr",
          "2026-01-05T04:00:00.000Z",
        ),
      ],
    } as unknown as HealthDataResults;

    const daily = calculateDailyHealthScores(data, { age: 40, sex: "male" });
    expect(daily.length).toBeGreaterThan(0);
  });
});
