/**
 * Hook to fetch user's health data attestations from the V4 contract
 */

import { useCallback, useEffect, useState } from "react";
import { createPublicClient, http } from "viem";
import { zkSync, zkSyncSepoliaTestnet } from "viem/chains";
import {
  SECURE_HEALTH_PROFILE_CONTRACT,
  secureHealthProfileAbi,
} from "../lib/contractConfig";

// Data type enum (matches contract)
export enum HealthDataType {
  DEXA = 0,
  BLOODWORK = 1,
  APPLE_HEALTH = 2,
  CGM = 3,
}

// Tier enum (matches contract)
export enum AttestationTier {
  NONE = 0,
  BRONZE = 1,
  SILVER = 2,
  GOLD = 3,
}

export interface AttestationSummary {
  dataType: HealthDataType;
  count: number;
  highestTier: AttestationTier;
  highestScore: number;
  latestTimestamp: number;
}

export interface UseAttestationsReturn {
  attestations: AttestationSummary[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  hasAnyAttestations: boolean;
}

const DATA_TYPE_LABELS: Record<HealthDataType, string> = {
  [HealthDataType.DEXA]: "DEXA",
  [HealthDataType.BLOODWORK]: "Bloodwork",
  [HealthDataType.APPLE_HEALTH]: "Apple Health",
  [HealthDataType.CGM]: "CGM",
};

const TIER_LABELS: Record<AttestationTier, string> = {
  [AttestationTier.NONE]: "",
  [AttestationTier.BRONZE]: "Bronze",
  [AttestationTier.SILVER]: "Silver",
  [AttestationTier.GOLD]: "Gold",
};

export { DATA_TYPE_LABELS, TIER_LABELS };

export function useAttestations(
  address: string | null | undefined,
): UseAttestationsReturn {
  const [attestations, setAttestations] = useState<AttestationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAttestations = useCallback(async () => {
    if (!address) {
      setAttestations([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Determine network from environment
      const isMainnet = process.env.NEXT_PUBLIC_NETWORK === "mainnet";
      const chain = isMainnet ? zkSync : zkSyncSepoliaTestnet;
      const rpcUrl = isMainnet
        ? "https://mainnet.era.zksync.io"
        : "https://sepolia.era.zksync.dev";

      const publicClient = createPublicClient({
        chain,
        transport: http(rpcUrl),
      });

      // Fetch highest tier attestation for each data type
      const summaries: AttestationSummary[] = [];

      for (const dataType of [
        HealthDataType.DEXA,
        HealthDataType.BLOODWORK,
        HealthDataType.APPLE_HEALTH,
        HealthDataType.CGM,
      ]) {
        try {
          // Get count for this data type
          const count = await publicClient.readContract({
            address: SECURE_HEALTH_PROFILE_CONTRACT as `0x${string}`,
            abi: secureHealthProfileAbi,
            functionName: "getAttestationCount",
            args: [address as `0x${string}`, dataType],
          });

          if (count > 0) {
            // Get highest tier attestation (viem may return named tuple as object or array)
            const raw = await publicClient.readContract({
              address: SECURE_HEALTH_PROFILE_CONTRACT as `0x${string}`,
              abi: secureHealthProfileAbi,
              functionName: "getHighestTierAttestation",
              args: [address as `0x${string}`, dataType],
            });
            const result = raw as unknown;
            const tierRaw = Array.isArray(result)
              ? result[0]
              : (result as Record<string, unknown>).tier;
            const att = Array.isArray(result)
              ? result[1]
              : (result as Record<string, unknown>).attestation;
            const attestation =
              att && typeof att === "object" && "completenessScore" in att
                ? (att as { completenessScore: unknown; timestamp: unknown })
                : null;
            const tierNum = Number(tierRaw);
            const highestTier =
              tierNum >= 0 && tierNum <= 3
                ? (tierNum as AttestationTier)
                : AttestationTier.NONE;

            summaries.push({
              dataType,
              count: Number(count),
              highestTier,
              highestScore: Number(attestation?.completenessScore ?? 0) / 100,
              latestTimestamp: Number(attestation?.timestamp ?? 0),
            });
          }
        } catch {
          // V4 functions may not exist if contract hasn't been upgraded
          // Silently skip
        }
      }

      setAttestations(summaries);
    } catch (err) {
      console.error("[useAttestations] Error fetching attestations:", err);
      setError(
        err instanceof Error ? err.message : "Failed to fetch attestations",
      );
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    void fetchAttestations();
  }, [fetchAttestations]);

  return {
    attestations,
    isLoading,
    error,
    refresh: fetchAttestations,
    hasAnyAttestations: attestations.length > 0,
  };
}
