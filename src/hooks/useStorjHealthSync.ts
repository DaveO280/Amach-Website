"use client";

/**
 * useStorjHealthSync
 *
 * PRIMARY PURPOSE: Cache the wallet encryption key via getCachedWalletEncryptionKey
 * so that useStorjAppleHealthQuery (which checks the same cache) can start fetching
 * the full Storj history without prompting a second wallet signature.
 *
 * SECONDARY PURPOSE: Seed IndexedDB with converted daily summaries from Storj.
 * As of PR #83, HealthDataContextWrapper uses metricData = storjHealthData directly
 * (Storj-native), so IndexedDB is no longer the source of truth for dashboard metrics.
 * The IndexedDB write here still serves HealthDataProcessor (used by AI agents) and
 * acts as a fallback when the Storj query is unavailable.
 *
 * Sync is attempted once per wallet address per page session.
 */

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { healthDataStore } from "@/data/store/healthDataStore";
import type {
  HealthDataResults,
  HealthMetric,
} from "@/data/types/healthMetrics";
import type { SleepStage } from "@/data/types/healthMetrics";
import type {
  AppleHealthStorjPayload,
  DailySummaryValue,
  SleepSummary,
} from "@/storage/appleHealth/AppleHealthStorjService";
import type { WalletEncryptionKey } from "@/utils/walletEncryption";
import { useWalletService } from "@/hooks/useWalletService";

// ---------------------------------------------------------------------------
// Metric map: normalizedKey -> { appleId, unit }
// Keys are produced by AppleHealthStorjService via normalizeMetricKey().
// ---------------------------------------------------------------------------
const METRIC_MAP: Record<
  string,
  { appleId: string; unit: HealthMetric["unit"] }
> = {
  heartRate: {
    appleId: "HKQuantityTypeIdentifierHeartRate",
    unit: "bpm",
  },
  stepCount: {
    appleId: "HKQuantityTypeIdentifierStepCount",
    unit: "count",
  },
  heartRateVariabilitySDNN: {
    appleId: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
    unit: "ms",
  },
  respiratoryRate: {
    appleId: "HKQuantityTypeIdentifierRespiratoryRate",
    unit: "count/min",
  },
  appleExerciseTime: {
    appleId: "HKQuantityTypeIdentifierAppleExerciseTime",
    unit: "min",
  },
  vO2Max: {
    appleId: "HKQuantityTypeIdentifierVO2Max",
    unit: "ml/(kg*min)",
  },
  restingHeartRate: {
    appleId: "HKQuantityTypeIdentifierRestingHeartRate",
    unit: "bpm",
  },
  activeEnergyBurned: {
    appleId: "HKQuantityTypeIdentifierActiveEnergyBurned",
    unit: "kcal",
  },
};

// ---------------------------------------------------------------------------
// Extract the best numeric value from a DailySummaryValue
// ---------------------------------------------------------------------------
function extractNumericValue(
  raw: DailySummaryValue | SleepSummary | number | undefined,
): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return raw;
  if (typeof raw === "object") {
    const v = raw as Record<string, unknown>;
    const candidate = v["avg"] ?? v["total"];
    return typeof candidate === "number" ? candidate : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Convert dailySummaries from Storj payload → HealthDataResults (IndexedDB fmt)
// ---------------------------------------------------------------------------
function convertDailySummariesToHealthData(
  dailySummaries: AppleHealthStorjPayload["dailySummaries"],
): HealthDataResults {
  const result: HealthDataResults = {};

  for (const [dateKey, daySummary] of Object.entries(dailySummaries)) {
    for (const [metricKey, rawValue] of Object.entries(daySummary)) {
      // ── Sleep ──────────────────────────────────────────────────────────
      if (metricKey === "sleep" || metricKey === "sleepAnalysis") {
        if (!rawValue || typeof rawValue !== "object") continue;

        const ss = rawValue as SleepSummary;
        const HK_SLEEP = "HKCategoryTypeIdentifierSleepAnalysis";
        if (!result[HK_SLEEP]) result[HK_SLEEP] = [];

        // Reconstruct per-stage records placed BACKWARD from 07:00 UTC (wake time),
        // matching storjAppleHealthConverter.buildSleepPoints so processSleepData
        // computes the same durations from endDate–startDate in both paths.
        // Stages: rem, core, deep, awake placed sequentially ending at 07:00 UTC;
        // inBed spans the entire window as a separate record.
        const hasStageBreakdown =
          (ss.core ?? 0) > 0 || (ss.deep ?? 0) > 0 || (ss.rem ?? 0) > 0;
        const syntheticCore =
          !hasStageBreakdown && (ss.total ?? 0) > 0
            ? Math.max(0, (ss.total ?? 0) - (ss.awake ?? 0))
            : 0;

        const wakeMs = new Date(`${dateKey}T07:00:00.000Z`).getTime();

        // Place stages backward from wake time (rem → core → deep → awake)
        const sleepStages: Array<[SleepStage, number]> = [
          ["awake", ss.awake ?? 0],
          ["deep", ss.deep ?? 0],
          ["core", hasStageBreakdown ? (ss.core ?? 0) : syntheticCore],
          ["rem", ss.rem ?? 0],
        ];

        let endMs = wakeMs;
        for (const [stage, durationMin] of sleepStages) {
          if (durationMin <= 0) continue;
          const durationMs = durationMin * 60_000;
          const startMs = endMs - durationMs;
          result[HK_SLEEP].push({
            type: HK_SLEEP,
            startDate: new Date(startMs).toISOString(),
            endDate: new Date(endMs).toISOString(),
            value: stage,
            unit: "hr",
            source: "other",
          } as unknown as HealthMetric);
          endMs = startMs;
        }

        // inBed spans the full window
        const inBedMin = ss.inBed ?? 0;
        if (inBedMin > 0) {
          const inBedMs = inBedMin * 60_000;
          result[HK_SLEEP].push({
            type: HK_SLEEP,
            startDate: new Date(wakeMs - inBedMs).toISOString(),
            endDate: new Date(wakeMs).toISOString(),
            value: "inBed" as SleepStage,
            unit: "hr",
            source: "other",
          } as unknown as HealthMetric);
        }
        continue;
      }

      // ── Quantitative metrics ───────────────────────────────────────────
      const mapping = METRIC_MAP[metricKey];
      if (!mapping) continue;

      const numVal = extractNumericValue(
        rawValue as DailySummaryValue | number,
      );
      if (numVal === null || isNaN(numVal) || numVal < 0) continue;

      if (!result[mapping.appleId]) result[mapping.appleId] = [];
      result[mapping.appleId].push({
        type: mapping.appleId,
        startDate: `${dateKey}T12:00:00.000Z`,
        endDate: `${dateKey}T12:00:00.000Z`,
        value: String(Math.round(numVal * 100) / 100),
        unit: mapping.unit,
        source: "other",
      } as unknown as HealthMetric);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Fetch the most recent apple-health-full-export payload from Storj
// ---------------------------------------------------------------------------
async function fetchAppleHealthPayloadFromStorj(
  address: string,
  encryptionKey: WalletEncryptionKey,
): Promise<AppleHealthStorjPayload | null> {
  try {
    // 1. List apple-health-full-export objects
    const listResp = await fetch("/api/storj", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "storage/list",
        userAddress: address,
        encryptionKey,
        dataType: "apple-health-full-export",
      }),
    });
    if (!listResp.ok) return null;

    const listJson = (await listResp.json()) as {
      result?: Array<{ uri: string; uploadedAt: number }>;
    };
    const items = listJson.result;
    if (!items || items.length === 0) return null;

    // 2. Pick most recent
    const latest = items.reduce((a, b) =>
      (a.uploadedAt ?? 0) > (b.uploadedAt ?? 0) ? a : b,
    );

    // 3. Retrieve and decrypt
    const getResp = await fetch("/api/storj", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "storage/retrieve",
        userAddress: address,
        encryptionKey,
        storjUri: latest.uri,
      }),
    });
    if (!getResp.ok) return null;

    const getJson = (await getResp.json()) as {
      result?: { data?: AppleHealthStorjPayload };
    };
    const payload = getJson.result?.data;
    if (!payload?.dailySummaries) return null;

    return payload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useStorjHealthSync(): void {
  const { isConnected, address, signMessage } = useWalletService();
  const queryClient = useQueryClient();
  // Track which address we've already attempted so we don't re-run on re-renders
  const attemptedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isConnected || !address || !signMessage) return;
    if (attemptedForRef.current === address) return;

    // Mark immediately so concurrent renders don't re-trigger
    attemptedForRef.current = address;

    void (async (): Promise<void> => {
      try {
        // Always fetch from Storj on login, even if IndexedDB has data.
        //
        // The old "skip if local data exists" guard prevented the encryption
        // key from ever being cached when IndexedDB was already seeded.
        // useStorjAppleHealthQuery (which provides the full history for the
        // in-memory merge in HealthDataContextWrapper) checks that same key
        // cache before enabling itself — so the skip caused storjHealthData
        // to always be null, meaning the day-level merge never ran and the
        // dashboard was stuck on the 180-day IndexedDB window.
        //
        // We still use attemptedForRef so this only runs once per session /
        // address, not on every re-render. saveHealthData already does a
        // day-level merge (existing IndexedDB dates win) and then trims to
        // 180 days, so manual imports are never overwritten.
        await healthDataStore.initialize();

        console.log(
          "[StorjHealthSync] Fetching from Storj to cache key and refresh history…",
        );

        // Get (or re-use cached) encryption key — may prompt wallet signature
        const { getCachedWalletEncryptionKey } =
          await import("@/utils/walletEncryption");
        const encryptionKey = await getCachedWalletEncryptionKey(
          address,
          signMessage,
        );

        const payload = await fetchAppleHealthPayloadFromStorj(
          address,
          encryptionKey,
        );
        if (!payload) {
          console.log(
            "[StorjHealthSync] No apple-health-full-export found on Storj",
          );
          return;
        }

        const healthData = convertDailySummariesToHealthData(
          payload.dailySummaries,
        );
        const metricCount = Object.keys(healthData).length;
        if (metricCount === 0) {
          console.log("[StorjHealthSync] Converted payload was empty");
          return;
        }

        // Deduplicate by calendar day before writing to IndexedDB.
        //
        // saveHealthData deduplicates by exact startDate string. Storj daily
        // summaries use T12:00:00.000Z while raw intraday records use local-time
        // offsets — different strings, same calendar day. Without day-level
        // dedup, both would land in IndexedDB and processCumulativeData would
        // sum them, doubling the count for the IndexedDB fallback path.
        //
        // Strategy: if IndexedDB already has ANY record for a calendar day for
        // a given metric, skip the Storj daily summary for that day. Existing
        // data wins; Storj only fills truly missing days.
        const existingData = (await healthDataStore.getHealthData()) ?? {};
        const deduped: HealthDataResults = {};
        for (const [metricId, records] of Object.entries(healthData)) {
          const existing = (existingData[metricId] ?? []) as Array<{
            startDate: string;
          }>;
          if (existing.length === 0) {
            // No existing data for this metric — write everything from Storj
            deduped[metricId] = records as HealthDataResults[typeof metricId];
            continue;
          }
          const existingCalendarDays = new Set(
            existing.map((r) => r.startDate.slice(0, 10)),
          );
          const newRecords = records.filter(
            (r) => !existingCalendarDays.has(r.startDate.slice(0, 10)),
          );
          if (newRecords.length > 0) {
            deduped[metricId] =
              newRecords as HealthDataResults[typeof metricId];
          }
        }

        const dedupedMetricCount = Object.keys(deduped).length;
        if (dedupedMetricCount === 0) {
          console.log(
            "[StorjHealthSync] All Storj days already covered in IndexedDB — skipping write",
          );
          return;
        }

        await healthDataStore.saveHealthData(deduped);

        // Invalidate React Query so HealthDataContextWrapper picks up new data
        await queryClient.invalidateQueries({ queryKey: ["healthData"] });

        console.log(
          `[StorjHealthSync] ✅ Loaded ${metricCount} metric types from Storj into IndexedDB`,
        );
      } catch (error) {
        console.warn("[StorjHealthSync] Sync failed:", error);
        // Reset so the next wallet reconnect can retry
        attemptedForRef.current = null;
      }
    })();
  }, [isConnected, address, signMessage, queryClient]);
}
