/**
 * Storage Management Section
 *
 * Comprehensive Storj storage management UI with:
 * - Storage statistics display
 * - Pruning controls for different data types
 * - Quarterly snapshot visualization
 * - Real-time status updates
 */

"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStorjPruning } from "@/hooks/useStorjPruning";
import type { StorageService } from "@/storage/StorageService";
import type { StorageReference } from "@/storage/StorjClient";
import {
  EVENT_TYPE_DEFINITIONS,
  HealthEventType as TimelineHealthEventType,
} from "@/types/healthEventTypes";
import {
  getWalletDerivedEncryptionKey,
  getKeyDerivationMessage,
  type WalletEncryptionKey,
} from "@/utils/walletEncryption";
import { isChainTrackedStorjDataType } from "@/utils/storjChainMarkerRegistry";
// Note: on-chain upload markers are recorded at upload time (Report Parser Viewer save flow).
// This component enforces mandatory on-chain deletion markers for report deletes.
import { AlertCircle, CheckCircle, Database, Info, Trash2 } from "lucide-react";
import React, { useEffect, useState } from "react";

interface StorageManagementSectionProps {
  userAddress: string;
  signMessage: (message: string) => Promise<string>;
  getWalletClient: () => Promise<import("viem").WalletClient | null>;
}

interface StorjListItem {
  uri: string;
  contentHash: string;
  size: number;
  uploadedAt: number;
  dataType: string;
  metadata?: Record<string, string>;
}

function getMetaValue(item: StorjListItem, keys: string[]): string | undefined {
  const md = item.metadata || {};
  for (const k of keys) {
    const v = md[k];
    if (typeof v === "string" && v.trim().length > 0) return v;
  }
  return undefined;
}

function getTimelineEventTypeRaw(item: StorjListItem): string | undefined {
  // S3 metadata is usually lowercased, so support both.
  return getMetaValue(item, ["eventtype", "eventType", "event_type"]);
}

function formatEventTypeLabel(raw: string): string {
  const words = raw
    .trim()
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  return words
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function getKnownEventDefinition(
  raw: string,
): (typeof EVENT_TYPE_DEFINITIONS)[TimelineHealthEventType] | null {
  return (EVENT_TYPE_DEFINITIONS as Record<string, unknown>)[raw]
    ? (
        EVENT_TYPE_DEFINITIONS as Record<
          string,
          (typeof EVENT_TYPE_DEFINITIONS)[TimelineHealthEventType]
        >
      )[raw]
    : null;
}

function formatEventTypeDropdownLabel(raw: string): string {
  const def = getKnownEventDefinition(raw);
  if (!def) return formatEventTypeLabel(raw);
  return `${def.icon ? `${def.icon} ` : ""}${def.label}`;
}

function formatTimestampLabel(msOrSec: string | undefined): string | null {
  if (!msOrSec) return null;
  const n = Number(msOrSec);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = n < 10_000_000_000 ? n * 1000 : n; // seconds or ms
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return null;
  }
}

export function StorageManagementSection({
  userAddress,
  signMessage,
  getWalletClient,
}: StorageManagementSectionProps): JSX.Element {
  const { status, performCompletePruning, getLastPruningSummary } =
    useStorjPruning();

  const [encryptionKey, setEncryptionKey] =
    useState<WalletEncryptionKey | null>(null);
  const [isLoadingKey, setIsLoadingKey] = useState(false);
  const [keyError, setKeyError] = useState<string>("");
  const keyRequestAttemptedRef = React.useRef(false);

  const [selectedDataType, setSelectedDataType] = useState<string>("all");

  // Context tab state (viewer)
  // Empty set means "All events"
  const [contextEventTypes, setContextEventTypes] = useState<Set<string>>(
    () => new Set(),
  );
  const [contextItems, setContextItems] = useState<StorjListItem[]>([]);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState<string>("");
  const [contextSelectedUris, setContextSelectedUris] = useState<Set<string>>(
    () => new Set(),
  );
  const [contextPreviewLoading, setContextPreviewLoading] = useState(false);
  const [contextPreviewError, setContextPreviewError] = useState<string>("");
  const [contextPreviewJson, setContextPreviewJson] = useState<string>("");
  const [contextDeleteLoading, setContextDeleteLoading] = useState(false);
  const [contextDeleteError, setContextDeleteError] = useState<string>("");

  // Tests tab state
  const [testsDataType, setTestsDataType] = useState<string>(
    "bloodwork-report-fhir",
  );
  const [testsItems, setTestsItems] = useState<StorjListItem[]>([]);
  const [testsLoading, setTestsLoading] = useState(false);
  const [testsError, setTestsError] = useState<string>("");
  const [testsInfo, setTestsInfo] = useState<string>("");
  const [testsBucketMode, setTestsBucketMode] = useState<"current" | "legacy">(
    "current",
  );
  const [testsLegacyBucket, setTestsLegacyBucket] = useState<string>("");
  const [testsLegacyDebug, setTestsLegacyDebug] = useState<string>("");
  const [selectedTestItem, setSelectedTestItem] =
    useState<StorjListItem | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string>("");
  const [previewJson, setPreviewJson] = useState<string>("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string>("");
  const [chainLoading, setChainLoading] = useState(false);
  const [chainError, setChainError] = useState<string>("");
  const [chainStatus, setChainStatus] = useState<string>("");

  // Initialize encryption key - only once per address change
  useEffect(() => {
    if (!userAddress || encryptionKey || keyRequestAttemptedRef.current) return;

    const initKey = async (): Promise<void> => {
      // Mark that we've attempted to get the key to prevent retries
      keyRequestAttemptedRef.current = true;
      setIsLoadingKey(true);
      setKeyError("");

      try {
        console.log(
          "[StorageManagement] Requesting encryption key signature...",
        );
        const key = await getWalletDerivedEncryptionKey(
          userAddress,
          signMessage,
        );
        setEncryptionKey(key);
        console.log("[StorageManagement] Encryption key obtained");
      } catch (error) {
        const errorMsg =
          error instanceof Error
            ? error.message
            : "Failed to get encryption key";
        console.error(
          "[StorageManagement] Failed to get encryption key:",
          error,
        );
        setKeyError(errorMsg);
        // Don't retry automatically - user can click retry button
      } finally {
        setIsLoadingKey(false);
      }
    };

    void initKey();
  }, [userAddress, signMessage]);

  // Reset attempt flag when address changes
  useEffect(() => {
    keyRequestAttemptedRef.current = false;
    setEncryptionKey(null);
    setKeyError("");
  }, [userAddress]);

  // No automatic loading - data loads only when tabs are selected

  // Client-side API wrapper for StorageService methods needed by pruning
  const createClientStorageService = (): StorageService => {
    return {
      listUserData: async (
        address: string,
        key: typeof encryptionKey,
        dataType?: string,
      ): Promise<StorageReference[]> => {
        if (!key) {
          throw new Error("Encryption key required");
        }
        const res = await fetch("/api/storj", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "storage/list",
            userAddress: address,
            encryptionKey: key,
            dataType,
          }),
        });
        const json = (await res.json()) as {
          success?: boolean;
          result?: StorageReference[];
          error?: string;
        };
        if (!res.ok || json.success === false) {
          throw new Error(
            json.error || `Failed to list Storj data (${dataType || "all"})`,
          );
        }
        return json.result || [];
      },
    } as StorageService;
  };

  const handleRefreshTests = async (): Promise<void> => {
    if (!encryptionKey) return;
    setTestsLoading(true);
    setTestsError("");
    setTestsInfo("");
    setTestsLegacyDebug("");
    setTestsBucketMode("current");
    setTestsLegacyBucket("");
    try {
      const resp = await fetch("/api/storj", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "storage/list",
          userAddress,
          encryptionKey,
          // Always list without S3 prefix filtering to support legacy key layouts.
          // We'll filter by metadata `dataType` client-side instead.
          dataType: undefined,
        }),
      });
      const payload = await resp.json();
      if (!resp.ok || payload?.success === false) {
        throw new Error(payload?.error || "Failed to list Storj items");
      }
      const all = (payload?.result ?? []) as StorjListItem[];
      const TEST_DATA_TYPES = new Set([
        "bloodwork-report-fhir",
        "dexa-report-fhir",
      ]);
      const list =
        testsDataType === "all"
          ? all.filter((i) => TEST_DATA_TYPES.has(i.dataType))
          : all.filter((i) => i.dataType === testsDataType);
      // newest first
      list.sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
      setTestsItems(list);
      setSelectedTestItem(list[0] || null);
      setTestsInfo(
        testsDataType === "all"
          ? `Showing all test reports (${list.length}).`
          : `Showing ${testsDataType} items (${list.length}).`,
      );
    } catch (e) {
      setTestsError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setTestsLoading(false);
    }
  };

  const handleRefreshTestsLegacy = async (): Promise<void> => {
    if (!encryptionKey) return;
    setTestsLoading(true);
    setTestsError("");
    setTestsInfo("");
    setTestsLegacyDebug("");
    try {
      const message = getKeyDerivationMessage(userAddress);
      const signature = await signMessage(message);

      const resp = await fetch("/api/storj", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "storage/list-legacy",
          userAddress,
          encryptionKey,
          signature,
          dataType: testsDataType === "all" ? "all" : testsDataType,
        }),
      });

      const payload = await resp.json();
      if (!resp.ok || payload?.success === false) {
        throw new Error(payload?.error || "Failed to list legacy Storj items");
      }

      const chosenBucket = payload?.result?.chosenBucket as string | null;
      const items = (payload?.result?.items ?? []) as StorjListItem[];
      const candidateCounts =
        (payload?.result?.candidateCounts as Array<{
          bucket: string;
          count: number;
        }>) || [];
      const topHits = candidateCounts
        .filter((c) => c.count > 0)
        .slice(0, 10)
        .map((c) => `${c.bucket}: ${c.count}`)
        .join("\n");
      setTestsLegacyDebug(
        topHits
          ? `Buckets with items (top 10):\n${topHits}`
          : "No items found in any probed legacy buckets.",
      );
      items.sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));

      setTestsBucketMode("legacy");
      setTestsLegacyBucket(chosenBucket || "");
      // In legacy mode, ensure "all" still means "all test reports", not "everything"
      const TEST_DATA_TYPES = new Set([
        "bloodwork-report-fhir",
        "dexa-report-fhir",
      ]);
      const filteredLegacy =
        testsDataType === "all"
          ? items.filter((i) => TEST_DATA_TYPES.has(i.dataType))
          : items.filter((i) => i.dataType === testsDataType);
      setTestsItems(filteredLegacy);
      setSelectedTestItem(filteredLegacy[0] || null);

      if (!chosenBucket || filteredLegacy.length === 0) {
        setTestsInfo(
          "Legacy scan completed: no items found in legacy buckets for this wallet.",
        );
      } else {
        setTestsInfo(
          `Legacy scan: found ${filteredLegacy.length} item(s) in ${chosenBucket}. Preview works; deleting is disabled in legacy mode.`,
        );
      }
    } catch (e) {
      setTestsError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setTestsLoading(false);
    }
  };

  const handleRefreshContext = async (): Promise<void> => {
    if (!encryptionKey) return;
    setContextLoading(true);
    setContextError("");
    try {
      const resp = await fetch("/api/storj", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "storage/list",
          userAddress,
          encryptionKey,
          // Context tab is timeline events only
          dataType: "timeline-event",
        }),
      });
      const payload = await resp.json();
      if (!resp.ok || payload?.success === false) {
        throw new Error(payload?.error || "Failed to list Storj items");
      }
      const list = (payload?.result ?? []) as StorjListItem[];
      list.sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
      setContextItems(list);
      setContextSelectedUris(new Set());
      setContextPreviewJson("");
      setContextPreviewError("");
      setContextEventTypes(new Set());
    } catch (e) {
      setContextError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setContextLoading(false);
    }
  };

  const toggleContextSelected = (uri: string): void => {
    setContextSelectedUris((prev) => {
      const next = new Set(prev);
      if (next.has(uri)) next.delete(uri);
      else next.add(uri);
      return next;
    });
  };

  const clearContextSelection = (): void => setContextSelectedUris(new Set());

  const selectAllContextFiltered = (uris: string[]): void =>
    setContextSelectedUris(new Set(uris));

  const handlePreviewContextSelected = async (): Promise<void> => {
    if (!encryptionKey) return;
    const selected = Array.from(contextSelectedUris);
    if (selected.length === 0) {
      setContextPreviewJson("");
      setContextPreviewError("No items selected");
      return;
    }
    if (selected.length > 25) {
      setContextPreviewError(
        "Please select 25 items or fewer to preview at once.",
      );
      return;
    }

    setContextPreviewLoading(true);
    setContextPreviewError("");
    try {
      const results = await Promise.allSettled(
        selected.map(async (storjUri) => {
          const item = contextItems.find((i) => i.uri === storjUri);
          const resp = await fetch("/api/storj", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "storage/retrieve",
              userAddress,
              encryptionKey,
              storjUri,
              expectedHash: item?.contentHash || undefined,
            }),
          });
          const payload = await resp.json();
          if (!resp.ok || payload?.success === false) {
            throw new Error(
              payload?.error || "Failed to retrieve/decrypt item",
            );
          }
          return {
            uri: storjUri,
            dataType: item?.dataType,
            uploadedAt: item?.uploadedAt,
            metadata: item?.metadata,
            verified: payload?.result?.verified,
            data: payload?.result?.data,
          };
        }),
      );

      const out = results.map((r, idx) => {
        if (r.status === "fulfilled") return r.value;
        return {
          uri: selected[idx],
          error:
            r.reason instanceof Error ? r.reason.message : String(r.reason),
        };
      });

      setContextPreviewJson(JSON.stringify(out, null, 2));
    } catch (e) {
      setContextPreviewError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setContextPreviewLoading(false);
    }
  };

  const findOnChainEventIdsForStorjUris = async (
    storjUris: string[],
  ): Promise<Map<string, number>> => {
    const wanted = new Set(storjUris);
    const found = new Map<string, number>();

    const { SECURE_HEALTH_PROFILE_CONTRACT, secureHealthProfileAbi } =
      await import("@/lib/contractConfig");
    const { getActiveChain } = await import("@/lib/networkConfig");
    const { createPublicClient, http } = await import("viem");
    const rpcUrl =
      process.env.NEXT_PUBLIC_ZKSYNC_RPC_URL ||
      "https://sepolia.era.zksync.dev";
    const publicClient = createPublicClient({
      chain: getActiveChain(),
      transport: http(rpcUrl),
    });

    const count = (await publicClient.readContract({
      address: SECURE_HEALTH_PROFILE_CONTRACT as `0x${string}`,
      abi: secureHealthProfileAbi,
      functionName: "getEventCount",
      args: [userAddress as `0x${string}`],
    })) as bigint;

    const n = Number(count);
    for (let i = 0; i < n; i++) {
      const uri = (await publicClient.readContract({
        address: SECURE_HEALTH_PROFILE_CONTRACT as `0x${string}`,
        abi: secureHealthProfileAbi,
        functionName: "eventStorjUri",
        args: [userAddress as `0x${string}`, BigInt(i)],
      })) as string;

      if (wanted.has(uri)) {
        found.set(uri, i);
        if (found.size === wanted.size) break;
      }
    }

    return found;
  };

  const handleDeleteContextSelected = async (): Promise<void> => {
    if (!encryptionKey) return;

    const selectedUris = Array.from(contextSelectedUris);
    if (selectedUris.length === 0) return;

    if (selectedUris.length > 10) {
      setContextDeleteError(
        "Please select 10 timeline events or fewer to delete at once (each requires an on-chain transaction).",
      );
      return;
    }

    // Ensure selected are timeline-event objects
    const selectedItems = selectedUris
      .map((uri) => contextItems.find((i) => i.uri === uri))
      .filter((i): i is StorjListItem => Boolean(i));

    if (selectedItems.some((i) => i.dataType !== "timeline-event")) {
      setContextDeleteError("Only timeline-event items can be deleted here.");
      return;
    }

    setContextDeleteLoading(true);
    setContextDeleteError("");
    setChainError("");
    setChainStatus("");

    try {
      // Find matching on-chain eventIds by storjUri
      setChainStatus("Checking on-chain references...");
      const onChain = await findOnChainEventIdsForStorjUris(selectedUris);
      const onChainCount = Array.from(onChain.keys()).length;
      const offChainCount = selectedUris.length - onChainCount;

      const confirmed = confirm(
        `Delete ${selectedUris.length} timeline event(s)?\n\n` +
          `On-chain referenced: ${onChainCount}\n` +
          `Not on-chain: ${offChainCount}\n\n` +
          `This will submit ${onChainCount} on-chain transaction(s) (deactivateHealthEvent) for the on-chain items, and then delete all selected Storj objects.\n\n` +
          `Continue?`,
      );
      if (!confirmed) return;

      const walletClient = await getWalletClient();
      if (!walletClient) throw new Error("Wallet client not available");

      const { SECURE_HEALTH_PROFILE_CONTRACT, secureHealthProfileAbi } =
        await import("@/lib/contractConfig");
      const { getActiveChain } = await import("@/lib/networkConfig");
      const { createPublicClient, http } = await import("viem");
      const rpcUrl =
        process.env.NEXT_PUBLIC_ZKSYNC_RPC_URL ||
        "https://sepolia.era.zksync.dev";
      const publicClient = createPublicClient({
        chain: getActiveChain(),
        transport: http(rpcUrl),
      });

      const deletedEventIds = JSON.parse(
        localStorage.getItem("deletedEventIds") || "[]",
      ) as Array<string | number>;

      for (let idx = 0; idx < selectedUris.length; idx++) {
        const storjUri = selectedUris[idx];
        const eventId = onChain.get(storjUri);

        // If this Storj object is referenced on-chain, enforce on-chain deactivation first.
        if (eventId !== undefined) {
          setChainStatus(
            `Deactivating on-chain (${idx + 1}/${selectedUris.length})...`,
          );

          const txHash = await walletClient.writeContract({
            address: SECURE_HEALTH_PROFILE_CONTRACT as `0x${string}`,
            abi: secureHealthProfileAbi,
            functionName: "deactivateHealthEvent",
            args: [BigInt(eventId)],
            chain: getActiveChain(),
            account: walletClient.account ?? (userAddress as `0x${string}`),
          });

          await publicClient.waitForTransactionReceipt({ hash: txHash });

          // Record local deletion for timeline UI filtering (only when on-chain deactivated)
          const localId = `${userAddress}-${eventId}`;
          if (!deletedEventIds.includes(localId)) deletedEventIds.push(localId);
          localStorage.setItem(
            "deletedEventIds",
            JSON.stringify(deletedEventIds),
          );
        }

        setChainStatus(
          `Deleting from Storj (${idx + 1}/${selectedUris.length})...`,
        );
        const resp = await fetch("/api/storj", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "storage/delete",
            userAddress,
            encryptionKey,
            storjUri,
          }),
        });
        const payload = await resp.json();
        if (!resp.ok || payload?.success === false) {
          throw new Error(payload?.error || "Failed to delete Storj item");
        }
      }

      setChainStatus("✅ Deleted selected timeline events.");
      await handleRefreshContext();
      setContextSelectedUris(new Set());
      setContextPreviewJson("");
      setContextPreviewError("");
    } catch (e) {
      setContextDeleteError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setContextDeleteLoading(false);
    }
  };

  const handlePreviewItem = async (item: StorjListItem): Promise<void> => {
    if (!encryptionKey) return;
    setPreviewLoading(true);
    setPreviewError("");
    setPreviewJson("");
    try {
      const legacyMode = testsBucketMode === "legacy";
      const isReport =
        item.dataType === "dexa-report-fhir" ||
        item.dataType === "bloodwork-report-fhir";

      let action: string;
      let reportType: string | undefined;
      let signature: string | undefined;

      if (legacyMode) {
        action = "storage/retrieve-legacy";
        const message = getKeyDerivationMessage(userAddress);
        signature = await signMessage(message);
      } else {
        action = isReport ? "report/retrieve" : "storage/retrieve";
        reportType =
          item.dataType === "bloodwork-report-fhir"
            ? "bloodwork"
            : item.dataType === "dexa-report-fhir"
              ? "dexa"
              : undefined;
      }

      const resp = await fetch("/api/storj", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          userAddress,
          encryptionKey,
          storjUri: item.uri,
          expectedHash: item.contentHash || undefined,
          reportType,
          signature,
        }),
      });
      const payload = await resp.json();
      if (!resp.ok || payload?.success === false) {
        throw new Error(payload?.error || "Failed to retrieve/decrypt item");
      }

      const result = payload?.result;
      const data = legacyMode ? result?.data : isReport ? result : result?.data;
      setPreviewJson(JSON.stringify(data, null, 2));
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDeleteItem = async (item: StorjListItem): Promise<void> => {
    if (!encryptionKey) return;
    const confirmed = confirm(
      `Delete this Storj file?\n\n${item.uri}\n\nThis cannot be undone.`,
    );
    if (!confirmed) return;

    setDeleteLoading(true);
    setDeleteError("");
    try {
      // Mandatory: for any chain-tracked type, record deletion on-chain before deleting from Storj
      if (isChainTrackedStorjDataType(item.dataType)) {
        await recordReportDeletionOnChain(item);
      }

      const resp = await fetch("/api/storj", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "storage/delete",
          userAddress,
          encryptionKey,
          storjUri: item.uri,
        }),
      });
      const payload = await resp.json();
      if (!resp.ok || payload?.success === false) {
        throw new Error(payload?.error || "Failed to delete Storj item");
      }

      // If we deleted the selected item, clear preview
      if (selectedTestItem?.uri === item.uri) {
        setSelectedTestItem(null);
        setPreviewJson("");
        setPreviewError("");
      }

      await handleRefreshTests();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setDeleteLoading(false);
    }
  };

  const getLocalChainMapKey = (): string =>
    `storj_report_chain_map_${userAddress.toLowerCase()}`;

  const loadChainMapping = (
    storjUri: string,
  ): { eventId: number; txHash: string } | null => {
    try {
      const key = getLocalChainMapKey();
      const existing = JSON.parse(localStorage.getItem(key) || "{}") as Record<
        string,
        { eventId: number; txHash: string }
      >;
      return existing[storjUri] || null;
    } catch {
      return null;
    }
  };

  const findEventIdByStorjUri = async (
    storjUri: string,
  ): Promise<number | null> => {
    const { SECURE_HEALTH_PROFILE_CONTRACT, secureHealthProfileAbi } =
      await import("@/lib/contractConfig");
    const { getActiveChain } = await import("@/lib/networkConfig");
    const { createPublicClient, http } = await import("viem");
    const rpcUrl =
      process.env.NEXT_PUBLIC_ZKSYNC_RPC_URL ||
      "https://sepolia.era.zksync.dev";
    const publicClient = createPublicClient({
      chain: getActiveChain(),
      transport: http(rpcUrl),
    });

    const count = (await publicClient.readContract({
      address: SECURE_HEALTH_PROFILE_CONTRACT as `0x${string}`,
      abi: secureHealthProfileAbi,
      functionName: "getEventCount",
      args: [userAddress as `0x${string}`],
    })) as bigint;

    const n = Number(count);
    for (let i = 0; i < n; i++) {
      const uri = (await publicClient.readContract({
        address: SECURE_HEALTH_PROFILE_CONTRACT as `0x${string}`,
        abi: secureHealthProfileAbi,
        functionName: "eventStorjUri",
        args: [userAddress as `0x${string}`, BigInt(i)],
      })) as string;
      if (uri === storjUri) return i;
    }
    return null;
  };

  const recordReportDeletionOnChain = async (
    item: StorjListItem,
  ): Promise<void> => {
    setChainLoading(true);
    setChainError("");
    setChainStatus("");
    try {
      const walletClient = await getWalletClient();
      if (!walletClient) throw new Error("Wallet client not available");

      const { SECURE_HEALTH_PROFILE_CONTRACT, secureHealthProfileAbi } =
        await import("@/lib/contractConfig");
      const { getActiveChain } = await import("@/lib/networkConfig");
      const { createPublicClient, http } = await import("viem");
      const rpcUrl =
        process.env.NEXT_PUBLIC_ZKSYNC_RPC_URL ||
        "https://sepolia.era.zksync.dev";
      const publicClient = createPublicClient({
        chain: getActiveChain(),
        transport: http(rpcUrl),
      });

      const mapped = loadChainMapping(item.uri);
      const eventId =
        mapped?.eventId ?? (await findEventIdByStorjUri(item.uri));
      if (eventId === null) {
        throw new Error("Could not find on-chain eventId for this storjUri.");
      }

      setChainStatus("Submitting deletion marker transaction...");
      const txHash = await walletClient.writeContract({
        address: SECURE_HEALTH_PROFILE_CONTRACT as `0x${string}`,
        abi: secureHealthProfileAbi,
        functionName: "deactivateHealthEvent",
        args: [BigInt(eventId)],
        chain: getActiveChain(),
        account: walletClient.account ?? (userAddress as `0x${string}`),
      });

      setChainStatus("Waiting for confirmation...");
      await publicClient.waitForTransactionReceipt({ hash: txHash });

      setChainStatus(`✅ On-chain deletion recorded (eventId=${eventId})`);
    } catch (e) {
      setChainError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setChainLoading(false);
    }
  };

  const handlePrune = async (dataType: string): Promise<void> => {
    if (!encryptionKey) {
      alert("Encryption key not available. Please reconnect your wallet.");
      return;
    }

    const dataTypeName = dataType === "all" ? "all data types" : dataType;
    const confirmed = confirm(
      `This will analyze and remove old/duplicate ${dataTypeName} data from Storj.\n\n` +
        "Important snapshots (monthly/quarterly) will be preserved.\n\n" +
        "Continue?",
    );

    if (!confirmed) return;

    try {
      const storageService = createClientStorageService();
      const targetDataType = dataType === "all" ? undefined : dataType;

      await performCompletePruning(
        storageService,
        userAddress,
        encryptionKey,
        targetDataType || "conversation-session", // Default for type safety
      );

      const summary = getLastPruningSummary();
      if (summary) {
        alert(`✅ Pruning complete!\n\n${summary}`);
      }

      // Stats removed - no refresh needed
    } catch (error) {
      console.error("[StorageManagement] Pruning failed:", error);
      alert(
        `❌ Pruning failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  };

  // Loading state
  if (isLoadingKey) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Storage Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mx-auto mb-3"></div>
              <p className="text-sm text-gray-600">
                Requesting encryption key...
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Please approve the signature request
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (keyError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Storage Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-900">
                Failed to initialize
              </p>
              <p className="text-xs text-red-700 mt-1">{keyError}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  setKeyError("");
                  setEncryptionKey(null);
                  keyRequestAttemptedRef.current = false;
                  setIsLoadingKey(true);

                  try {
                    const key = await getWalletDerivedEncryptionKey(
                      userAddress,
                      signMessage,
                    );
                    setEncryptionKey(key);
                  } catch (error) {
                    const errorMsg =
                      error instanceof Error
                        ? error.message
                        : "Failed to get encryption key";
                    setKeyError(errorMsg);
                  } finally {
                    setIsLoadingKey(false);
                  }
                }}
                className="mt-2"
              >
                Retry
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Storage Management
        </CardTitle>
        <CardDescription>
          Manage your encrypted Storj storage and remove old/duplicate data
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Pruning Controls */}
        <Tabs value={selectedDataType} onValueChange={setSelectedDataType}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="conversation-session">Chats</TabsTrigger>
            <TabsTrigger value="health-raw">Health Data</TabsTrigger>
            <TabsTrigger value="context-vault">Context</TabsTrigger>
            <TabsTrigger value="tests">Tests</TabsTrigger>
          </TabsList>
          {selectedDataType === "context-vault" ? (
            <TabsContent value="context-vault" className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-medium text-gray-700">
                  Timeline events
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRefreshContext}
                  disabled={contextLoading}
                >
                  {contextLoading ? "Loading..." : "Refresh"}
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-700">
                  Event type
                </label>
                {(() => {
                  const knownTypes = Object.keys(EVENT_TYPE_DEFINITIONS)
                    .filter((t) => t !== TimelineHealthEventType.CUSTOM)
                    .sort();

                  const unknownTypes = Array.from(
                    new Set(
                      contextItems
                        .map((i) => getTimelineEventTypeRaw(i))
                        .filter((x): x is string => Boolean(x))
                        .filter((t) => !knownTypes.includes(t)),
                    ),
                  ).sort();

                  const categories: Array<{
                    key: string;
                    label: string;
                    types: string[];
                  }> = [
                    {
                      key: "medication",
                      label: "Medications",
                      types: knownTypes.filter((t) =>
                        t.startsWith("MEDICATION_"),
                      ),
                    },
                    {
                      key: "condition",
                      label: "Conditions",
                      types: knownTypes.filter((t) =>
                        t.startsWith("CONDITION_"),
                      ),
                    },
                    {
                      key: "injury",
                      label: "Injuries",
                      types: knownTypes.filter((t) => t.startsWith("INJURY_")),
                    },
                    {
                      key: "illness",
                      label: "Illnesses",
                      types: knownTypes.filter((t) => t.startsWith("ILLNESS_")),
                    },
                    {
                      key: "procedure",
                      label: "Procedures",
                      types: knownTypes.filter(
                        (t) =>
                          t.startsWith("SURGERY_") ||
                          t.startsWith("PROCEDURE_"),
                      ),
                    },
                    {
                      key: "allergy",
                      label: "Allergies",
                      types: knownTypes.filter((t) => t.startsWith("ALLERGY_")),
                    },
                    {
                      key: "measurement",
                      label: "Measurements",
                      types: knownTypes.filter(
                        (t) =>
                          t.endsWith("_RECORDED") ||
                          t.includes("BLOOD_PRESSURE"),
                      ),
                    },
                    {
                      key: "general",
                      label: "General",
                      types: knownTypes.filter(
                        (t) => t === "METRIC_SNAPSHOT" || t === "GENERAL_NOTE",
                      ),
                    },
                  ].filter((c) => c.types.length > 0);

                  const selectedCount = contextEventTypes.size;
                  const buttonLabel =
                    selectedCount === 0
                      ? "All events"
                      : `${selectedCount} selected`;

                  const toggleType = (t: string): void => {
                    setContextEventTypes((prev) => {
                      const next = new Set(prev);
                      if (next.has(t)) next.delete(t);
                      else next.add(t);
                      return next;
                    });
                  };

                  const setAll = (): void => setContextEventTypes(new Set());

                  return (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-2 text-xs"
                        >
                          {buttonLabel}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="max-h-[360px] overflow-auto">
                        <DropdownMenuCheckboxItem
                          checked={contextEventTypes.size === 0}
                          onCheckedChange={() => setAll()}
                        >
                          All events
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuSeparator />

                        {categories.map((cat) => (
                          <React.Fragment key={cat.key}>
                            <div className="px-2 py-1 text-[11px] font-semibold text-gray-600">
                              {cat.label}
                            </div>
                            {cat.types.map((t) => (
                              <DropdownMenuCheckboxItem
                                key={t}
                                checked={contextEventTypes.has(t)}
                                onCheckedChange={() => toggleType(t)}
                              >
                                {formatEventTypeDropdownLabel(t)}
                              </DropdownMenuCheckboxItem>
                            ))}
                            <DropdownMenuSeparator />
                          </React.Fragment>
                        ))}

                        {unknownTypes.length > 0 && (
                          <>
                            <div className="px-2 py-1 text-[11px] font-semibold text-gray-600">
                              Other / Custom (from your timeline)
                            </div>
                            {unknownTypes.map((t) => (
                              <DropdownMenuCheckboxItem
                                key={t}
                                checked={contextEventTypes.has(t)}
                                onCheckedChange={() => toggleType(t)}
                              >
                                {formatEventTypeLabel(t)}
                              </DropdownMenuCheckboxItem>
                            ))}
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  );
                })()}
              </div>

              {contextError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
                  <p className="text-sm text-red-900">{contextError}</p>
                </div>
              )}
              {contextDeleteError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
                  <p className="text-sm text-red-900">{contextDeleteError}</p>
                </div>
              )}
              {contextPreviewError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
                  <p className="text-sm text-red-900">{contextPreviewError}</p>
                </div>
              )}
              {chainError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
                  <p className="text-sm text-red-900">{chainError}</p>
                </div>
              )}
              {chainStatus && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <p className="text-sm text-green-900">{chainStatus}</p>
                </div>
              )}

              {(() => {
                const filtered = contextItems.filter((i) => {
                  // Context tab is timeline events only
                  if (i.dataType !== "timeline-event") return false;
                  // Empty set means "All"
                  if (contextEventTypes.size > 0) {
                    const t = getTimelineEventTypeRaw(i) || "";
                    if (!contextEventTypes.has(t)) return false;
                  }
                  return true;
                });
                const filteredUris = filtered.map((i) => i.uri);

                return (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                    <div className="lg:col-span-5 border border-gray-200 rounded-lg bg-white overflow-hidden">
                      <div className="p-2 border-b bg-gray-50 flex items-center justify-between">
                        <div className="text-xs font-medium text-gray-700">
                          Items ({filtered.length})
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              selectAllContextFiltered(filteredUris)
                            }
                            disabled={filtered.length === 0}
                          >
                            Select all
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={clearContextSelection}
                            disabled={contextSelectedUris.size === 0}
                          >
                            Clear
                          </Button>
                        </div>
                      </div>
                      <div className="max-h-72 overflow-auto">
                        {filtered.length === 0 ? (
                          <div className="p-3 text-sm text-gray-500">
                            No items found. Click Refresh.
                          </div>
                        ) : (
                          filtered.map((item) => {
                            const checked = contextSelectedUris.has(item.uri);
                            const rawType = getTimelineEventTypeRaw(item);
                            const title = rawType
                              ? formatEventTypeDropdownLabel(rawType)
                              : "Timeline Event";
                            const eventId =
                              getMetaValue(item, ["eventid", "eventId"]) ||
                              null;
                            const eventTs = formatTimestampLabel(
                              getMetaValue(item, ["timestamp"]),
                            );
                            return (
                              <button
                                key={item.uri}
                                type="button"
                                className={`w-full text-left p-2 border-b hover:bg-gray-50 ${
                                  checked ? "bg-emerald-50" : ""
                                }`}
                                onClick={() => toggleContextSelected(item.uri)}
                              >
                                <div className="flex items-start gap-2">
                                  <input
                                    type="checkbox"
                                    className="mt-1"
                                    checked={checked}
                                    onChange={() =>
                                      toggleContextSelected(item.uri)
                                    }
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs font-medium text-gray-900 truncate">
                                      {title}
                                    </div>
                                    {(eventTs || eventId) && (
                                      <div className="text-[11px] text-gray-600 flex items-center gap-2">
                                        {eventTs && <span>{eventTs}</span>}
                                        {eventId && (
                                          <>
                                            <span>•</span>
                                            <span className="truncate">
                                              id: {eventId}
                                            </span>
                                          </>
                                        )}
                                      </div>
                                    )}
                                    <div className="text-[11px] text-gray-500 flex items-center gap-2">
                                      <span>
                                        {item.uploadedAt
                                          ? new Date(
                                              item.uploadedAt,
                                            ).toLocaleString()
                                          : "unknown date"}
                                      </span>
                                      <span>•</span>
                                      <span>
                                        {item.size
                                          ? (item.size / 1024).toFixed(1)
                                          : "0"}{" "}
                                        KB
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>

                    <div className="lg:col-span-7 border border-gray-200 rounded-lg bg-white overflow-hidden">
                      <div className="p-2 border-b bg-gray-50 flex items-center justify-between">
                        <div className="text-xs font-medium text-gray-700">
                          Decrypted preview
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handlePreviewContextSelected}
                            disabled={
                              contextPreviewLoading ||
                              contextSelectedUris.size === 0
                            }
                          >
                            {contextPreviewLoading
                              ? "Decrypting..."
                              : `Preview selected (${contextSelectedUris.size})`}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={handleDeleteContextSelected}
                            disabled={
                              contextDeleteLoading ||
                              contextSelectedUris.size === 0 ||
                              contextPreviewLoading ||
                              chainLoading ||
                              deleteLoading
                            }
                          >
                            {contextDeleteLoading
                              ? "Deleting..."
                              : `Delete selected (${contextSelectedUris.size})`}
                          </Button>
                        </div>
                      </div>
                      <pre className="p-3 text-xs whitespace-pre-wrap font-mono max-h-72 overflow-auto">
                        {contextPreviewJson ||
                          (contextSelectedUris.size > 0
                            ? "Click Preview selected to decrypt."
                            : "Select one or more items to preview.")}
                      </pre>
                    </div>
                  </div>
                );
              })()}
            </TabsContent>
          ) : selectedDataType !== "tests" ? (
            <TabsContent value={selectedDataType} className="mt-4 space-y-3">
              <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-blue-900">
                  <p className="font-medium mb-1">What gets pruned:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-blue-800">
                    <li>Duplicate data (same content hash)</li>
                    <li>Old data beyond retention period</li>
                    <li>Items when storage limit exceeded</li>
                  </ul>
                  <p className="font-medium mt-2 mb-1">
                    What&apos;s protected:
                  </p>
                  <ul className="list-disc list-inside space-y-0.5 text-blue-800">
                    <li>Monthly snapshots (1st of each month)</li>
                    <li>Quarterly snapshots (Q1, Q2, Q3, Q4)</li>
                    <li>Most recent items (based on policy)</li>
                  </ul>
                </div>
              </div>

              <Button
                onClick={() => handlePrune(selectedDataType)}
                disabled={status.isAnalyzing || status.isPruning}
                className="w-full"
                variant="destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {status.isAnalyzing
                  ? "Analyzing..."
                  : status.isPruning
                    ? "Pruning..."
                    : `Clean ${selectedDataType === "all" ? "All Data" : selectedDataType}`}
              </Button>
            </TabsContent>
          ) : (
            <TabsContent value="tests" className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-gray-700">
                    Data type
                  </label>
                  <select
                    className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                    value={testsDataType}
                    onChange={(e) => setTestsDataType(e.target.value)}
                  >
                    <option value="bloodwork-report-fhir">
                      bloodwork-report-fhir
                    </option>
                    <option value="dexa-report-fhir">dexa-report-fhir</option>
                    <option value="all">all test reports</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRefreshTests}
                    disabled={testsLoading}
                  >
                    {testsLoading ? "Loading..." : "Refresh"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRefreshTestsLegacy}
                    disabled={testsLoading}
                    title="If you saved files before the bucket security change, they may live in a legacy bucket."
                  >
                    Legacy scan
                  </Button>
                </div>
              </div>

              {testsInfo && (
                <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <Info className="h-4 w-4 text-blue-600 flex-shrink-0" />
                  <p className="text-sm text-blue-900">
                    {testsInfo}
                    {testsBucketMode === "legacy" && testsLegacyBucket
                      ? ` (bucket: ${testsLegacyBucket})`
                      : ""}
                  </p>
                </div>
              )}

              {testsBucketMode === "legacy" && testsLegacyDebug && (
                <pre className="p-3 text-xs whitespace-pre-wrap font-mono bg-gray-50 border border-gray-200 rounded-lg">
                  {testsLegacyDebug}
                </pre>
              )}

              {testsError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
                  <p className="text-sm text-red-900">{testsError}</p>
                </div>
              )}

              {deleteError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
                  <p className="text-sm text-red-900">{deleteError}</p>
                </div>
              )}
              {chainError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
                  <p className="text-sm text-red-900">{chainError}</p>
                </div>
              )}
              {chainStatus && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <p className="text-sm text-green-900">{chainStatus}</p>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                <div className="lg:col-span-5 border border-gray-200 rounded-lg bg-white overflow-hidden">
                  <div className="p-2 border-b bg-gray-50 text-xs font-medium text-gray-700">
                    Files ({testsItems.length})
                  </div>
                  <div className="max-h-72 overflow-auto">
                    {testsItems.length === 0 ? (
                      <div className="p-3 text-sm text-gray-500">
                        No items found. Click Refresh.
                      </div>
                    ) : (
                      <div className="divide-y">
                        {testsItems.map((item) => (
                          <button
                            key={item.uri}
                            className={`w-full text-left p-3 hover:bg-gray-50 ${
                              selectedTestItem?.uri === item.uri
                                ? "bg-emerald-50"
                                : ""
                            }`}
                            onClick={() => {
                              setSelectedTestItem(item);
                              void handlePreviewItem(item);
                            }}
                          >
                            <div className="text-xs font-medium text-gray-900">
                              {item.dataType}
                            </div>
                            <div className="text-[11px] text-gray-600 mt-1 break-all">
                              {item.uri}
                            </div>
                            <div className="text-[11px] text-gray-500 mt-1 flex gap-2">
                              <span>
                                {item.uploadedAt
                                  ? new Date(item.uploadedAt).toLocaleString()
                                  : "unknown time"}
                              </span>
                              <span>•</span>
                              <span>
                                {item.size
                                  ? (item.size / 1024).toFixed(1)
                                  : "0"}{" "}
                                KB
                              </span>
                            </div>
                            {item.metadata?.reportfingerprint && (
                              <div className="text-[11px] text-gray-500 mt-1">
                                fingerprint:{" "}
                                <span className="font-mono">
                                  {item.metadata.reportfingerprint.slice(0, 10)}
                                  …
                                </span>
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="lg:col-span-7 border border-gray-200 rounded-lg bg-white overflow-hidden">
                  <div className="p-2 border-b bg-gray-50 flex items-center justify-between">
                    <div className="text-xs font-medium text-gray-700">
                      Decrypted preview
                    </div>
                    {selectedTestItem && (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void handlePreviewItem(selectedTestItem)
                          }
                          disabled={
                            previewLoading || deleteLoading || chainLoading
                          }
                        >
                          {previewLoading ? "Decrypting..." : "Re-decrypt"}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() =>
                            void handleDeleteItem(selectedTestItem)
                          }
                          disabled={
                            testsBucketMode === "legacy" ||
                            deleteLoading ||
                            previewLoading ||
                            chainLoading
                          }
                        >
                          {deleteLoading ? "Deleting..." : "Delete"}
                        </Button>
                      </div>
                    )}
                  </div>

                  {previewError && (
                    <div className="p-3 text-sm text-red-700 bg-red-50 border-b border-red-200">
                      {previewError}
                    </div>
                  )}

                  <pre className="p-3 text-xs whitespace-pre-wrap font-mono max-h-72 overflow-auto">
                    {previewJson ||
                      (selectedTestItem
                        ? "Select a file to preview."
                        : "No file selected.")}
                  </pre>
                </div>
              </div>
            </TabsContent>
          )}
        </Tabs>

        {/* Status Display */}
        {status.error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-900">{status.error}</p>
          </div>
        )}

        {status.lastResult && (
          <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
            <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-green-900">
              <p className="font-medium">Last pruning completed</p>
              <p className="text-xs mt-1">
                Deleted {status.lastResult.itemsDeleted} items, freed{" "}
                {(status.lastResult.bytesFreed / (1024 * 1024)).toFixed(2)} MB
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
