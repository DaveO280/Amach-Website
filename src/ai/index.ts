/**
 * AI module exports
 */

export {
  calculateRelevanceScore,
  rankMetricsByRelevance,
  filterByRelevance,
  getTopRelevant,
  identifyKeyPatterns,
  detectAnomalies,
  type HealthMetric,
  type UserContext,
  type RankedMetric,
  type RelevanceScore,
  type Pattern,
  type Anomaly,
} from "./RelevanceScorer";

export {
  preprocessHealthContext,
  cachePreprocessedContext,
  getCachedContext,
  getPreprocessedContext,
  toAIPrompt,
  getSummary,
  type PreprocessedContext,
  type PreprocessOptions,
} from "./ContextPreprocessor";
