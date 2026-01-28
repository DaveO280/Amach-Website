// src/utils/veniceResponseCache.ts
// Cache Venice API responses to avoid redundant calls with identical prompts

const STORAGE_KEY = "amach_venice_response_cache_v1";
const MAX_CACHE_SIZE = 100; // Limit cache size to avoid localStorage quota issues
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes default TTL

interface CacheEntry {
  v: number; // version
  requestHash: string;
  response: string;
  createdAtMs: number;
  maxTokens: number;
  temperature: number;
}

function hashRequest(params: {
  messages: Array<{ role: string; content: string }>;
  maxTokens: number;
  temperature: number;
  model: string;
  veniceParameters?: Record<string, unknown>;
}): string {
  // Create a stable hash of the request
  // Exclude timestamps and other non-deterministic fields
  const key = JSON.stringify({
    messages: params.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    maxTokens: params.maxTokens,
    temperature: params.temperature,
    model: params.model,
    veniceParams: params.veniceParameters,
  });

  // Simple hash function (for browser compatibility)
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `venice_${Math.abs(hash).toString(36)}`;
}

export function getCachedVeniceResponse(params: {
  messages: Array<{ role: string; content: string }>;
  maxTokens: number;
  temperature: number;
  model: string;
  veniceParameters?: Record<string, unknown>;
  maxAgeMs?: number;
}): string | null {
  if (typeof window === "undefined") return null;

  const requestHash = hashRequest(params);
  const maxAgeMs = params.maxAgeMs ?? DEFAULT_TTL_MS;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const cache = JSON.parse(raw) as Record<string, CacheEntry>;
    const entry = cache[requestHash];

    if (!entry) return null;
    if (entry.v !== 1) return null;

    const age = Date.now() - entry.createdAtMs;
    if (age > maxAgeMs) {
      delete cache[requestHash];
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
      return null;
    }

    // Verify request parameters match (safety check)
    if (
      entry.maxTokens !== params.maxTokens ||
      entry.temperature !== params.temperature
    ) {
      return null;
    }

    if (process.env.NODE_ENV === "development") {
      console.log(
        `[VeniceResponseCache] HIT hash=${requestHash.substring(0, 12)}... age=${Math.round(age / 1000)}s`,
      );
    }

    return entry.response;
  } catch (error) {
    console.warn("[VeniceResponseCache] Failed to read cache:", error);
    return null;
  }
}

export function setCachedVeniceResponse(params: {
  messages: Array<{ role: string; content: string }>;
  maxTokens: number;
  temperature: number;
  model: string;
  veniceParameters?: Record<string, unknown>;
  response: string;
}): void {
  if (typeof window === "undefined") return;

  const requestHash = hashRequest(params);

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const cache: Record<string, CacheEntry> = raw ? JSON.parse(raw) : {};

    cache[requestHash] = {
      v: 1,
      requestHash,
      response: params.response,
      createdAtMs: Date.now(),
      maxTokens: params.maxTokens,
      temperature: params.temperature,
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
        `[VeniceResponseCache] STORE hash=${requestHash.substring(0, 12)}... length=${params.response.length}`,
      );
    }
  } catch (error) {
    // localStorage quota exceeded or other error - silently fail
    if (process.env.NODE_ENV === "development") {
      console.warn("[VeniceResponseCache] Failed to write cache:", error);
    }
  }
}

export function clearVeniceResponseCache(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn("[VeniceResponseCache] Failed to clear cache:", error);
  }
}
