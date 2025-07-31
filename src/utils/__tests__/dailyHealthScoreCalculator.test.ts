import type { HealthDataResults } from "../../data/types/healthMetrics";
import { calculateDailyHealthScores } from "../dailyHealthScoreCalculator";

describe("Daily Health Score Calculator", () => {
  it("should calculate daily health scores for sample data", () => {
    const sampleHealthData: HealthDataResults = {
      HKQuantityTypeIdentifierStepCount: [
        {
          startDate: "2024-01-01T00:00:00Z",
          endDate: "2024-01-01T23:59:59Z",
          value: "8500",
          unit: "count",
          source: "watch",
          type: "HKQuantityTypeIdentifierStepCount",
        },
        {
          startDate: "2024-01-02T00:00:00Z",
          endDate: "2024-01-02T23:59:59Z",
          value: "12000",
          unit: "count",
          source: "watch",
          type: "HKQuantityTypeIdentifierStepCount",
        },
      ],
      HKQuantityTypeIdentifierAppleExerciseTime: [
        {
          startDate: "2024-01-01T00:00:00Z",
          endDate: "2024-01-01T23:59:59Z",
          value: "45",
          unit: "min",
          source: "watch",
          type: "HKQuantityTypeIdentifierAppleExerciseTime",
        },
        {
          startDate: "2024-01-02T00:00:00Z",
          endDate: "2024-01-02T23:59:59Z",
          value: "60",
          unit: "min",
          source: "watch",
          type: "HKQuantityTypeIdentifierAppleExerciseTime",
        },
      ],
      HKQuantityTypeIdentifierHeartRate: [
        {
          startDate: "2024-01-01T00:00:00Z",
          endDate: "2024-01-01T23:59:59Z",
          value: "72",
          unit: "bpm",
          source: "watch",
          type: "HKQuantityTypeIdentifierHeartRate",
        },
        {
          startDate: "2024-01-02T00:00:00Z",
          endDate: "2024-01-02T23:59:59Z",
          value: "68",
          unit: "bpm",
          source: "watch",
          type: "HKQuantityTypeIdentifierHeartRate",
        },
      ],
      HKQuantityTypeIdentifierHeartRateVariabilitySDNN: [
        {
          startDate: "2024-01-01T00:00:00Z",
          endDate: "2024-01-01T23:59:59Z",
          value: "45",
          unit: "ms",
          source: "watch",
          type: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
        },
        {
          startDate: "2024-01-02T00:00:00Z",
          endDate: "2024-01-02T23:59:59Z",
          value: "52",
          unit: "ms",
          source: "watch",
          type: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
        },
      ],
      HKQuantityTypeIdentifierRestingHeartRate: [
        {
          startDate: "2024-01-01T00:00:00Z",
          endDate: "2024-01-01T23:59:59Z",
          value: "58",
          unit: "bpm",
          source: "watch",
          type: "HKQuantityTypeIdentifierRestingHeartRate",
        },
        {
          startDate: "2024-01-02T00:00:00Z",
          endDate: "2024-01-02T23:59:59Z",
          value: "55",
          unit: "bpm",
          source: "watch",
          type: "HKQuantityTypeIdentifierRestingHeartRate",
        },
      ],
      HKQuantityTypeIdentifierRespiratoryRate: [
        {
          startDate: "2024-01-01T00:00:00Z",
          endDate: "2024-01-01T23:59:59Z",
          value: "16",
          unit: "count/min",
          source: "watch",
          type: "HKQuantityTypeIdentifierRespiratoryRate",
        },
        {
          startDate: "2024-01-02T00:00:00Z",
          endDate: "2024-01-02T23:59:59Z",
          value: "15",
          unit: "count/min",
          source: "watch",
          type: "HKQuantityTypeIdentifierRespiratoryRate",
        },
      ],
      HKQuantityTypeIdentifierActiveEnergyBurned: [
        {
          startDate: "2024-01-01T00:00:00Z",
          endDate: "2024-01-01T23:59:59Z",
          value: "450",
          unit: "kcal",
          source: "watch",
          type: "HKQuantityTypeIdentifierActiveEnergyBurned",
        },
        {
          startDate: "2024-01-02T00:00:00Z",
          endDate: "2024-01-02T23:59:59Z",
          value: "600",
          unit: "kcal",
          source: "watch",
          type: "HKQuantityTypeIdentifierActiveEnergyBurned",
        },
      ],
      HKCategoryTypeIdentifierSleepAnalysis: [
        {
          startDate: "2024-01-01T00:00:00Z",
          endDate: "2024-01-01T08:00:00Z",
          value: "core",
          unit: "hr",
          source: "watch",
          type: "HKCategoryTypeIdentifierSleepAnalysis",
          duration: 8,
          quality: "good",
        },
        {
          startDate: "2024-01-02T00:00:00Z",
          endDate: "2024-01-02T07:30:00Z",
          value: "core",
          unit: "hr",
          source: "watch",
          type: "HKCategoryTypeIdentifierSleepAnalysis",
          duration: 7.5,
          quality: "excellent",
        },
      ],
    };

    const userProfile = {
      age: 35,
      sex: "male" as const,
      height: 175,
      weight: 75,
    };

    const dailyScores = calculateDailyHealthScores(
      sampleHealthData,
      userProfile,
    );

    // Verify the structure
    expect(dailyScores).toBeInstanceOf(Array);
    expect(dailyScores.length).toBe(2); // Two days of data

    // Verify each day has scores
    dailyScores.forEach((dayScore) => {
      expect(dayScore).toHaveProperty("date");
      expect(dayScore).toHaveProperty("scores");
      expect(dayScore.scores).toBeInstanceOf(Array);
      expect(dayScore.scores.length).toBe(5); // 5 score types: overall, activity, sleep, heart, energy

      // Verify each score has the required properties
      dayScore.scores.forEach((score) => {
        expect(score).toHaveProperty("type");
        expect(score).toHaveProperty("value");
        expect(score).toHaveProperty("date");
        expect(typeof score.value).toBe("number");
        expect(score.value).toBeGreaterThanOrEqual(0);
        expect(score.value).toBeLessThanOrEqual(100);
      });

      // Verify score types
      const scoreTypes = dayScore.scores.map((s) => s.type);
      expect(scoreTypes).toContain("overall");
      expect(scoreTypes).toContain("activity");
      expect(scoreTypes).toContain("sleep");
      expect(scoreTypes).toContain("heart");
      expect(scoreTypes).toContain("energy");
    });

    // Verify dates are sorted
    const dates = dailyScores.map((d) => d.date);
    expect(dates).toEqual([...dates].sort());
  });

  it("should handle empty health data", () => {
    const emptyHealthData: HealthDataResults = {};
    const dailyScores = calculateDailyHealthScores(emptyHealthData);
    expect(dailyScores).toEqual([]);
  });

  it("should handle missing user profile with defaults", () => {
    const minimalHealthData: HealthDataResults = {
      HKQuantityTypeIdentifierStepCount: [
        {
          startDate: "2024-01-01T00:00:00Z",
          endDate: "2024-01-01T23:59:59Z",
          value: "10000",
          unit: "count",
          source: "watch",
          type: "HKQuantityTypeIdentifierStepCount",
        },
      ],
    };

    const dailyScores = calculateDailyHealthScores(minimalHealthData);
    expect(dailyScores.length).toBe(1);
    expect(dailyScores[0].scores.length).toBe(5);
  });
});
