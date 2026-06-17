/**
 * useStorjHealthScores
 *
 * Fetches the pre-computed daily health scores stored in Storj as a
 * "health-scores" artifact (written server-side after each Apple Health upload).
 *
 * Returns individual daily scores plus pre-calculated windowed trend averages
 * (7/30/90/180-day) ready for display in HealthScoreCards and HealthScoreTrends.
 */

import type {
  DailyHealthScores,
  ScoreTrends,
} from "@/utils/dailyHealthScoreCalculator";
import { calculateScoreTrends } from "@/utils/dailyHealthScoreCalculator";
import type { StoredHealthScoresPayload } from "@/app/api/apple-health/upload/route";
import {
  encryptionKeyCache,
  type WalletEncryptionKey,
} from "@/utils/walletEncryption";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

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

async function fetchHealthScoresFromStorj(
  address: string,
  key: WalletEncryptionKey,
): Promise<DailyHealthScores[]> {
  const listResp = await fetch("/api/storj", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "storage/list",
      userAddress: address,
      encryptionKey: key,
      dataType: "health-scores",
    }),
  });

  if (!listResp.ok) return [];

  const listData = (await listResp.json()) as StorjListResponse;
  const items = listData?.result ?? [];
  if (items.length === 0) return [];

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

  if (!retrieveResp.ok) return [];

  const retrieveData = (await retrieveResp.json()) as StorjRetrieveResponse;
  const stored = retrieveData?.result?.data as
    | StoredHealthScoresPayload
    | undefined;

  if (!stored?.scores) return [];

  return Object.values(stored.scores).sort((a, b) =>
    a.date < b.date ? -1 : 1,
  );
}

export function useStorjHealthScores(address: string | undefined): {
  dailyScores: DailyHealthScores[];
  scoreTrends: ScoreTrends | null;
  isLoading: boolean;
} {
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
    const timers: ReturnType<typeof setTimeout>[] = [];
    const check = (): void => {
      if (encryptionKeyCache.get(address)) setKeyAvailable(true);
    };
    timers.push(setTimeout(check, 1_000));
    timers.push(setTimeout(check, 3_000));
    timers.push(setTimeout(check, 8_000));
    return (): void => timers.forEach(clearTimeout);
  }, [address]);

  const encryptionKey = address ? encryptionKeyCache.get(address) : null;

  const { data: dailyScores = [], isPending } = useQuery({
    queryKey: ["storj-health-scores", address],
    queryFn: (): Promise<DailyHealthScores[]> => {
      if (!address || !encryptionKey) return Promise.resolve([]);
      return fetchHealthScoresFromStorj(address, encryptionKey);
    },
    enabled: !!address && keyAvailable,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
  });

  const scoreTrends =
    dailyScores.length > 0 ? calculateScoreTrends(dailyScores) : null;

  return { dailyScores, scoreTrends, isLoading: isPending };
}
