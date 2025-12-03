/**
 * RelevanceScorer - Scores health metrics by importance/relevance
 *
 * Scoring factors:
 * 1. Goal correlation (30-40%) - How related to user's health goals
 * 2. Statistical significance (25-35%) - Deviation from baseline
 * 3. Health impact (20-30%) - Clinical importance
 * 4. Temporal relevance (5-10%) - Recency
 * 5. User interaction (5-10%) - Frequency of user queries
 */

export interface HealthMetric {
  type: string;
  value: number;
  timestamp: number;
  unit?: string;
  startDate?: string; // ISO date string for duration metrics (e.g., sleep)
  endDate?: string; // ISO date string for duration metrics
  metadata?: Record<string, unknown>;
}

export interface UserContext {
  age?: number;
  sex?: "male" | "female";
  goals?: string[];
  conditions?: string[];
  recentQueries?: string[];
  baseline?: Record<string, number>;
  weight?: number; // in lbs or kg
  height?: number; // in inches or cm
}

export interface RelevanceScore {
  metric: string;
  score: number; // 0-1
  factors: {
    goalCorrelation: number;
    statisticalSignificance: number;
    healthImpact: number;
    temporalRelevance: number;
    userInteraction: number;
  };
  reasoning: string;
}

export interface RankedMetric {
  metric: HealthMetric;
  relevanceScore: RelevanceScore;
}

/**
 * Clinical importance weights for common health metrics
 */
const HEALTH_IMPACT_WEIGHTS: Record<string, number> = {
  // Critical metrics (0.9-1.0)
  heart_rate_variability: 0.95,
  resting_heart_rate: 0.9,
  blood_pressure_systolic: 1.0,
  blood_pressure_diastolic: 1.0,
  blood_glucose: 1.0,
  oxygen_saturation: 1.0,

  // Important metrics (0.7-0.9)
  sleep_duration: 0.85,
  deep_sleep_duration: 0.8,
  rem_sleep_duration: 0.75,
  vo2_max: 0.85,
  body_temperature: 0.8,
  respiratory_rate: 0.8,

  // Moderate metrics (0.5-0.7)
  step_count: 0.6,
  active_energy: 0.65,
  exercise_minutes: 0.7,
  body_mass: 0.65,
  body_fat_percentage: 0.7,

  // Supporting metrics (0.3-0.5)
  stand_time: 0.4,
  flights_climbed: 0.35,
  distance_walking: 0.4,

  // Default for unknown metrics
  default: 0.5,
};

/**
 * Goal-related keywords for correlation matching
 */
const GOAL_KEYWORDS: Record<string, string[]> = {
  weight_loss: ["body_mass", "body_fat", "active_energy", "exercise"],
  fitness: ["vo2_max", "exercise", "heart_rate", "active_energy", "step"],
  sleep: ["sleep", "rem", "deep", "heart_rate_variability"],
  stress: ["heart_rate_variability", "resting_heart_rate", "sleep"],
  cardiovascular: ["heart_rate", "blood_pressure", "vo2_max", "exercise"],
  recovery: ["heart_rate_variability", "sleep", "resting_heart_rate"],
};

/**
 * Calculate relevance score for a health metric
 */
export function calculateRelevanceScore(
  metric: HealthMetric,
  context: UserContext,
): RelevanceScore {
  const factors = {
    goalCorrelation: calculateGoalCorrelation(metric, context),
    statisticalSignificance: calculateStatisticalSignificance(metric, context),
    healthImpact: calculateHealthImpact(metric),
    temporalRelevance: calculateTemporalRelevance(metric),
    userInteraction: calculateUserInteraction(metric, context),
  };

  // Weighted average
  const score =
    factors.goalCorrelation * 0.35 +
    factors.statisticalSignificance * 0.3 +
    factors.healthImpact * 0.25 +
    factors.temporalRelevance * 0.05 +
    factors.userInteraction * 0.05;

  const reasoning = generateReasoning(metric, factors);

  return {
    metric: metric.type,
    score: Math.min(1, Math.max(0, score)),
    factors,
    reasoning,
  };
}

/**
 * Calculate goal correlation (0-1)
 * How related is this metric to user's stated goals?
 */
function calculateGoalCorrelation(
  metric: HealthMetric,
  context: UserContext,
): number {
  if (!context.goals || context.goals.length === 0) {
    return 0.5; // Neutral if no goals
  }

  let maxCorrelation = 0;

  for (const goal of context.goals) {
    const goalKey = goal.toLowerCase().replace(/\s+/g, "_");
    const keywords = GOAL_KEYWORDS[goalKey] || [];

    for (const keyword of keywords) {
      if (metric.type.toLowerCase().includes(keyword)) {
        maxCorrelation = Math.max(maxCorrelation, 1.0);
        break;
      }
    }
  }

  return maxCorrelation;
}

/**
 * Calculate statistical significance (0-1)
 * How much does this metric deviate from baseline?
 */
function calculateStatisticalSignificance(
  metric: HealthMetric,
  context: UserContext,
): number {
  if (!context.baseline || !context.baseline[metric.type]) {
    return 0.5; // Neutral if no baseline
  }

  const baseline = context.baseline[metric.type];
  const deviation = Math.abs(metric.value - baseline) / baseline;

  // Normalize deviation to 0-1 scale
  // 0% deviation = 0, 20%+ deviation = 1
  const normalized = Math.min(deviation / 0.2, 1);

  return normalized;
}

/**
 * Calculate health impact (0-1)
 * Clinical importance of this metric
 */
function calculateHealthImpact(metric: HealthMetric): number {
  const metricKey = metric.type.toLowerCase();

  for (const [key, weight] of Object.entries(HEALTH_IMPACT_WEIGHTS)) {
    if (metricKey.includes(key)) {
      return weight;
    }
  }

  return HEALTH_IMPACT_WEIGHTS["default"];
}

/**
 * Calculate temporal relevance (0-1)
 * How recent is this data?
 */
function calculateTemporalRelevance(metric: HealthMetric): number {
  const now = Date.now();
  const age = now - metric.timestamp;

  // Age in days
  const days = age / (1000 * 60 * 60 * 24);

  // Decay function: recent data is more relevant
  // Same day = 1.0, 7 days = 0.7, 30 days = 0.3, 90+ days = 0.1
  if (days < 1) return 1.0;
  if (days < 7) return 0.9 - (days / 7) * 0.2;
  if (days < 30) return 0.7 - ((days - 7) / 23) * 0.4;
  if (days < 90) return 0.3 - ((days - 30) / 60) * 0.2;
  return 0.1;
}

/**
 * Calculate user interaction (0-1)
 * How often has the user queried about this metric?
 */
function calculateUserInteraction(
  metric: HealthMetric,
  context: UserContext,
): number {
  if (!context.recentQueries || context.recentQueries.length === 0) {
    return 0.5; // Neutral if no query history
  }

  const metricKey = metric.type.toLowerCase();
  let matches = 0;

  for (const query of context.recentQueries) {
    if (query.toLowerCase().includes(metricKey.replace(/_/g, " "))) {
      matches++;
    }
  }

  // Normalize: 0 mentions = 0.3, 1 mention = 0.6, 2+ mentions = 1.0
  if (matches === 0) return 0.3;
  if (matches === 1) return 0.6;
  return 1.0;
}

/**
 * Generate human-readable reasoning for the score
 */
function generateReasoning(
  _metric: HealthMetric,
  factors: RelevanceScore["factors"],
): string {
  const reasons: string[] = [];

  if (factors.goalCorrelation > 0.7) {
    reasons.push("directly related to your health goals");
  }

  if (factors.statisticalSignificance > 0.7) {
    reasons.push("shows significant deviation from baseline");
  }

  if (factors.healthImpact > 0.8) {
    reasons.push("clinically important metric");
  }

  if (factors.temporalRelevance > 0.8) {
    reasons.push("recent data");
  }

  if (factors.userInteraction > 0.7) {
    reasons.push("frequently queried by you");
  }

  if (reasons.length === 0) {
    return "Standard health metric";
  }

  return reasons.join(", ");
}

/**
 * Rank multiple metrics by relevance
 */
export function rankMetricsByRelevance(
  metrics: HealthMetric[],
  context: UserContext,
): RankedMetric[] {
  const scored = metrics.map((metric) => ({
    metric,
    relevanceScore: calculateRelevanceScore(metric, context),
  }));

  // Sort by score descending
  scored.sort((a, b) => b.relevanceScore.score - a.relevanceScore.score);

  return scored;
}

/**
 * Filter metrics by minimum relevance threshold
 */
export function filterByRelevance(
  rankedMetrics: RankedMetric[],
  threshold: number = 0.5,
): RankedMetric[] {
  return rankedMetrics.filter((rm) => rm.relevanceScore.score >= threshold);
}

/**
 * Get top N most relevant metrics
 */
export function getTopRelevant(
  rankedMetrics: RankedMetric[],
  count: number,
): RankedMetric[] {
  return rankedMetrics.slice(0, count);
}

/**
 * Identify patterns in highly relevant metrics
 */
export interface Pattern {
  type: string;
  metrics: string[];
  description: string;
  confidence: number;
}

export function identifyKeyPatterns(rankedMetrics: RankedMetric[]): Pattern[] {
  const patterns: Pattern[] = [];

  // Filter to highly relevant metrics
  const relevant = rankedMetrics.filter((rm) => rm.relevanceScore.score > 0.7);

  // Group by metric type categories
  const categories: Record<string, string[]> = {
    sleep: [],
    cardiovascular: [],
    activity: [],
    recovery: [],
  };

  for (const rm of relevant) {
    const type = rm.metric.type.toLowerCase();

    if (
      type.includes("sleep") ||
      type.includes("rem") ||
      type.includes("deep")
    ) {
      categories.sleep.push(rm.metric.type);
    }

    if (
      type.includes("heart") ||
      type.includes("blood_pressure") ||
      type.includes("vo2")
    ) {
      categories.cardiovascular.push(rm.metric.type);
    }

    if (
      type.includes("step") ||
      type.includes("exercise") ||
      type.includes("active")
    ) {
      categories.activity.push(rm.metric.type);
    }

    if (type.includes("hrv") || type.includes("recovery")) {
      categories.recovery.push(rm.metric.type);
    }
  }

  // Create patterns for categories with multiple metrics
  for (const [category, metrics] of Object.entries(categories)) {
    if (metrics.length >= 2) {
      patterns.push({
        type: category,
        metrics,
        description: `Multiple ${category} metrics showing high relevance`,
        confidence: Math.min(metrics.length / 5, 1), // More metrics = higher confidence
      });
    }
  }

  return patterns;
}

/**
 * Detect anomalies in metrics
 */
export interface Anomaly {
  metric: string;
  value: number;
  expected: number;
  deviation: number;
  severity: "low" | "medium" | "high";
}

export function detectAnomalies(
  metrics: HealthMetric[],
  context: UserContext,
): Anomaly[] {
  if (!context.baseline) return [];

  const anomalies: Anomaly[] = [];

  for (const metric of metrics) {
    const baseline = context.baseline[metric.type];
    if (!baseline) continue;

    const deviation = Math.abs(metric.value - baseline) / baseline;

    if (deviation > 0.15) {
      // More than 15% deviation
      let severity: Anomaly["severity"] = "low";
      if (deviation > 0.3) severity = "high";
      else if (deviation > 0.2) severity = "medium";

      anomalies.push({
        metric: metric.type,
        value: metric.value,
        expected: baseline,
        deviation,
        severity,
      });
    }
  }

  return anomalies;
}
