import type { CoordinatorResult } from "@/agents/CoordinatorAgent";
import type { AnalysisMode } from "@/services/CoordinatorService";

export type CoordinatorAnalysisFingerprint = {
  analysisMode: AnalysisMode;
  metricTypesCount: number;
  earliestMs: number | null;
  latestMs: number | null;
  reportsCount: number;
};

type CacheEntry = {
  v: 2;
  createdAtMs: number;
  fingerprint: CoordinatorAnalysisFingerprint;
  result: CoordinatorResult | null;
};

const STORAGE_KEY = "amach_coordinator_analysis_cache_v2";

declare global {
  interface Window {
    __amachCoordinatorAnalysisCacheV2?: CacheEntry | null;
  }
}

let memoryCache: CacheEntry | null = null;
const CACHE_BUILD_STAMP = "coordinator-cache-2026-01-27Tdebug-v1";
let didLogBuildStamp = false;

function normalizeEpochMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  // Some older builds may have stored seconds instead of ms.
  // Anything below ~2001-09-09 in ms (1e12 is ~2001) is almost certainly seconds.
  if (value > 0 && value < 1e11) return Math.floor(value * 1000);
  return Math.floor(value);
}

function getWindowCache(): CacheEntry | null {
  if (typeof window === "undefined") return null;
  return window.__amachCoordinatorAnalysisCacheV2 ?? null;
}

function setWindowCache(entry: CacheEntry | null): void {
  if (typeof window === "undefined") return;
  window.__amachCoordinatorAnalysisCacheV2 = entry;
}

function pruneResultForCache(
  result: CoordinatorResult | null,
): CoordinatorResult | null {
  if (!result) return null;
  // Coordinator synthesis is what we actually use in the deep prompt; keep it.
  // Agent raw responses and dataPoints can be very large and are not needed for prompt assembly.
  const prunedInsights = Object.fromEntries(
    Object.entries(result.agentInsights ?? {}).map(([agentId, insight]) => [
      agentId,
      {
        ...insight,
        dataPoints: [],
        rawResponse: undefined,
        metadata: undefined,
      },
    ]),
  ) as CoordinatorResult["agentInsights"];

  return {
    profile: result.profile,
    combinedSummary: result.combinedSummary ?? null,
    agentInsights: prunedInsights,
    rawSummary: undefined,
  };
}

export function getCachedCoordinatorResult(params: {
  fingerprint: CoordinatorAnalysisFingerprint;
  maxAgeMs: number;
}): CoordinatorResult | null {
  const now = Date.now();

  if (process.env.NODE_ENV === "development" && !didLogBuildStamp) {
    didLogBuildStamp = true;
    console.log("[CoordinatorAnalysisCache] Build", {
      build: CACHE_BUILD_STAMP,
      hasWindow: typeof window !== "undefined",
    });
  }

  const matches = (entry: CacheEntry): boolean => {
    if (now - entry.createdAtMs > params.maxAgeMs) return false;
    return (
      entry.fingerprint.analysisMode === params.fingerprint.analysisMode &&
      entry.fingerprint.metricTypesCount ===
        params.fingerprint.metricTypesCount &&
      entry.fingerprint.earliestMs === params.fingerprint.earliestMs &&
      entry.fingerprint.latestMs === params.fingerprint.latestMs &&
      entry.fingerprint.reportsCount === params.fingerprint.reportsCount
    );
  };

  if (memoryCache && matches(memoryCache)) {
    if (process.env.NODE_ENV === "development") {
      console.log("[CoordinatorAnalysisCache] Hit (module memory)", {
        fingerprint: params.fingerprint,
      });
    }
    return memoryCache.result ?? null;
  }

  if (typeof window === "undefined") return null;

  const w = getWindowCache();
  if (w && matches(w)) {
    memoryCache = w;
    if (process.env.NODE_ENV === "development") {
      console.log(
        `[CoordinatorAnalysisCache] Hit (window memory) ${JSON.stringify({
          fingerprint: params.fingerprint,
        })}`,
      );
    }
    return w.result ?? null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      if (process.env.NODE_ENV === "development") {
        console.log(
          `[CoordinatorAnalysisCache] Miss (no localStorage entry) ${JSON.stringify(
            {
              fingerprint: params.fingerprint,
            },
          )}`,
        );
      }
      return null;
    }
    const parsed = JSON.parse(raw) as CacheEntry;
    if (!parsed || parsed.v !== 2) {
      if (process.env.NODE_ENV === "development") {
        console.log(
          `[CoordinatorAnalysisCache] Miss (version mismatch) ${JSON.stringify({
            fingerprint: params.fingerprint,
            cachedVersion: (parsed as { v?: unknown } | null)?.v ?? null,
          })}`,
        );
      }
      return null;
    }

    const createdAtMs = normalizeEpochMs(
      (parsed as { createdAtMs?: unknown }).createdAtMs,
    );
    if (createdAtMs === null) {
      if (process.env.NODE_ENV === "development") {
        console.log(
          `[CoordinatorAnalysisCache] Miss (invalid createdAtMs) ${JSON.stringify(
            {
              fingerprint: params.fingerprint,
              cachedCreatedAtMs:
                (parsed as { createdAtMs?: unknown }).createdAtMs ?? null,
            },
          )}`,
        );
      }
      return null;
    }

    const ageMs = now - createdAtMs;
    if (ageMs > params.maxAgeMs) {
      if (process.env.NODE_ENV === "development") {
        console.log(
          `[CoordinatorAnalysisCache] Miss (expired) ${JSON.stringify({
            fingerprint: params.fingerprint,
            cachedCreatedAtMs: createdAtMs,
            nowMs: now,
            ageMs,
            maxAgeMs: params.maxAgeMs,
          })}`,
        );
      }
      return null;
    }
    if (!matches(parsed)) {
      if (process.env.NODE_ENV === "development") {
        console.log(
          `[CoordinatorAnalysisCache] Miss (fingerprint mismatch) ${JSON.stringify(
            {
              requested: params.fingerprint,
              cached: parsed.fingerprint,
              cachedCreatedAtMs: createdAtMs,
              nowMs: now,
              ageMs,
              maxAgeMs: params.maxAgeMs,
            },
          )}`,
        );
      }
      return null;
    }
    // Normalize createdAtMs in-memory for any later checks.
    memoryCache = { ...parsed, createdAtMs };
    setWindowCache(parsed);
    if (process.env.NODE_ENV === "development") {
      console.log(
        `[CoordinatorAnalysisCache] Hit (localStorage) ${JSON.stringify({
          fingerprint: params.fingerprint,
          cachedCreatedAtMs: createdAtMs,
          ageMs,
        })}`,
      );
    }
    return parsed.result ?? null;
  } catch {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[CoordinatorAnalysisCache] Miss (localStorage parse error)",
        {
          fingerprint: params.fingerprint,
        },
      );
    }
    return null;
  }
}

export function setCachedCoordinatorResult(params: {
  fingerprint: CoordinatorAnalysisFingerprint;
  result: CoordinatorResult | null;
}): void {
  const pruned = pruneResultForCache(params.result);
  const entry: CacheEntry = {
    v: 2,
    createdAtMs: Date.now(),
    fingerprint: params.fingerprint,
    result: pruned,
  };
  memoryCache = entry;
  setWindowCache(entry);

  if (typeof window === "undefined") return;
  try {
    const raw = JSON.stringify(entry);
    window.localStorage.setItem(STORAGE_KEY, raw);
    if (process.env.NODE_ENV === "development") {
      console.log(
        `[CoordinatorAnalysisCache] Saved ${JSON.stringify({
          bytes: raw.length,
          createdAtMs: entry.createdAtMs,
          fingerprint: params.fingerprint,
          hasSummary: Boolean(pruned?.combinedSummary),
          agentCount: pruned ? Object.keys(pruned.agentInsights).length : 0,
        })}`,
      );
    }
  } catch {
    // ignore (quota / disabled storage)
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[CoordinatorAnalysisCache] Failed to persist to localStorage",
      );
    }
  }
}

export function clearCoordinatorAnalysisCache(): void {
  memoryCache = null;
  setWindowCache(null);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
