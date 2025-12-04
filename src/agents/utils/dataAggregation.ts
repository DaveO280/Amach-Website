import type { MetricSample } from "../types";

export interface DailyAggregate {
  date: string; // YYYY-MM-DD
  value: number;
  count: number;
  min?: number;
  max?: number;
}

export interface WeeklyAggregate {
  weekStart: string; // YYYY-MM-DD (Monday)
  weekEnd: string; // YYYY-MM-DD (Sunday)
  value: number; // Average
  count: number;
  min?: number;
  max?: number;
}

export interface MonthlyAggregate {
  month: string; // YYYY-MM
  value: number; // Average
  count: number;
  min?: number;
  max?: number;
}

export interface TieredDataFormat {
  daily: DailyAggregate[]; // Last 30 days
  weekly: WeeklyAggregate[]; // Last 6 months (~26 weeks)
  monthly: MonthlyAggregate[]; // Full period
  fullPeriodStats: {
    average: number;
    min: number;
    max: number;
    totalDays: number;
    dateRange: { start: Date; end: Date };
  };
}

/**
 * Aggregate samples by day
 */
export function aggregateByDay(
  samples: MetricSample[],
): Map<string, DailyAggregate> {
  const dailyMap = new Map<string, DailyAggregate>();

  for (const sample of samples) {
    const dateKey = getDateKey(sample.timestamp);
    const existing = dailyMap.get(dateKey);

    if (existing) {
      existing.value += sample.value;
      existing.count += 1;
      existing.min = Math.min(existing.min ?? sample.value, sample.value);
      existing.max = Math.max(existing.max ?? sample.value, sample.value);
    } else {
      dailyMap.set(dateKey, {
        date: dateKey,
        value: sample.value,
        count: 1,
        min: sample.value,
        max: sample.value,
      });
    }
  }

  // Calculate averages
  for (const aggregate of dailyMap.values()) {
    if (aggregate.count > 0) {
      aggregate.value = aggregate.value / aggregate.count;
    }
  }

  return dailyMap;
}

/**
 * Aggregate daily data into weekly aggregates
 */
export function aggregateByWeek(
  dailyAggregates: DailyAggregate[],
): WeeklyAggregate[] {
  const weeklyMap = new Map<string, WeeklyAggregate>();

  for (const daily of dailyAggregates) {
    const date = new Date(daily.date);
    const weekStart = getWeekStart(date);
    const weekKey = weekStart.toISOString().split("T")[0];

    const existing = weeklyMap.get(weekKey);
    if (existing) {
      existing.value += daily.value;
      existing.count += 1;
      existing.min = Math.min(
        existing.min ?? daily.value,
        daily.min ?? daily.value,
      );
      existing.max = Math.max(
        existing.max ?? daily.value,
        daily.max ?? daily.value,
      );
    } else {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      weeklyMap.set(weekKey, {
        weekStart: weekKey,
        weekEnd: weekEnd.toISOString().split("T")[0],
        value: daily.value,
        count: 1,
        min: daily.min ?? daily.value,
        max: daily.max ?? daily.value,
      });
    }
  }

  // Calculate averages and convert to array
  const weekly: WeeklyAggregate[] = [];
  for (const aggregate of weeklyMap.values()) {
    if (aggregate.count > 0) {
      aggregate.value = aggregate.value / aggregate.count;
    }
    weekly.push(aggregate);
  }

  // Sort by week start date
  weekly.sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  return weekly;
}

/**
 * Aggregate daily data into monthly aggregates
 */
export function aggregateByMonth(
  dailyAggregates: DailyAggregate[],
): MonthlyAggregate[] {
  const monthlyMap = new Map<string, MonthlyAggregate>();

  for (const daily of dailyAggregates) {
    const monthKey = daily.date.substring(0, 7); // YYYY-MM

    const existing = monthlyMap.get(monthKey);
    if (existing) {
      existing.value += daily.value;
      existing.count += 1;
      existing.min = Math.min(
        existing.min ?? daily.value,
        daily.min ?? daily.value,
      );
      existing.max = Math.max(
        existing.max ?? daily.value,
        daily.max ?? daily.value,
      );
    } else {
      monthlyMap.set(monthKey, {
        month: monthKey,
        value: daily.value,
        count: 1,
        min: daily.min ?? daily.value,
        max: daily.max ?? daily.value,
      });
    }
  }

  // Calculate averages and convert to array
  const monthly: MonthlyAggregate[] = [];
  for (const aggregate of monthlyMap.values()) {
    if (aggregate.count > 0) {
      aggregate.value = aggregate.value / aggregate.count;
    }
    monthly.push(aggregate);
  }

  // Sort by month
  monthly.sort((a, b) => a.month.localeCompare(b.month));

  return monthly;
}

/**
 * Create tiered data format for initial analysis
 * - Daily: Last 30 days
 * - Weekly: Last 6 months (~26 weeks)
 * - Monthly: Full period
 */
export function createTieredDataFormat(
  samples: MetricSample[],
): TieredDataFormat {
  if (samples.length === 0) {
    return {
      daily: [],
      weekly: [],
      monthly: [],
      fullPeriodStats: {
        average: 0,
        min: 0,
        max: 0,
        totalDays: 0,
        dateRange: { start: new Date(), end: new Date() },
      },
    };
  }

  // Aggregate all samples by day
  const dailyMap = aggregateByDay(samples);
  const allDaily = Array.from(dailyMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  // Get date range
  const dates = allDaily.map((d) => new Date(d.date));
  const start = new Date(Math.min(...dates.map((d) => d.getTime())));
  const end = new Date(Math.max(...dates.map((d) => d.getTime())));

  // Calculate full period stats
  const values = allDaily.map((d) => d.value);
  const fullPeriodStats = {
    average: values.reduce((a, b) => a + b, 0) / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    totalDays: allDaily.length,
    dateRange: { start, end },
  };

  // Get last 30 days of daily data
  const last30Days = allDaily.slice(-30);

  // Get last 6 months of weekly data
  const sixMonthsAgo = new Date(end);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const recentDaily = allDaily.filter((d) => new Date(d.date) >= sixMonthsAgo);
  const weekly = aggregateByWeek(recentDaily);
  const last26Weeks = weekly.slice(-26); // ~6 months

  // Get all monthly data
  const monthly = aggregateByMonth(allDaily);

  return {
    daily: last30Days,
    weekly: last26Weeks,
    monthly,
    fullPeriodStats,
  };
}

/**
 * Get date key in YYYY-MM-DD format
 */
function getDateKey(date: Date): string {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split("T")[0];
}

/**
 * Get the Monday of the week for a given date
 */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  return new Date(d.setDate(diff));
}

/**
 * Format tiered data for display in prompts
 */
export function formatTieredDataForPrompt(
  tiered: TieredDataFormat,
  metricName: string,
  unit: string = "",
): string {
  const lines: string[] = [];

  lines.push(`${metricName.toUpperCase()} DATA (Tiered Format):`);
  lines.push("");

  // Full period summary
  lines.push("FULL PERIOD SUMMARY:");
  lines.push(
    `  • Average: ${tiered.fullPeriodStats.average.toFixed(2)}${unit}`,
  );
  lines.push(
    `  • Range: ${tiered.fullPeriodStats.min.toFixed(2)}${unit} - ${tiered.fullPeriodStats.max.toFixed(2)}${unit}`,
  );
  lines.push(`  • Total Days: ${tiered.fullPeriodStats.totalDays}`);
  lines.push(
    `  • Date Range: ${tiered.fullPeriodStats.dateRange.start.toLocaleDateString()} to ${tiered.fullPeriodStats.dateRange.end.toLocaleDateString()}`,
  );
  lines.push("");

  // Monthly aggregates
  if (tiered.monthly.length > 0) {
    lines.push("MONTHLY AVERAGES (Full Period):");
    tiered.monthly.forEach((month) => {
      lines.push(
        `  • ${month.month}: ${month.value.toFixed(2)}${unit} (${month.count} days, range: ${month.min?.toFixed(2)}${unit} - ${month.max?.toFixed(2)}${unit})`,
      );
    });
    lines.push("");
  }

  // Weekly aggregates (last 6 months)
  if (tiered.weekly.length > 0) {
    lines.push("WEEKLY AVERAGES (Last 6 Months):");
    tiered.weekly.forEach((week) => {
      lines.push(
        `  • Week ${week.weekStart} to ${week.weekEnd}: ${week.value.toFixed(2)}${unit} (${week.count} days, range: ${week.min?.toFixed(2)}${unit} - ${week.max?.toFixed(2)}${unit})`,
      );
    });
    lines.push("");
  }

  // Daily data (last 30 days)
  if (tiered.daily.length > 0) {
    lines.push("DAILY DATA (Last 30 Days):");
    tiered.daily.forEach((day) => {
      const date = new Date(day.date);
      const dayOfWeek = date.toLocaleDateString("en-US", { weekday: "short" });
      lines.push(
        `  • ${day.date} (${dayOfWeek}): ${day.value.toFixed(2)}${unit}${day.count > 1 ? ` (${day.count} samples)` : ""}`,
      );
    });
  }

  return lines.join("\n");
}
