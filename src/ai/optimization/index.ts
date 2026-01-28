/**
 * AI Optimization Module
 *
 * Provides caching, pre-computation, and performance optimizations
 * for the health AI chat system.
 *
 * Key exports:
 * - DataHasher: Generates fingerprints for cache invalidation
 * - CachedInsightsStore: Caches coordinator/agent analysis results
 * - PreComputedMetricsGenerator: Pre-computes metric summaries
 */

export { DataHasher, type DataFingerprint } from "./DataHasher";
export {
  CachedInsightsStore,
  type CacheLookupResult,
} from "./CachedInsightsStore";
export {
  PreComputedMetricsGenerator,
  type PreComputedMetrics,
  type MetricSummary,
  type BaselineComparison,
} from "./PreComputedMetrics";
