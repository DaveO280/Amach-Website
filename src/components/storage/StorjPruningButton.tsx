/**
 * Example component: Storj Pruning Button
 *
 * Shows how to integrate the pruning system into your UI
 * Can be added to Settings page or Dashboard
 */

"use client";

import { Button } from "@/components/ui/button";
import { useStorjPruning } from "@/hooks/useStorjPruning";
import type { StorageService } from "@/storage/StorageService";
import type { StorageReference } from "@/storage/StorjClient";
import type { WalletEncryptionKey } from "@/utils/walletEncryption";
import { useState } from "react";

interface StorjPruningButtonProps {
  userAddress: string;
  encryptionKey: WalletEncryptionKey;
  dataType?: string;
}

export function StorjPruningButton({
  userAddress,
  encryptionKey,
  dataType = "conversation-session",
}: StorjPruningButtonProps) {
  const {
    status,
    performCompletePruning,
    fetchStorageStats,
    getLastPruningSummary,
  } = useStorjPruning();

  const [statsText, setStatsText] = useState<string>("");

  // Client-side API wrapper for StorageService methods needed by pruning
  const createClientStorageService = (): StorageService => {
    return {
      listUserData: async (
        address: string,
        key: WalletEncryptionKey,
        dataType?: string,
      ): Promise<StorageReference[]> => {
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

  const handleViewStats = async (): Promise<void> => {
    try {
      const storageService = createClientStorageService();
      const { formatted } = await fetchStorageStats(
        storageService,
        userAddress,
        encryptionKey,
        dataType,
      );

      setStatsText(formatted);
      alert(formatted);
    } catch (error) {
      console.error("Failed to fetch stats:", error);
      alert("Failed to fetch storage stats");
    }
  };

  const handlePrune = async (): Promise<void> => {
    const confirmed = confirm(
      `This will analyze and remove old/duplicate ${dataType} data from Storj.\n\n` +
        "Important snapshots will be preserved.\n\n" +
        "Continue?",
    );

    if (!confirmed) return;

    try {
      const storageService = createClientStorageService();

      const result = await performCompletePruning(
        storageService,
        userAddress,
        encryptionKey,
        dataType,
      );

      const summary = getLastPruningSummary();

      if (summary) {
        alert(`✅ Pruning complete!\n\n${summary}`);
      }

      console.log("Pruning result:", result);
    } catch (error) {
      console.error("Pruning failed:", error);
      alert(
        `❌ Pruning failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button
          onClick={handleViewStats}
          variant="outline"
          disabled={status.isAnalyzing || status.isPruning}
        >
          📊 View Storage Stats
        </Button>

        <Button
          onClick={handlePrune}
          variant="destructive"
          disabled={status.isAnalyzing || status.isPruning}
        >
          {status.isAnalyzing
            ? "Analyzing..."
            : status.isPruning
              ? "Pruning..."
              : "🗑️ Clean Up Storj"}
        </Button>
      </div>

      {status.error && (
        <p className="text-red-500 text-sm">Error: {status.error}</p>
      )}

      {statsText && (
        <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-40">
          {statsText}
        </pre>
      )}

      {status.lastResult && (
        <div className="text-sm text-green-600">
          Last pruning: Deleted {status.lastResult.itemsDeleted} items, freed{" "}
          {(status.lastResult.bytesFreed / (1024 * 1024)).toFixed(2)} MB
        </div>
      )}
    </div>
  );
}
