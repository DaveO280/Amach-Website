/**
 * useStorjAppleHealthQuery
 *
 * Fetches Apple Health data (apple-health-full-export) and BREATHING_SESSION
 * timeline events from Storj, then converts them to HealthDataByType format.
 *
 * The key is retrieved from the in-memory encryption key cache (no wallet
 * signature popup). If the key isn't cached yet, the hook retries at 1s / 3s / 8s
 * after address appears — the key gets cached during normal wallet-connect flows
 * (profile load in usePrivyWalletService). If never available, the hook stays
 * disabled and gracefully returns null.
 */

import type { HealthDataByType } from "@/types/healthData";
import type { AppleHealthStorjPayload } from "@/storage/appleHealth/AppleHealthStorjService";
import {
  encryptionKeyCache,
  type WalletEncryptionKey,
} from "@/utils/walletEncryption";
import {
  convertBreathingSessionsToHealthData,
  convertStorjPayloadToHealthData,
} from "@/utils/storjAppleHealthConverter";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

const MAX_BREATHING_SESSIONS = 20;

interface StorjListItem {
  uri: string;
  uploadedAt: number;
  metadata?: Record<string, string>;
}

interface StorjListResponse {
  result?: StorjListItem[];
}

interface StorjRetrieveResponse {
  result?: {
    data?: unknown;
  };
}

interface BreathingEventData {
  eventType?: string;
  timestamp?: number;
  data?: {
    duration?: number;
    bpm?: number;
    baselineHRV?: number;
    recoveryHRV?: number;
    coherenceScore?: number;
  };
}

async function fetchAppleHealthFromStorj(
  address: string,
  key: WalletEncryptionKey,
): Promise<HealthDataByType> {
  const merged: HealthDataByType = {};

  // --- 1. Apple Health full export (single object) ---
  try {
    const listResp = await fetch("/api/storj", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "storage/list",
        userAddress: address,
        encryptionKey: key,
        dataType: "apple-health-full-export",
      }),
    });

    if (listResp.ok) {
      const listData = (await listResp.json()) as StorjListResponse;
      const items = listData?.result ?? [];

      if (items.length > 0) {
        const latest = items.reduce((a, b) =>
          (a.uploadedAt ?? 0) > (b.uploadedAt ?? 0) ? a : b,
        );

        const retrieveResp = await fetch("/api/storj", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "storage/retrieve",
            userAddress: address,
            encryptionKey: key,
            storjUri: latest.uri,
          }),
        });

        if (retrieveResp.ok) {
          const retrieveData =
            (await retrieveResp.json()) as StorjRetrieveResponse;
          const payload = retrieveData?.result?.data as
            | AppleHealthStorjPayload
            | undefined;

          if (payload?.dailySummaries) {
            const converted = convertStorjPayloadToHealthData(payload);
            Object.assign(merged, converted);
            const dateKeys = Object.keys(payload.dailySummaries).sort();
            const stepPoints =
              converted["HKQuantityTypeIdentifierStepCount"] ?? [];
            const exercisePoints =
              converted["HKQuantityTypeIdentifierAppleExerciseTime"] ?? [];
            const stepSum = stepPoints.reduce(
              (s, p) => s + parseFloat(p.value),
              0,
            );
            console.log(
              "[useStorjAppleHealthQuery] Apple Health loaded from Storj:",
              {
                dateRange: `${dateKeys[0]} → ${dateKeys[dateKeys.length - 1]}`,
                totalDays: dateKeys.length,
                stepDays: stepPoints.length,
                stepRawAvg:
                  stepPoints.length > 0
                    ? Math.round(stepSum / stepPoints.length)
                    : 0,
                exerciseDays: exercisePoints.length,
                metricTypes: Object.keys(converted).length,
              },
            );
          }
        }
      }
    }
  } catch (err) {
    console.warn(
      "[useStorjAppleHealthQuery] Failed to fetch apple-health-full-export:",
      err,
    );
  }

  // --- 2. Breathing session timeline events ---
  try {
    const timelineResp = await fetch("/api/storj", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "storage/list",
        userAddress: address,
        encryptionKey: key,
        dataType: "timeline-event",
      }),
    });

    if (timelineResp.ok) {
      const timelineList = (await timelineResp.json()) as StorjListResponse;
      const allEvents = timelineList?.result ?? [];

      const breathingRefs = allEvents
        .filter((item) => item.metadata?.eventType === "BREATHING_SESSION")
        .sort((a, b) => (b.uploadedAt ?? 0) - (a.uploadedAt ?? 0))
        .slice(0, MAX_BREATHING_SESSIONS);

      if (breathingRefs.length > 0) {
        const retrievePromises = breathingRefs.map((item) =>
          fetch("/api/storj", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "storage/retrieve",
              userAddress: address,
              encryptionKey: key,
              storjUri: item.uri,
            }),
          })
            .then((r) =>
              r.ok ? (r.json() as Promise<StorjRetrieveResponse>) : null,
            )
            .catch(() => null),
        );

        const results = await Promise.all(retrievePromises);
        const sessionEvents = results
          .filter(Boolean)
          .map((r) => r?.result?.data as BreathingEventData | undefined)
          .filter(
            (
              d,
            ): d is Required<Pick<BreathingEventData, "timestamp" | "data">> &
              BreathingEventData =>
              !!d &&
              d.eventType === "BREATHING_SESSION" &&
              typeof d.timestamp === "number",
          );

        if (sessionEvents.length > 0) {
          const breathingData = convertBreathingSessionsToHealthData(
            sessionEvents.map((e) => ({
              timestamp: e.timestamp,
              data: e.data ?? {},
            })),
          );
          Object.assign(merged, breathingData);
          console.log(
            "[useStorjAppleHealthQuery] Breathing sessions loaded from Storj:",
            { count: sessionEvents.length },
          );
        }
      }
    }
  } catch (err) {
    console.warn(
      "[useStorjAppleHealthQuery] Failed to fetch breathing sessions:",
      err,
    );
  }

  return merged;
}

export function useStorjAppleHealthQuery(address: string | undefined): {
  data: HealthDataByType | null;
  isLoading: boolean;
} {
  // Track whether the in-memory encryption key cache has a key for this address.
  // We retry a few times to account for the async key-derivation that happens
  // shortly after wallet connect (profile load in usePrivyWalletService).
  const [keyAvailable, setKeyAvailable] = useState<boolean>(
    () => !!address && !!encryptionKeyCache.get(address),
  );

  useEffect(() => {
    if (!address) {
      setKeyAvailable(false);
      return;
    }

    if (encryptionKeyCache.get(address)) {
      setKeyAvailable(true);
      return;
    }

    // Retry at 1s, 3s, 8s after address appears (covers async wallet-setup flows)
    const timers: ReturnType<typeof setTimeout>[] = [];
    const check = (): void => {
      if (encryptionKeyCache.get(address)) {
        setKeyAvailable(true);
      }
    };
    timers.push(setTimeout(check, 1_000));
    timers.push(setTimeout(check, 3_000));
    timers.push(setTimeout(check, 8_000));

    return (): void => timers.forEach(clearTimeout);
  }, [address]);

  const encryptionKey = address ? encryptionKeyCache.get(address) : null;

  const { data, isPending } = useQuery({
    queryKey: ["storj-apple-health", address],
    queryFn: (): Promise<HealthDataByType> => {
      if (!address || !encryptionKey) return Promise.resolve({});
      return fetchAppleHealthFromStorj(address, encryptionKey);
    },
    enabled: !!address && keyAvailable,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
  });

  return { data: data ?? null, isLoading: isPending };
}
