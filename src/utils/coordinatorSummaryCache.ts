// src/utils/coordinatorSummaryCache.ts
// Cache coordinator summary generation to avoid re-running when agent insights haven't changed

import type { AgentInsight } from "@/agents/types";
import type { CoordinatorSummary } from "@/agents/CoordinatorAgent";

const STORAGE_KEY = "amach_coordinator_summary_cache_v1";
const MAX_CACHE_SIZE = 50;

interface CacheEntry {
  v: number;
  insightsHash: string;
  summary: CoordinatorSummary;
  createdAtMs: number;
}

function hashAgentInsights(
  agentInsights: Record<string, AgentInsight>,
): string {
  // Create a stable hash of agent insights
  // Only include fields that affect summary generation
  const simplified = Object.fromEntries(
    Object.entries(agentInsights).map(([id, insight]) => [
      id,
      {
        confidence: insight.confidence,
        relevance: insight.relevance,
        findingsCount: insight.findings?.length ?? 0,
        trendsCount: insight.trends?.length ?? 0,
        concernsCount: insight.concerns?.length ?? 0,
        recommendationsCount: insight.recommendations?.length ?? 0,
        // Include first finding observation as a fingerprint (not full content)
        firstFinding: insight.findings?.[0]?.observation?.substring(0, 100),
      },
    ]),
  );

  const key = JSON.stringify(simplified);
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `summary_${Math.abs(hash).toString(36)}`;
}

export function getCachedCoordinatorSummary(params: {
  agentInsights: Record<string, AgentInsight>;
  maxAgeMs: number;
}): CoordinatorSummary | null {
  if (typeof window === "undefined") return null;

  const insightsHash = hashAgentInsights(params.agentInsights);

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const cache = JSON.parse(raw) as Record<string, CacheEntry>;
    const entry = cache[insightsHash];

    if (!entry) return null;
    if (entry.v !== 1) return null;

    const age = Date.now() - entry.createdAtMs;
    if (age > params.maxAgeMs) {
      delete cache[insightsHash];
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
      return null;
    }

    if (process.env.NODE_ENV === "development") {
      console.log(
        `[CoordinatorSummaryCache] HIT hash=${insightsHash.substring(0, 12)}... age=${Math.round(age / 1000)}s`,
      );
    }

    return entry.summary;
  } catch (error) {
    console.warn("[CoordinatorSummaryCache] Failed to read cache:", error);
    return null;
  }
}

export function setCachedCoordinatorSummary(params: {
  agentInsights: Record<string, AgentInsight>;
  summary: CoordinatorSummary;
}): void {
  if (typeof window === "undefined") return;

  const insightsHash = hashAgentInsights(params.agentInsights);

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const cache: Record<string, CacheEntry> = raw ? JSON.parse(raw) : {};

    cache[insightsHash] = {
      v: 1,
      insightsHash,
      summary: params.summary,
      createdAtMs: Date.now(),
    };

    // Evict oldest entries if cache is too large
    const entries = Object.entries(cache);
    if (entries.length > MAX_CACHE_SIZE) {
      entries.sort((a, b) => a[1].createdAtMs - b[1].createdAtMs);
      const toRemove = entries.slice(0, entries.length - MAX_CACHE_SIZE);
      for (const [k] of toRemove) {
        delete cache[k];
      }
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));

    if (process.env.NODE_ENV === "development") {
      console.log(
        `[CoordinatorSummaryCache] STORE hash=${insightsHash.substring(0, 12)}...`,
      );
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[CoordinatorSummaryCache] Failed to write cache:", error);
    }
  }
}

export function clearCoordinatorSummaryCache(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn("[CoordinatorSummaryCache] Failed to clear cache:", error);
  }
}
