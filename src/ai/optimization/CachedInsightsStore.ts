/**
 * CachedInsightsStore - Persistent cache for coordinator/agent analysis results
 *
 * Key features:
 * - Data-hash based invalidation (not just time-based)
 * - 4-hour maximum TTL as backup expiration
 * - Stores full coordinator result for instant retrieval
 * - Safari-compatible localStorage implementation
 */

import type { CoordinatorResult } from "@/agents/CoordinatorAgent";
import type { DataFingerprint } from "./DataHasher";
import { DataHasher } from "./DataHasher";
import { getFeatureFlags } from "@/config/featureFlags";

interface CacheEntry {
  version: number;
  dataFingerprint: DataFingerprint;
  timestamp: number;
  analysisMode: "initial" | "ongoing";
  result: CoordinatorResult;
}

const CACHE_KEY = "amach_coordinator_cache_v2";
const CACHE_VERSION = 2;
const MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Result of a cache lookup
 */
export interface CacheLookupResult {
  hit: boolean;
  result: CoordinatorResult | null;
  reason:
    | "hit"
    | "miss_empty"
    | "miss_hash_changed"
    | "miss_expired"
    | "miss_version"
    | "miss_error";
  ageMs?: number;
  cachedFingerprint?: DataFingerprint;
}

export class CachedInsightsStore {
  /**
   * Look up cached coordinator result (instance method)
   */
  async get(currentFingerprint: DataFingerprint): Promise<CacheLookupResult> {
    return CachedInsightsStore.get(currentFingerprint);
  }

  /**
   * Store coordinator result in cache (instance method)
   */
  async set(
    fingerprint: DataFingerprint,
    result: CoordinatorResult,
    analysisMode: "initial" | "ongoing" = "ongoing",
  ): Promise<void> {
    CachedInsightsStore.set(fingerprint, result, analysisMode);
  }

  /**
   * Look up cached coordinator result
   *
   * @param currentFingerprint - Fingerprint of current health data
   * @returns Cache lookup result with hit/miss information
   */
  static get(currentFingerprint: DataFingerprint): CacheLookupResult {
    const flags = getFeatureFlags();

    if (typeof window === "undefined") {
      return { hit: false, result: null, reason: "miss_empty" };
    }

    try {
      const stored = localStorage.getItem(CACHE_KEY);
      if (!stored) {
        if (flags.logCacheHits) {
          console.log("[CachedInsightsStore] Cache miss: no cached data");
        }
        return { hit: false, result: null, reason: "miss_empty" };
      }

      const entry: CacheEntry = JSON.parse(stored);

      // Check version compatibility
      if (entry.version !== CACHE_VERSION) {
        if (flags.logCacheHits) {
          console.log("[CachedInsightsStore] Cache miss: version mismatch", {
            cached: entry.version,
            current: CACHE_VERSION,
          });
        }
        this.clear();
        return { hit: false, result: null, reason: "miss_version" };
      }

      // Check data hash first (primary invalidation method)
      if (
        !DataHasher.fingerprintsMatch(entry.dataFingerprint, currentFingerprint)
      ) {
        if (flags.logCacheHits) {
          console.log("[CachedInsightsStore] Cache miss: data hash changed", {
            cached: entry.dataFingerprint.hash,
            current: currentFingerprint.hash,
            cachedPoints: entry.dataFingerprint.totalDataPoints,
            currentPoints: currentFingerprint.totalDataPoints,
          });
        }
        return {
          hit: false,
          result: null,
          reason: "miss_hash_changed",
          cachedFingerprint: entry.dataFingerprint,
        };
      }

      // Check age (backup expiration)
      const ageMs = Date.now() - entry.timestamp;
      if (ageMs > MAX_AGE_MS) {
        if (flags.logCacheHits) {
          console.log("[CachedInsightsStore] Cache miss: expired", {
            ageMs,
            maxAgeMs: MAX_AGE_MS,
            ageHours: (ageMs / (60 * 60 * 1000)).toFixed(1),
          });
        }
        return { hit: false, result: null, reason: "miss_expired", ageMs };
      }

      // Cache hit!
      if (flags.logCacheHits) {
        console.log("[CachedInsightsStore] Cache HIT!", {
          ageMinutes: Math.round(ageMs / 60000),
          analysisMode: entry.analysisMode,
          agentCount: Object.keys(entry.result.agentInsights).length,
          hasSummary: Boolean(entry.result.combinedSummary),
        });
      }

      return {
        hit: true,
        result: entry.result,
        reason: "hit",
        ageMs,
        cachedFingerprint: entry.dataFingerprint,
      };
    } catch (error) {
      console.warn("[CachedInsightsStore] Error reading cache:", error);
      return { hit: false, result: null, reason: "miss_error" };
    }
  }

  /**
   * Store coordinator result in cache
   *
   * @param fingerprint - Data fingerprint at time of analysis
   * @param result - Coordinator analysis result
   * @param analysisMode - Whether this was initial or ongoing analysis
   */
  static set(
    fingerprint: DataFingerprint,
    result: CoordinatorResult,
    analysisMode: "initial" | "ongoing",
  ): void {
    const flags = getFeatureFlags();

    if (typeof window === "undefined") return;

    const entry: CacheEntry = {
      version: CACHE_VERSION,
      dataFingerprint: fingerprint,
      timestamp: Date.now(),
      analysisMode,
      result,
    };

    try {
      const json = JSON.stringify(entry);

      // Check size before storing (Safari has ~5MB limit)
      const sizeKB = json.length / 1024;
      if (sizeKB > 2000) {
        console.warn("[CachedInsightsStore] Cache entry too large:", {
          sizeKB: sizeKB.toFixed(1),
          agentCount: Object.keys(result.agentInsights).length,
        });
        // Still try to store, but warn
      }

      localStorage.setItem(CACHE_KEY, json);

      if (flags.logCacheHits) {
        console.log("[CachedInsightsStore] Cached insights", {
          hash: fingerprint.hash,
          analysisMode,
          agentCount: Object.keys(result.agentInsights).length,
          sizeKB: sizeKB.toFixed(1),
        });
      }
    } catch (error) {
      // Handle quota exceeded (Safari is particularly strict)
      if (error instanceof Error && error.name === "QuotaExceededError") {
        console.warn(
          "[CachedInsightsStore] Storage quota exceeded, clearing old data",
        );
        this.clear();
        // Try once more with cleared storage
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
        } catch {
          console.error(
            "[CachedInsightsStore] Failed to cache even after clearing",
          );
        }
      } else {
        console.error("[CachedInsightsStore] Failed to write cache:", error);
      }
    }
  }

  /**
   * Clear the cache
   */
  static clear(): void {
    if (typeof window === "undefined") return;

    try {
      localStorage.removeItem(CACHE_KEY);
      console.log("[CachedInsightsStore] Cache cleared");
    } catch (error) {
      console.warn("[CachedInsightsStore] Failed to clear cache:", error);
    }
  }

  /**
   * Get cache statistics (for debugging)
   */
  static getStats(): {
    hasCache: boolean;
    ageMs?: number;
    analysisMode?: string;
    agentCount?: number;
    sizeKB?: number;
  } {
    if (typeof window === "undefined") {
      return { hasCache: false };
    }

    try {
      const stored = localStorage.getItem(CACHE_KEY);
      if (!stored) {
        return { hasCache: false };
      }

      const entry: CacheEntry = JSON.parse(stored);
      return {
        hasCache: true,
        ageMs: Date.now() - entry.timestamp,
        analysisMode: entry.analysisMode,
        agentCount: Object.keys(entry.result.agentInsights).length,
        sizeKB: stored.length / 1024,
      };
    } catch {
      return { hasCache: false };
    }
  }

  /**
   * Invalidate cache if data has changed
   * Returns true if cache was invalidated
   */
  static invalidateIfChanged(currentFingerprint: DataFingerprint): boolean {
    const lookup = this.get(currentFingerprint);
    if (lookup.reason === "miss_hash_changed") {
      this.clear();
      return true;
    }
    return false;
  }
}
