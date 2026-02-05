/**
 * Health Data Summary API Endpoint
 *
 * Provides aggregated health data summaries for dashboard and AI context.
 * Designed to be fast and cacheable.
 *
 * GET /api/health/summary?period=week&metrics=steps,heartRate,hrv
 * POST /api/health/summary
 * Body: {
 *   data: HealthDataResults,  // Raw health data to summarize
 *   period?: 'day' | 'week' | 'month',
 *   metrics?: string[],
 * }
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type Period = "day" | "week" | "month";

interface HealthSample {
  startDate: string;
  value: string | number;
  unit?: string;
  type?: string;
}

interface MetricSummary {
  metric: string;
  period: Period;
  stats: {
    average: number;
    min: number;
    max: number;
    latest: number;
    count: number;
    sum?: number; // For cumulative metrics like steps
  };
  trend: "improving" | "stable" | "declining" | "insufficient_data";
  unit: string;
  samples?: Array<{ date: string; value: number }>;
}

interface SummaryRequestBody {
  data: Record<string, HealthSample[]>;
  period?: Period;
  metrics?: string[];
  includeSamples?: boolean;
}

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
    higherIsBetter: false, // Lower resting HR is generally better
    displayName: "Heart Rate",
  },
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: {
    unit: "ms",
    isCumulative: false,
    higherIsBetter: true, // Higher HRV is better
    displayName: "HRV",
  },
  HKQuantityTypeIdentifierRestingHeartRate: {
    unit: "bpm",
    isCumulative: false,
    higherIsBetter: false,
    displayName: "Resting HR",
  },
  HKQuantityTypeIdentifierAppleExerciseTime: {
    unit: "min",
    isCumulative: true,
    higherIsBetter: true,
    displayName: "Exercise",
  },
  HKQuantityTypeIdentifierActiveEnergyBurned: {
    unit: "kcal",
    isCumulative: true,
    higherIsBetter: true,
    displayName: "Active Energy",
  },
  HKCategoryTypeIdentifierSleepAnalysis: {
    unit: "min",
    isCumulative: true,
    higherIsBetter: true, // More sleep (within reason) is better
    displayName: "Sleep",
  },
};

function getPeriodDays(period: Period): number {
  switch (period) {
    case "day":
      return 1;
    case "week":
      return 7;
    case "month":
      return 30;
  }
}

function calculateTrend(
  samples: Array<{ date: string; value: number }>,
  higherIsBetter: boolean,
): MetricSummary["trend"] {
  if (samples.length < 3) return "insufficient_data";

  // Sort by date
  const sorted = [...samples].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  // Split into two halves
  const midpoint = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, midpoint);
  const secondHalf = sorted.slice(midpoint);

  // Calculate averages
  const firstAvg =
    firstHalf.reduce((sum, s) => sum + s.value, 0) / firstHalf.length;
  const secondAvg =
    secondHalf.reduce((sum, s) => sum + s.value, 0) / secondHalf.length;

  // Determine trend (5% threshold for significance)
  const changePercent = ((secondAvg - firstAvg) / firstAvg) * 100;

  if (Math.abs(changePercent) < 5) return "stable";

  const isIncreasing = changePercent > 0;
  return (isIncreasing && higherIsBetter) || (!isIncreasing && !higherIsBetter)
    ? "improving"
    : "declining";
}

function summarizeMetric(
  metricKey: string,
  samples: HealthSample[],
  period: Period,
  includeSamples: boolean,
): MetricSummary | null {
  if (!samples || samples.length === 0) return null;

  const config = METRIC_CONFIGS[metricKey] ?? {
    unit: "units",
    isCumulative: false,
    higherIsBetter: true,
    displayName: metricKey,
  };

  const now = new Date();
  const periodMs = getPeriodDays(period) * 24 * 60 * 60 * 1000;
  const cutoff = new Date(now.getTime() - periodMs);

  // Filter to period and parse values
  const periodSamples = samples
    .filter((s) => new Date(s.startDate) >= cutoff)
    .map((s) => ({
      date: s.startDate.split("T")[0],
      value: typeof s.value === "string" ? parseFloat(s.value) : s.value,
    }))
    .filter((s) => !isNaN(s.value));

  if (periodSamples.length === 0) return null;

  // Group by day for cumulative metrics
  let dailyValues: Array<{ date: string; value: number }>;

  if (config.isCumulative) {
    const byDay = new Map<string, number>();
    for (const sample of periodSamples) {
      byDay.set(sample.date, (byDay.get(sample.date) ?? 0) + sample.value);
    }
    dailyValues = Array.from(byDay.entries()).map(([date, value]) => ({
      date,
      value,
    }));
  } else {
    // For non-cumulative, average by day
    const byDay = new Map<string, number[]>();
    for (const sample of periodSamples) {
      const existing = byDay.get(sample.date) ?? [];
      existing.push(sample.value);
      byDay.set(sample.date, existing);
    }
    dailyValues = Array.from(byDay.entries()).map(([date, values]) => ({
      date,
      value: values.reduce((a, b) => a + b, 0) / values.length,
    }));
  }

  // Sort by date
  dailyValues.sort((a, b) => a.date.localeCompare(b.date));

  // Calculate stats
  const values = dailyValues.map((d) => d.value);
  const sum = values.reduce((a, b) => a + b, 0);
  const average = sum / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const latest = values[values.length - 1];

  return {
    metric: config.displayName,
    period,
    stats: {
      average: Math.round(average * 10) / 10,
      min: Math.round(min * 10) / 10,
      max: Math.round(max * 10) / 10,
      latest: Math.round(latest * 10) / 10,
      count: periodSamples.length,
      ...(config.isCumulative ? { sum: Math.round(sum) } : {}),
    },
    trend: calculateTrend(dailyValues, config.higherIsBetter),
    unit: config.unit,
    ...(includeSamples ? { samples: dailyValues } : {}),
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as SummaryRequestBody;

    if (!body.data || typeof body.data !== "object") {
      return NextResponse.json(
        { error: "data is required and must be an object" },
        { status: 400 },
      );
    }

    const period = body.period ?? "week";
    const includeSamples = body.includeSamples ?? false;
    const requestedMetrics = body.metrics;

    const summaries: MetricSummary[] = [];

    for (const [metricKey, samples] of Object.entries(body.data)) {
      // Skip if specific metrics requested and this isn't one of them
      if (requestedMetrics && !requestedMetrics.includes(metricKey)) {
        continue;
      }

      const summary = summarizeMetric(
        metricKey,
        samples as HealthSample[],
        period,
        includeSamples,
      );

      if (summary) {
        summaries.push(summary);
      }
    }

    // Calculate overall health score (simple average of trends)
    const trendScores = {
      improving: 1,
      stable: 0.5,
      declining: 0,
      insufficient_data: 0.5,
    };

    const validSummaries = summaries.filter(
      (s) => s.trend !== "insufficient_data",
    );
    const overallScore =
      validSummaries.length > 0
        ? Math.round(
            (validSummaries.reduce((sum, s) => sum + trendScores[s.trend], 0) /
              validSummaries.length) *
              100,
          )
        : null;

    return NextResponse.json({
      success: true,
      period,
      generatedAt: new Date().toISOString(),
      summaries,
      overallScore,
      metricsCount: summaries.length,
    });
  } catch (error) {
    console.error("[Health Summary] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate summary",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function OPTIONS(): Promise<NextResponse> {
  return NextResponse.json(
    {},
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    },
  );
}
