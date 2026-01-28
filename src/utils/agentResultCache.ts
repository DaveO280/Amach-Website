// src/utils/agentResultCache.ts
// Cache individual agent results to avoid re-running agents when only one metric type changes

import type { AgentInsight } from "@/agents/types";

const STORAGE_KEY = "amach_agent_result_cache_v1";
const MAX_CACHE_SIZE = 50; // Limit cache size to avoid localStorage quota issues

interface AgentCacheEntry {
  v: number; // version
  agentId: string;
  fingerprint: string; // Hash of agent-specific data
  result: AgentInsight;
  createdAtMs: number;
}

interface AgentCacheFingerprint {
  agentId: string;
  metricTypes: string[]; // Which metric types this agent uses
  earliestMs: number | null;
  latestMs: number | null;
  reportsCount: number;
  analysisMode: "initial" | "ongoing";
}

function makeAgentCacheKey(params: AgentCacheFingerprint): string {
  // Create a stable fingerprint for this agent's input data
  const parts = [
    params.agentId,
    params.analysisMode,
    params.metricTypes.sort().join(","),
    params.earliestMs ?? "null",
    params.latestMs ?? "null",
    params.reportsCount,
  ];
  return parts.join("|");
}

function getAgentFingerprint(
  agentId: string,
  availableData: {
    appleHealth?: Record<string, unknown[]>;
    reports?: unknown[];
  },
  analysisMode: "initial" | "ongoing",
): AgentCacheFingerprint {
  // Map each agent to the metric types it actually uses
  const agentMetricMap: Record<string, string[]> = {
    sleep: ["HKCategoryTypeIdentifierSleepAnalysis"],
    activity_energy: [
      "HKQuantityTypeIdentifierStepCount",
      "HKQuantityTypeIdentifierActiveEnergyBurned",
      "HKQuantityTypeIdentifierAppleExerciseTime",
    ],
    cardiovascular: [
      "HKQuantityTypeIdentifierHeartRate",
      "HKQuantityTypeIdentifierRestingHeartRate",
      "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
      "HKQuantityTypeIdentifierVO2Max",
    ],
    recovery_stress: [
      "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
      "HKQuantityTypeIdentifierRestingHeartRate",
      "HKQuantityTypeIdentifierRespiratoryRate",
      "HKCategoryTypeIdentifierSleepAnalysis",
    ],
    dexa: [], // Uses reports, not metrics
    bloodwork: [], // Uses reports, not metrics
  };

  const relevantMetrics = agentMetricMap[agentId] ?? [];
  const metricTypes = relevantMetrics.filter(
    (m) => availableData.appleHealth?.[m]?.length,
  );

  // Calculate time range from relevant metrics
  let earliestMs: number | null = null;
  let latestMs: number | null = null;

  for (const metricType of metricTypes) {
    const samples = availableData.appleHealth?.[metricType] as
      | Array<{ timestamp: Date | number }>
      | undefined;
    if (!samples?.length) continue;

    for (const sample of samples) {
      const ts =
        sample.timestamp instanceof Date
          ? sample.timestamp.getTime()
          : typeof sample.timestamp === "number"
            ? sample.timestamp
            : null;
      if (ts === null) continue;
      if (earliestMs === null || ts < earliestMs) earliestMs = ts;
      if (latestMs === null || ts > latestMs) latestMs = ts;
    }
  }

  return {
    agentId,
    metricTypes,
    earliestMs,
    latestMs,
    reportsCount: availableData.reports?.length ?? 0,
    analysisMode,
  };
}

export function getCachedAgentResult(params: {
  agentId: string;
  availableData: {
    appleHealth?: Record<string, unknown[]>;
    reports?: unknown[];
  };
  analysisMode: "initial" | "ongoing";
  maxAgeMs: number;
}): AgentInsight | null {
  if (typeof window === "undefined") return null;

  const fingerprint = getAgentFingerprint(
    params.agentId,
    params.availableData,
    params.analysisMode,
  );
  const key = makeAgentCacheKey(fingerprint);

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const cache = JSON.parse(raw) as Record<string, AgentCacheEntry>;
    const entry = cache[key];

    if (!entry) return null;
    if (entry.v !== 1) return null;
    if (entry.agentId !== params.agentId) return null;

    const age = Date.now() - entry.createdAtMs;
    if (age > params.maxAgeMs) {
      delete cache[key];
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
      return null;
    }

    if (process.env.NODE_ENV === "development") {
      console.log(
        `[AgentCache] HIT agent=${params.agentId} age=${Math.round(age / 1000)}s`,
      );
    }

    return entry.result;
  } catch (error) {
    console.warn("[AgentCache] Failed to read cache:", error);
    return null;
  }
}

export function setCachedAgentResult(params: {
  agentId: string;
  availableData: {
    appleHealth?: Record<string, unknown[]>;
    reports?: unknown[];
  };
  analysisMode: "initial" | "ongoing";
  result: AgentInsight;
}): void {
  if (typeof window === "undefined") return;

  const fingerprint = getAgentFingerprint(
    params.agentId,
    params.availableData,
    params.analysisMode,
  );
  const key = makeAgentCacheKey(fingerprint);

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const cache: Record<string, AgentCacheEntry> = raw ? JSON.parse(raw) : {};

    // Prune large fields to avoid localStorage quota issues
    const prunedResult: AgentInsight = {
      ...params.result,
      rawResponse: undefined, // Can be very large
      dataPoints: [], // Not needed for caching
    };

    cache[key] = {
      v: 1,
      agentId: params.agentId,
      fingerprint: key,
      result: prunedResult,
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
        `[AgentCache] STORE agent=${params.agentId} key=${key.substring(0, 50)}...`,
      );
    }
  } catch (error) {
    // localStorage quota exceeded or other error - silently fail
    if (process.env.NODE_ENV === "development") {
      console.warn("[AgentCache] Failed to write cache:", error);
    }
  }
}

export function clearAgentResultCache(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn("[AgentCache] Failed to clear cache:", error);
  }
}
