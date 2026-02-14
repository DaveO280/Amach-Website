/**
 * Apple Health Storage Module
 *
 * Handles comprehensive Apple Health data storage to Storj
 * with proper aggregation, de-identification, and attestation.
 */

export { AppleHealthStorjService } from "./AppleHealthStorjService";
export type {
  AppleHealthStorjPayload,
  AppleHealthStorjResult,
  AppleHealthManifest,
  DailySummary,
  DailySummaryValue,
  SleepSummary,
} from "./AppleHealthStorjService";

export {
  METRIC_AGGREGATION_STRATEGIES,
  getAggregationStrategy,
  isCumulativeMetric,
  getMetricDisplayName,
  normalizeMetricKey,
} from "./metricAggregationStrategies";
export type {
  AggregationType,
  MetricAggregationStrategy,
} from "./metricAggregationStrategies";
