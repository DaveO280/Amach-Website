/**
 * Example component: Storj Pruning Button
 *
 * Shows how to integrate the pruning system into your UI
 * Can be added to Settings page or Dashboard
 */

"use client";

import { Button } from "@/components/ui/button";
import { useStorjPruning } from "@/hooks/useStorjPruning";
import { getStorageService } from "@/storage/StorageService";
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

  const handleViewStats = async () => {
    try {
      const storageService = getStorageService();
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

  const handlePrune = async () => {
    const confirmed = confirm(
      `This will analyze and remove old/duplicate ${dataType} data from Storj.\n\n` +
        "Important snapshots will be preserved.\n\n" +
        "Continue?",
    );

    if (!confirmed) return;

    try {
      const storageService = getStorageService();

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
