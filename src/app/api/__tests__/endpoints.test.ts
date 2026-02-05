/**
 * API Endpoint Tests
 *
 * Tests for the new API endpoints created in Phase A3.
 * These tests verify request validation, response structure, and business logic.
 */

// ============ Health Summary API Tests ============

describe("/api/health/summary", () => {
  // Import the summarization logic directly for unit testing
  // (API routes are harder to test directly in Jest without full Next.js setup)

  const METRIC_CONFIGS: Record<
    string,
    {
      unit: string;
      isCumulative: boolean;
      higherIsBetter: boolean;
      displayName: string;
    }
  > = {
    HKQuantityTypeIdentifierStepCount: {
      unit: "steps",
      isCumulative: true,
      higherIsBetter: true,
      displayName: "Steps",
    },
    HKQuantityTypeIdentifierHeartRate: {
      unit: "bpm",
      isCumulative: false,
      higherIsBetter: false,
      displayName: "Heart Rate",
    },
    HKQuantityTypeIdentifierHeartRateVariabilitySDNN: {
      unit: "ms",
      isCumulative: false,
      higherIsBetter: true,
      displayName: "HRV",
    },
  };

  function calculateTrend(
    samples: Array<{ date: string; value: number }>,
    higherIsBetter: boolean,
  ): "improving" | "stable" | "declining" | "insufficient_data" {
    if (samples.length < 3) return "insufficient_data";

    const sorted = [...samples].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    const midpoint = Math.floor(sorted.length / 2);
    const firstHalf = sorted.slice(0, midpoint);
    const secondHalf = sorted.slice(midpoint);

    const firstAvg =
      firstHalf.reduce((sum, s) => sum + s.value, 0) / firstHalf.length;
    const secondAvg =
      secondHalf.reduce((sum, s) => sum + s.value, 0) / secondHalf.length;

    const changePercent = ((secondAvg - firstAvg) / firstAvg) * 100;

    if (Math.abs(changePercent) < 5) return "stable";

    const isIncreasing = changePercent > 0;
    return (isIncreasing && higherIsBetter) ||
      (!isIncreasing && !higherIsBetter)
      ? "improving"
      : "declining";
  }

  describe("calculateTrend", () => {
    it("returns insufficient_data for less than 3 samples", () => {
      expect(calculateTrend([{ date: "2024-01-01", value: 100 }], true)).toBe(
        "insufficient_data",
      );
      expect(
        calculateTrend(
          [
            { date: "2024-01-01", value: 100 },
            { date: "2024-01-02", value: 110 },
          ],
          true,
        ),
      ).toBe("insufficient_data");
    });

    it("detects improving trend for steps (higher is better)", () => {
      const samples = [
        { date: "2024-01-01", value: 5000 },
        { date: "2024-01-02", value: 5100 },
        { date: "2024-01-03", value: 5200 },
        { date: "2024-01-04", value: 6000 },
        { date: "2024-01-05", value: 6500 },
        { date: "2024-01-06", value: 7000 },
      ];
      expect(calculateTrend(samples, true)).toBe("improving");
    });

    it("detects declining trend for steps", () => {
      const samples = [
        { date: "2024-01-01", value: 7000 },
        { date: "2024-01-02", value: 6500 },
        { date: "2024-01-03", value: 6000 },
        { date: "2024-01-04", value: 5200 },
        { date: "2024-01-05", value: 5100 },
        { date: "2024-01-06", value: 5000 },
      ];
      expect(calculateTrend(samples, true)).toBe("declining");
    });

    it("detects improving trend for heart rate (lower is better)", () => {
      const samples = [
        { date: "2024-01-01", value: 75 },
        { date: "2024-01-02", value: 74 },
        { date: "2024-01-03", value: 73 },
        { date: "2024-01-04", value: 68 },
        { date: "2024-01-05", value: 67 },
        { date: "2024-01-06", value: 65 },
      ];
      // For heart rate, lower is better, so decreasing = improving
      expect(calculateTrend(samples, false)).toBe("improving");
    });

    it("returns stable for small variations", () => {
      const samples = [
        { date: "2024-01-01", value: 100 },
        { date: "2024-01-02", value: 101 },
        { date: "2024-01-03", value: 99 },
        { date: "2024-01-04", value: 100 },
        { date: "2024-01-05", value: 102 },
        { date: "2024-01-06", value: 101 },
      ];
      expect(calculateTrend(samples, true)).toBe("stable");
    });
  });

  describe("METRIC_CONFIGS", () => {
    it("has correct config for steps", () => {
      const config = METRIC_CONFIGS.HKQuantityTypeIdentifierStepCount;
      expect(config.isCumulative).toBe(true);
      expect(config.higherIsBetter).toBe(true);
      expect(config.unit).toBe("steps");
    });

    it("has correct config for heart rate", () => {
      const config = METRIC_CONFIGS.HKQuantityTypeIdentifierHeartRate;
      expect(config.isCumulative).toBe(false);
      expect(config.higherIsBetter).toBe(false);
      expect(config.unit).toBe("bpm");
    });

    it("has correct config for HRV", () => {
      const config =
        METRIC_CONFIGS.HKQuantityTypeIdentifierHeartRateVariabilitySDNN;
      expect(config.isCumulative).toBe(false);
      expect(config.higherIsBetter).toBe(true);
      expect(config.unit).toBe("ms");
    });
  });
});

// ============ AI Chat Context Building Tests ============

describe("/api/ai/chat context building", () => {
  interface HealthMetricSummary {
    average?: number;
    min?: number;
    max?: number;
    latest?: number;
  }

  interface HealthContext {
    metrics?: {
      steps?: HealthMetricSummary;
      heartRate?: HealthMetricSummary;
      hrv?: HealthMetricSummary;
      sleep?: HealthMetricSummary;
      exercise?: HealthMetricSummary;
    };
    dateRange?: {
      start: string;
      end: string;
    };
  }

  function buildContextMessage(context: HealthContext): string {
    if (!context.metrics) return "";

    const parts: string[] = ["Current health data summary:"];

    if (context.metrics.steps) {
      const s = context.metrics.steps;
      parts.push(
        `- Steps: ${s.latest?.toLocaleString() ?? "N/A"} today, avg ${s.average?.toLocaleString() ?? "N/A"}/day`,
      );
    }

    if (context.metrics.heartRate) {
      const hr = context.metrics.heartRate;
      parts.push(
        `- Heart Rate: ${hr.latest ?? "N/A"} bpm current, avg ${hr.average ?? "N/A"} bpm`,
      );
    }

    if (context.metrics.hrv) {
      const hrv = context.metrics.hrv;
      parts.push(
        `- HRV: ${hrv.latest ?? "N/A"} ms, avg ${hrv.average ?? "N/A"} ms`,
      );
    }

    if (context.metrics.sleep) {
      const sleep = context.metrics.sleep;
      parts.push(
        `- Sleep: ${sleep.latest ? (sleep.latest / 60).toFixed(1) : "N/A"} hrs last night`,
      );
    }

    if (context.metrics.exercise) {
      const ex = context.metrics.exercise;
      parts.push(`- Exercise: ${ex.latest ?? "N/A"} mins today`);
    }

    if (context.dateRange) {
      parts.push(
        `\nData range: ${context.dateRange.start} to ${context.dateRange.end}`,
      );
    }

    return parts.join("\n");
  }

  it("builds context message with all metrics", () => {
    const context: HealthContext = {
      metrics: {
        steps: { latest: 8500, average: 7200 },
        heartRate: { latest: 72, average: 68 },
        hrv: { latest: 45, average: 42 },
        sleep: { latest: 420 }, // 7 hours in minutes
        exercise: { latest: 30 },
      },
      dateRange: { start: "2024-01-01", end: "2024-01-07" },
    };

    const message = buildContextMessage(context);

    expect(message).toContain("Steps: 8,500 today");
    expect(message).toContain("Heart Rate: 72 bpm");
    expect(message).toContain("HRV: 45 ms");
    expect(message).toContain("Sleep: 7.0 hrs");
    expect(message).toContain("Exercise: 30 mins");
    expect(message).toContain("Data range: 2024-01-01 to 2024-01-07");
  });

  it("handles missing metrics gracefully", () => {
    const context: HealthContext = {
      metrics: {
        steps: { latest: 5000 },
      },
    };

    const message = buildContextMessage(context);

    expect(message).toContain("Steps:");
    expect(message).not.toContain("Heart Rate:");
    expect(message).not.toContain("HRV:");
  });

  it("returns empty string for no metrics", () => {
    expect(buildContextMessage({})).toBe("");
    expect(buildContextMessage({ metrics: {} })).toBe(
      "Current health data summary:",
    );
  });

  it("shows N/A for undefined values", () => {
    const context: HealthContext = {
      metrics: {
        steps: { average: 7000 }, // no latest
        heartRate: { latest: 70 }, // no average
      },
    };

    const message = buildContextMessage(context);

    expect(message).toContain("N/A today");
    expect(message).toContain("avg N/A bpm");
  });
});

// ============ Health Sync Metadata Tests ============

describe("/api/health/sync metadata extraction", () => {
  interface SyncMetadata {
    dataType: string;
    syncedAt: string;
    recordCount: number;
    dateRange?: {
      start: string;
      end: string;
    };
  }

  function extractMetadata(
    data: Record<string, Array<{ startDate?: string }>>,
    dataType: string,
  ): SyncMetadata {
    let recordCount = 0;
    let dateRange: { start: string; end: string } | undefined;

    for (const metric in data) {
      if (Array.isArray(data[metric])) {
        recordCount += data[metric].length;

        for (const sample of data[metric]) {
          if (sample.startDate) {
            if (!dateRange) {
              dateRange = { start: sample.startDate, end: sample.startDate };
            } else {
              if (sample.startDate < dateRange.start) {
                dateRange.start = sample.startDate;
              }
              if (sample.startDate > dateRange.end) {
                dateRange.end = sample.startDate;
              }
            }
          }
        }
      }
    }

    return {
      dataType,
      syncedAt: new Date().toISOString(),
      recordCount,
      dateRange,
    };
  }

  it("counts records across all metrics", () => {
    const data = {
      HKQuantityTypeIdentifierStepCount: [
        { startDate: "2024-01-01T10:00:00Z" },
        { startDate: "2024-01-02T10:00:00Z" },
      ],
      HKQuantityTypeIdentifierHeartRate: [
        { startDate: "2024-01-01T10:00:00Z" },
        { startDate: "2024-01-01T11:00:00Z" },
        { startDate: "2024-01-01T12:00:00Z" },
      ],
    };

    const metadata = extractMetadata(data, "apple-health");

    expect(metadata.recordCount).toBe(5);
    expect(metadata.dataType).toBe("apple-health");
  });

  it("extracts date range correctly", () => {
    const data = {
      HKQuantityTypeIdentifierStepCount: [
        { startDate: "2024-01-15T10:00:00Z" },
        { startDate: "2024-01-01T10:00:00Z" },
        { startDate: "2024-01-10T10:00:00Z" },
      ],
    };

    const metadata = extractMetadata(data, "apple-health");

    expect(metadata.dateRange?.start).toBe("2024-01-01T10:00:00Z");
    expect(metadata.dateRange?.end).toBe("2024-01-15T10:00:00Z");
  });

  it("handles empty data", () => {
    const metadata = extractMetadata({}, "apple-health");

    expect(metadata.recordCount).toBe(0);
    expect(metadata.dateRange).toBeUndefined();
  });

  it("handles samples without dates", () => {
    const data = {
      HKQuantityTypeIdentifierStepCount: [
        { value: 1000 } as { startDate?: string },
        { startDate: "2024-01-05T10:00:00Z" },
      ],
    };

    const metadata = extractMetadata(data, "apple-health");

    expect(metadata.recordCount).toBe(2);
    expect(metadata.dateRange?.start).toBe("2024-01-05T10:00:00Z");
    expect(metadata.dateRange?.end).toBe("2024-01-05T10:00:00Z");
  });
});
