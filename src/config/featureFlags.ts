/**
 * Feature Flag System for AI Optimization
 *
 * Enables gradual rollout of new AI features without breaking existing functionality.
 * Flags can be controlled via:
 * 1. Environment variables (for deployment-wide settings)
 * 2. localStorage (for testing and per-user overrides)
 *
 * Usage:
 *   const flags = getFeatureFlags();
 *   if (flags.useCachedAgentInsights) { ... }
 *
 * Dev Tools:
 *   Press Ctrl+Shift+F to open the feature flag panel (development only)
 *   Or use: setFeatureFlag('useCachedAgentInsights', true)
 */

export interface FeatureFlags {
  // === Phase 1: Cache Optimization ===
  /** Use data-hash based caching for coordinator/agent insights (4hr TTL) */
  useCachedAgentInsights: boolean;
  /** Pre-compute daily metric summaries on data load */
  usePreComputedMetrics: boolean;

  // === Phase 2: Memory Structure ===
  /** Generate and store daily health logs */
  useDailyLogs: boolean;
  /** Use curated long-term health profile */
  useHealthProfile: boolean;

  // === Phase 3: Search ===
  /** Enable hybrid vector + keyword search for context retrieval */
  useHybridSearch: boolean;

  // === Phase 4: Curation ===
  /** Enable automatic insight curation from conversations */
  useAutoCuration: boolean;

  // === Master Switch ===
  /** Use fully optimized AI pipeline (V2) */
  useOptimizedAI: boolean;

  // === Rollout Control ===
  /** Percentage of users (0-100) who get the optimized AI */
  optimizedAIPercentage: number;

  // === Debug Flags ===
  /** Log memory operations to console */
  logMemoryOperations: boolean;
  /** Log search queries and results to console */
  logSearchQueries: boolean;
  /** Log cache hits/misses to console */
  logCacheHits: boolean;
}

const STORAGE_KEY = "amach_feature_flags";
const USER_ID_KEY = "amach_user_id";

/**
 * Default flag values - all optimizations disabled by default
 */
const defaultFlags: FeatureFlags = {
  // Phase 1
  useCachedAgentInsights: false,
  usePreComputedMetrics: false,

  // Phase 2
  useDailyLogs: false,
  useHealthProfile: false,

  // Phase 3
  useHybridSearch: false,

  // Phase 4
  useAutoCuration: false,

  // Master switch
  useOptimizedAI: false,

  // Rollout
  optimizedAIPercentage: 0,

  // Debug (enabled by default in development)
  logMemoryOperations: process.env.NODE_ENV === "development",
  logSearchQueries: process.env.NODE_ENV === "development",
  logCacheHits: process.env.NODE_ENV === "development",
};

/**
 * Simple hash function for user ID bucketing
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Get or create a stable user ID for rollout bucketing
 */
function getUserId(): string {
  if (typeof window === "undefined") return "";

  let userId = localStorage.getItem(USER_ID_KEY);
  if (!userId) {
    userId = `user_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(USER_ID_KEY, userId);
  }
  return userId;
}

/**
 * Check if current user is in the rollout percentage
 */
function isInRolloutPercentage(percentage: number): boolean {
  if (percentage <= 0) return false;
  if (percentage >= 100) return true;

  const userId = getUserId();
  const bucket = hashString(userId) % 100;
  return bucket < percentage;
}

/**
 * Load flags from environment variables
 */
function loadEnvFlags(): Partial<FeatureFlags> {
  const envFlags: Partial<FeatureFlags> = {};

  // Check for environment variable overrides
  if (process.env.NEXT_PUBLIC_USE_CACHED_AGENT_INSIGHTS === "true") {
    envFlags.useCachedAgentInsights = true;
  }
  if (process.env.NEXT_PUBLIC_USE_PRE_COMPUTED_METRICS === "true") {
    envFlags.usePreComputedMetrics = true;
  }
  if (process.env.NEXT_PUBLIC_USE_OPTIMIZED_AI === "true") {
    envFlags.useOptimizedAI = true;
  }

  const rolloutPercentage = process.env.NEXT_PUBLIC_OPTIMIZED_AI_PERCENTAGE;
  if (rolloutPercentage) {
    const parsed = parseInt(rolloutPercentage, 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
      envFlags.optimizedAIPercentage = parsed;
    }
  }

  return envFlags;
}

/**
 * Load flags from localStorage
 */
function loadStoredFlags(): Partial<FeatureFlags> {
  if (typeof window === "undefined") return {};

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.warn("[FeatureFlags] Failed to parse stored flags:", error);
  }

  return {};
}

/**
 * Get current feature flags
 *
 * Priority:
 * 1. localStorage overrides (highest - for testing)
 * 2. Environment variables
 * 3. Rollout percentage calculation
 * 4. Default values (lowest)
 */
export function getFeatureFlags(): FeatureFlags {
  const envFlags = loadEnvFlags();
  const storedFlags = loadStoredFlags();

  // Merge in priority order
  const flags: FeatureFlags = {
    ...defaultFlags,
    ...envFlags,
    ...storedFlags,
  };

  // Apply rollout percentage if no explicit override
  if (
    storedFlags.useOptimizedAI === undefined &&
    envFlags.useOptimizedAI === undefined
  ) {
    flags.useOptimizedAI = isInRolloutPercentage(flags.optimizedAIPercentage);
  }

  return flags;
}

/**
 * Set a feature flag value (persisted to localStorage)
 */
export function setFeatureFlag<K extends keyof FeatureFlags>(
  flag: K,
  value: FeatureFlags[K],
): void {
  if (typeof window === "undefined") return;

  try {
    const current = loadStoredFlags();
    const updated = { ...current, [flag]: value };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

    // Dispatch event for reactive updates
    window.dispatchEvent(
      new CustomEvent("feature-flags-updated", {
        detail: { flag, value },
      }),
    );

    console.log(`[FeatureFlags] Set ${flag} = ${value}`);
  } catch (error) {
    console.error("[FeatureFlags] Failed to set flag:", error);
  }
}

/**
 * Reset all feature flags to defaults
 */
export function resetFeatureFlags(): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("feature-flags-updated"));
    console.log("[FeatureFlags] Reset to defaults");
  } catch (error) {
    console.error("[FeatureFlags] Failed to reset flags:", error);
  }
}

/**
 * Enable all Phase 1 optimizations
 */
export function enablePhase1(): void {
  setFeatureFlag("useCachedAgentInsights", true);
  setFeatureFlag("usePreComputedMetrics", true);
}

/**
 * Enable all optimizations (for testing)
 */
export function enableAllOptimizations(): void {
  setFeatureFlag("useCachedAgentInsights", true);
  setFeatureFlag("usePreComputedMetrics", true);
  setFeatureFlag("useDailyLogs", true);
  setFeatureFlag("useHealthProfile", true);
  setFeatureFlag("useHybridSearch", true);
  setFeatureFlag("useAutoCuration", true);
  setFeatureFlag("useOptimizedAI", true);
}

/**
 * Disable all optimizations (emergency rollback)
 */
export function disableAllOptimizations(): void {
  setFeatureFlag("useCachedAgentInsights", false);
  setFeatureFlag("usePreComputedMetrics", false);
  setFeatureFlag("useDailyLogs", false);
  setFeatureFlag("useHealthProfile", false);
  setFeatureFlag("useHybridSearch", false);
  setFeatureFlag("useAutoCuration", false);
  setFeatureFlag("useOptimizedAI", false);
}

/**
 * Check if a specific optimization phase is enabled
 */
export function isPhaseEnabled(phase: 1 | 2 | 3 | 4): boolean {
  const flags = getFeatureFlags();

  switch (phase) {
    case 1:
      return flags.useCachedAgentInsights || flags.usePreComputedMetrics;
    case 2:
      return flags.useDailyLogs || flags.useHealthProfile;
    case 3:
      return flags.useHybridSearch;
    case 4:
      return flags.useAutoCuration;
    default:
      return false;
  }
}

/**
 * Log current feature flag state (for debugging)
 */
export function logFeatureFlags(): void {
  const flags = getFeatureFlags();
  console.log("[FeatureFlags] Current state:", flags);
}
