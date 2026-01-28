import type { ToolCall, ToolResult } from "@/ai/tools/ToolExecutor";

export type ToolCacheDataFingerprint = {
  analysisMode: "initial" | "ongoing";
  metricTypesCount: number;
  earliestMs: number | null;
  latestMs: number | null;
  reportsCount: number;
};

type CacheEntry = {
  createdAtMs: number;
  key: string;
  result: ToolResult;
  bytes: number;
};

declare global {
  interface Window {
    __amachToolResultCacheV1?: Map<string, CacheEntry>;
  }
}

const MAX_ENTRIES = 80;
const MAX_ENTRY_BYTES = 250_000; // avoid caching huge payloads

let moduleCache: Map<string, CacheEntry> | null = null;

function getCacheMap(): Map<string, CacheEntry> {
  if (!moduleCache) moduleCache = new Map();
  if (typeof window === "undefined") return moduleCache;
  if (!window.__amachToolResultCacheV1) {
    window.__amachToolResultCacheV1 = moduleCache;
  }
  return window.__amachToolResultCacheV1;
}

function stableStringify(value: unknown): string {
  // Deterministic JSON stringify for simple objects (sufficient for our params).
  const seen = new WeakSet<object>();
  const recur = (v: unknown): unknown => {
    if (v && typeof v === "object") {
      if (seen.has(v as object)) return "[Circular]";
      seen.add(v as object);
      if (Array.isArray(v)) return v.map(recur);
      const obj = v as Record<string, unknown>;
      const keys = Object.keys(obj).sort();
      const out: Record<string, unknown> = {};
      for (const k of keys) out[k] = recur(obj[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(recur(value));
}

export function makeToolCacheKey(params: {
  toolCall: ToolCall;
  fingerprint: ToolCacheDataFingerprint;
}): string {
  return stableStringify({
    tool: params.toolCall.tool,
    params: params.toolCall.params ?? {},
    fp: params.fingerprint,
  });
}

function evictIfNeeded(map: Map<string, CacheEntry>): void {
  if (map.size <= MAX_ENTRIES) return;
  // Evict oldest entries first.
  const entries = Array.from(map.values()).sort(
    (a, b) => a.createdAtMs - b.createdAtMs,
  );
  const toRemove = Math.max(0, map.size - MAX_ENTRIES);
  for (let i = 0; i < toRemove; i++) {
    const e = entries[i];
    if (e) map.delete(e.key);
  }
}

export function getCachedToolResult(params: {
  key: string;
  maxAgeMs: number;
}): ToolResult | null {
  const map = getCacheMap();
  const entry = map.get(params.key);
  if (!entry) return null;
  if (Date.now() - entry.createdAtMs > params.maxAgeMs) {
    map.delete(params.key);
    return null;
  }
  return entry.result;
}

export function setCachedToolResult(params: {
  key: string;
  result: ToolResult;
}): void {
  const map = getCacheMap();
  const raw = JSON.stringify(params.result);
  const bytes = raw.length;
  if (bytes > MAX_ENTRY_BYTES) return;

  map.set(params.key, {
    key: params.key,
    createdAtMs: Date.now(),
    result: params.result,
    bytes,
  });
  evictIfNeeded(map);
}
