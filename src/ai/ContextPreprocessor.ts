/**
 * ContextPreprocessor - Prepares, ranks, and caches health data for AI consumption
 *
 * Flow:
 * 1. Fetch user's health data (timeline events + Apple Health metrics)
 * 2. Score each data point by relevance
 * 3. Rank and filter by importance
 * 4. Format for AI consumption
 * 5. Cache preprocessed context in Storj
 */

import {
  rankMetricsByRelevance,
  filterByRelevance,
  getTopRelevant,
  identifyKeyPatterns,
  detectAnomalies,
  type HealthMetric,
  type UserContext,
  type RankedMetric,
  type Pattern,
  type Anomaly,
} from "./RelevanceScorer";
import { getStorageService } from "@/storage";
import type { WalletEncryptionKey } from "@/utils/walletEncryption";

export interface PreprocessedContext {
  userAddress: string;
  generatedAt: number;
  dataTypes: string[];

  // Ranked health metrics
  metrics: {
    top: RankedMetric[];
    all: RankedMetric[];
  };

  // Timeline events
  events: Array<{
    type: string;
    timestamp: number;
    data: unknown;
    relevanceScore: number;
  }>;

  // Insights
  patterns: Pattern[];
  anomalies: Anomaly[];

  // Summary statistics
  summary: {
    totalDataPoints: number;
    highRelevanceCount: number;
    dateRange: { start: number; end: number };
  };

  // AI-ready formatted context
  formattedContext: string;
}

export interface PreprocessOptions {
  maxMetrics?: number; // Max metrics to include (default: 50)
  relevanceThreshold?: number; // Min relevance score (default: 0.5)
  includePatterns?: boolean; // Include pattern analysis (default: true)
  includeAnomalies?: boolean; // Include anomaly detection (default: true)
  cacheDuration?: number; // Cache TTL in ms (default: 1 hour)
}

const DEFAULT_OPTIONS: Required<PreprocessOptions> = {
  maxMetrics: 50,
  relevanceThreshold: 0.5,
  includePatterns: true,
  includeAnomalies: true,
  cacheDuration: 60 * 60 * 1000, // 1 hour
};

/**
 * Preprocess health data for AI context
 */
export async function preprocessHealthContext(
  userAddress: string,
  _encryptionKey: WalletEncryptionKey,
  healthData: HealthMetric[],
  userContext: UserContext,
  options: PreprocessOptions = {},
): Promise<PreprocessedContext> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  console.log("🔄 Preprocessing health context...");
  console.log(`   Data points: ${healthData.length}`);
  console.log(`   Relevance threshold: ${opts.relevanceThreshold}`);

  // 1. Rank all metrics by relevance
  const rankedMetrics = rankMetricsByRelevance(healthData, userContext);

  // 2. Filter by relevance threshold
  const relevantMetrics = filterByRelevance(
    rankedMetrics,
    opts.relevanceThreshold,
  );

  // 3. Get top N most relevant
  const topMetrics = getTopRelevant(relevantMetrics, opts.maxMetrics);

  console.log(`   ✅ Filtered to ${relevantMetrics.length} relevant metrics`);
  console.log(`   ✅ Top ${topMetrics.length} selected for AI context`);

  // 4. Identify patterns (optional)
  const patterns = opts.includePatterns
    ? identifyKeyPatterns(rankedMetrics)
    : [];

  if (patterns.length > 0) {
    console.log(`   ✅ Identified ${patterns.length} patterns`);
  }

  // 5. Detect anomalies (optional)
  const anomalies = opts.includeAnomalies
    ? detectAnomalies(
        topMetrics.map((rm) => rm.metric),
        userContext,
      )
    : [];

  if (anomalies.length > 0) {
    console.log(`   ✅ Detected ${anomalies.length} anomalies`);
  }

  // 6. Calculate date range
  const timestamps = healthData.map((m) => m.timestamp);
  const dateRange = {
    start: Math.min(...timestamps),
    end: Math.max(...timestamps),
  };

  // 7. Format for AI
  const formattedContext = formatForAI(
    topMetrics,
    patterns,
    anomalies,
    userContext,
  );

  // 8. Build preprocessed context
  const preprocessed: PreprocessedContext = {
    userAddress,
    generatedAt: Date.now(),
    dataTypes: [...new Set(healthData.map((m) => m.type))],
    metrics: {
      top: topMetrics,
      all: rankedMetrics,
    },
    events: [], // TODO: Add timeline events when integrated
    patterns,
    anomalies,
    summary: {
      totalDataPoints: healthData.length,
      highRelevanceCount: relevantMetrics.length,
      dateRange,
    },
    formattedContext,
  };

  console.log("✅ Context preprocessing complete");

  return preprocessed;
}

/**
 * Format preprocessed context for AI consumption
 */
function formatForAI(
  topMetrics: RankedMetric[],
  patterns: Pattern[],
  anomalies: Anomaly[],
  userContext: UserContext,
): string {
  let context = "# Health Data Context\n\n";

  // User goals
  if (userContext.goals && userContext.goals.length > 0) {
    context += "## User Goals\n";
    userContext.goals.forEach((goal) => {
      context += `- ${goal}\n`;
    });
    context += "\n";
  }

  // Conditions
  if (userContext.conditions && userContext.conditions.length > 0) {
    context += "## Known Conditions\n";
    userContext.conditions.forEach((condition) => {
      context += `- ${condition}\n`;
    });
    context += "\n";
  }

  // Top relevant metrics
  context += "## Key Health Metrics (Ranked by Relevance)\n\n";
  topMetrics.slice(0, 20).forEach((rm, i) => {
    const { metric, relevanceScore } = rm;
    context += `${i + 1}. **${metric.type}**: ${metric.value}${metric.unit || ""}\n`;
    context += `   - Relevance: ${(relevanceScore.score * 100).toFixed(0)}%\n`;
    context += `   - Reason: ${relevanceScore.reasoning}\n`;
    context += `   - Date: ${new Date(metric.timestamp).toLocaleDateString()}\n\n`;
  });

  // Patterns
  if (patterns.length > 0) {
    context += "## Identified Patterns\n\n";
    patterns.forEach((pattern) => {
      context += `- **${pattern.type}**: ${pattern.description}\n`;
      context += `  - Metrics: ${pattern.metrics.join(", ")}\n`;
      context += `  - Confidence: ${(pattern.confidence * 100).toFixed(0)}%\n\n`;
    });
  }

  // Anomalies
  if (anomalies.length > 0) {
    context += "## Detected Anomalies\n\n";
    anomalies.forEach((anomaly) => {
      context += `- **${anomaly.metric}**: ${anomaly.value} (expected ~${anomaly.expected})\n`;
      context += `  - Deviation: ${(anomaly.deviation * 100).toFixed(1)}%\n`;
      context += `  - Severity: ${anomaly.severity}\n\n`;
    });
  }

  return context;
}

/**
 * Cache preprocessed context in Storj
 */
export async function cachePreprocessedContext(
  userAddress: string,
  encryptionKey: WalletEncryptionKey,
  preprocessed: PreprocessedContext,
): Promise<string> {
  const storageService = getStorageService();

  const cacheKey = `context-cache-${Date.now()}`;

  const result = await storageService.storeHealthData(
    preprocessed,
    userAddress,
    encryptionKey,
    {
      dataType: "ai-context-cache",
      metadata: {
        cacheKey,
        generatedAt: preprocessed.generatedAt.toString(),
        dataPointCount: preprocessed.summary.totalDataPoints.toString(),
      },
    },
  );

  console.log(`💾 Cached preprocessed context: ${result.storjUri}`);

  return result.storjUri;
}

/**
 * Retrieve cached preprocessed context from Storj
 */
export async function getCachedContext(
  storjUri: string,
  encryptionKey: WalletEncryptionKey,
  maxAge: number = 60 * 60 * 1000, // 1 hour
): Promise<PreprocessedContext | null> {
  try {
    const storageService = getStorageService();

    const retrieved =
      await storageService.retrieveHealthData<PreprocessedContext>(
        storjUri,
        encryptionKey,
      );

    // Check if cache is still valid
    const age = Date.now() - retrieved.data.generatedAt;
    if (age > maxAge) {
      console.log("⏰ Cached context expired");
      return null;
    }

    console.log("✅ Retrieved cached context from Storj");
    return retrieved.data;
  } catch (error) {
    console.error("❌ Failed to retrieve cached context:", error);
    return null;
  }
}

/**
 * Get or create preprocessed context (with caching)
 */
export async function getPreprocessedContext(
  userAddress: string,
  encryptionKey: WalletEncryptionKey,
  healthData: HealthMetric[],
  userContext: UserContext,
  options: PreprocessOptions & { cacheUri?: string } = {},
): Promise<PreprocessedContext> {
  // Try to use cached version first
  if (options.cacheUri) {
    const cached = await getCachedContext(
      options.cacheUri,
      encryptionKey,
      options.cacheDuration,
    );

    if (cached) {
      console.log("📦 Using cached preprocessed context");
      return cached;
    }
  }

  // Generate new preprocessed context
  const preprocessed = await preprocessHealthContext(
    userAddress,
    encryptionKey,
    healthData,
    userContext,
    options,
  );

  // Cache it for future use
  await cachePreprocessedContext(userAddress, encryptionKey, preprocessed);

  return preprocessed;
}

/**
 * Convert preprocessed context to AI-ready prompt
 */
export function toAIPrompt(preprocessed: PreprocessedContext): string {
  return preprocessed.formattedContext;
}

/**
 * Get lightweight summary of preprocessed context
 */
export function getSummary(preprocessed: PreprocessedContext): string {
  const { summary, patterns, anomalies } = preprocessed;

  let text = `Analyzed ${summary.totalDataPoints} data points.\n`;
  text += `Found ${summary.highRelevanceCount} highly relevant metrics.\n`;

  if (patterns.length > 0) {
    text += `Identified ${patterns.length} patterns: ${patterns.map((p) => p.type).join(", ")}.\n`;
  }

  if (anomalies.length > 0) {
    text += `Detected ${anomalies.length} anomalies: ${anomalies.map((a) => a.metric).join(", ")}.\n`;
  }

  const days = Math.ceil(
    (summary.dateRange.end - summary.dateRange.start) / (1000 * 60 * 60 * 24),
  );
  text += `Data spans ${days} days.`;

  return text;
}
