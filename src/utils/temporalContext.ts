/**
 * Temporal context builder for AI prompts
 * Provides current date, recent trends, and time-based comparisons
 */

import { HealthContextMetrics } from "@/types/HealthContext";

export interface TemporalContext {
  currentDate: string; // "January 9, 2026"
  dataTimespan: string; // "January 9, 2024 to January 6, 2026 (729 days)"
  recentTrends: string[]; // ["Steps: 9,200/day (↓22% vs baseline)", ...]
  seasonalContext: string; // "Winter 2026"
}

/**
 * Calculate percentage change with direction indicator
 * Reserved for future trend analysis feature when daily time-series data is available
 *
 * This function will be used when implementing recent trend calculations
 * comparing last 7/30 days vs all-time baseline
 */
// TODO: Use this function when implementing trend analysis in buildTemporalContext
// function formatTrend(current: number, baseline: number): string {
//   const percentChange = ((current - baseline) / baseline) * 100;
//   const direction = percentChange > 0 ? "↑" : "↓";
//   const absChange = Math.abs(percentChange).toFixed(0);
//
//   if (Math.abs(percentChange) < 3) {
//     return "stable";
//   }
//
//   return `${direction}${absChange}% from baseline`;
// }

/**
 * Get season from date
 */
function getSeason(date: Date): string {
  const month = date.getMonth();
  if (month >= 2 && month <= 4) return "Spring";
  if (month >= 5 && month <= 7) return "Summer";
  if (month >= 8 && month <= 10) return "Fall";
  return "Winter";
}

/**
 * Build temporal context for AI prompts
 */
export function buildTemporalContext(
  metrics: HealthContextMetrics | undefined,
  dataStartDate?: Date,
  dataEndDate?: Date,
): TemporalContext {
  const now = new Date();

  const currentDate = now.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const season = getSeason(now);
  const year = now.getFullYear();

  let dataTimespan = "No health data available";
  if (dataStartDate && dataEndDate) {
    const days = Math.round(
      (dataEndDate.getTime() - dataStartDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    dataTimespan = `${dataStartDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} to ${dataEndDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} (${days} days)`;
  }

  const recentTrends: string[] = [];

  // TODO: Calculate recent trends (last 7/30 days vs. all-time baseline)
  // This requires storing daily aggregates with timestamps
  // For now, we'll add a placeholder that can be enhanced

  if (metrics) {
    // Placeholder for future trend calculation
    // You would compare recent window (last 7-30 days) vs. baseline
    // Example:
    // const recentSteps = calculateRecentAverage(rawData, 7);
    // const trend = formatTrend(recentSteps, metrics.steps.average);
    // recentTrends.push(`Steps: ${recentSteps}/day (${trend})`);
  }

  return {
    currentDate,
    dataTimespan,
    recentTrends,
    seasonalContext: `${season} ${year}`,
  };
}

/**
 * Format temporal context for inclusion in AI prompt
 */
export function formatTemporalContext(context: TemporalContext): string {
  let formatted = `📅 Temporal Context:
- Current Date: ${context.currentDate}
- Season: ${context.seasonalContext}
- Data Coverage: ${context.dataTimespan}`;

  if (context.recentTrends.length > 0) {
    formatted += `\n\nRecent Trends (Last 7 days vs. baseline):\n${context.recentTrends.map((t) => `- ${t}`).join("\n")}`;
  } else {
    formatted += `\n\nNote: Recent trend analysis not yet available (requires daily time-series data)`;
  }

  return formatted;
}
