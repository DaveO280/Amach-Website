/**
 * Hook for Storj storage pruning
 *
 * Provides:
 * - Manual pruning trigger
 * - Automatic pruning suggestions
 * - Pruning status and progress
 *
 * ✅ Uses existing StorageService.deleteHealthData (already implemented!)
 * ✅ No blockchain deletion records needed (unlike timeline events)
 */

import type { StorjItem } from "@/storage/StorjPruningService";
import {
  buildPruningSummary,
  executePruning,
  type PruningResult,
  selectItemsToPrune,
} from "@/storage/StorjPruningService";
import {
  fetchAllStorjItems,
  createDeleteFunction,
  getStorageStats,
  formatStorageStats,
} from "@/storage/StorjPruningIntegration";
import type { StorageService } from "@/storage/StorageService";
import type { WalletEncryptionKey } from "@/utils/walletEncryption";
import { useState } from "react";

export interface PruningStatus {
  isAnalyzing: boolean;
  isPruning: boolean;
  itemsToReview: StorjItem[];
  lastResult?: PruningResult;
  error?: string;
}

export function useStorjPruning() {
  const [status, setStatus] = useState<PruningStatus>({
    isAnalyzing: false,
    isPruning: false,
    itemsToReview: [],
  });

  /**
   * Analyze Storj storage and suggest items to prune
   *
   * @param items - All items from Storj (with metadata)
   * @param dataType - Type of data to analyze
   */
  const analyzePruningCandidates = async (
    items: StorjItem[],
    dataType: string,
  ) => {
    setStatus((prev) => ({ ...prev, isAnalyzing: true, error: undefined }));

    try {
      console.log(
        `[Pruning] Analyzing ${items.length} items of type ${dataType}`,
      );

      const candidatesToPrune = selectItemsToPrune(items, dataType);

      console.log(
        `[Pruning] Found ${candidatesToPrune.length} candidates for pruning`,
      );

      setStatus((prev) => ({
        ...prev,
        isAnalyzing: false,
        itemsToReview: candidatesToPrune,
      }));

      return candidatesToPrune;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("[Pruning] Analysis failed:", error);

      setStatus((prev) => ({
        ...prev,
        isAnalyzing: false,
        error: errorMsg,
      }));

      return [];
    }
  };

  /**
   * Execute pruning for selected items
   *
   * @param itemsToPrune - Items to delete
   * @param deleteFunction - Function to delete from Storj
   */
  const executePruningOperation = async (
    itemsToPrune: StorjItem[],
    deleteFunction: (uri: string) => Promise<boolean>,
  ): Promise<PruningResult> => {
    setStatus((prev) => ({ ...prev, isPruning: true, error: undefined }));

    try {
      console.log(
        `[Pruning] Executing pruning for ${itemsToPrune.length} items`,
      );

      const result = await executePruning(itemsToPrune, deleteFunction);

      console.log("[Pruning] Execution complete:", result);

      setStatus((prev) => ({
        ...prev,
        isPruning: false,
        lastResult: result,
        itemsToReview: [], // Clear review list after pruning
      }));

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("[Pruning] Execution failed:", error);

      setStatus((prev) => ({
        ...prev,
        isPruning: false,
        error: errorMsg,
      }));

      throw error;
    }
  };

  /**
   * Get human-readable summary of last pruning operation
   */
  const getLastPruningSummary = (): string | null => {
    if (!status.lastResult) {
      return null;
    }

    return buildPruningSummary(status.lastResult);
  };

  /**
   * Calculate total space that would be freed by pruning candidates
   */
  const calculatePotentialSavings = (): number => {
    return status.itemsToReview.reduce(
      (total, item) => total + item.sizeBytes,
      0,
    );
  };

  /**
   * Reset pruning status
   */
  const resetPruningStatus = () => {
    setStatus({
      isAnalyzing: false,
      isPruning: false,
      itemsToReview: [],
    });
  };

  /**
   * Simplified one-step pruning (fetch + analyze + execute)
   *
   * @param storageService - Storage service instance
   * @param userAddress - User's wallet address
   * @param encryptionKey - Encryption key
   * @param dataType - Type of data to prune
   */
  const performCompletePruning = async (
    storageService: StorageService,
    userAddress: string,
    encryptionKey: WalletEncryptionKey,
    dataType: string,
  ): Promise<PruningResult> => {
    setStatus((prev) => ({
      ...prev,
      isAnalyzing: true,
      isPruning: true,
      error: undefined,
    }));

    try {
      // Fetch all items
      const items = await fetchAllStorjItems(
        storageService,
        userAddress,
        encryptionKey,
        dataType,
      );

      // Analyze and select items to prune
      const candidatesToPrune = selectItemsToPrune(items, dataType);

      setStatus((prev) => ({
        ...prev,
        itemsToReview: candidatesToPrune,
        isAnalyzing: false,
      }));

      if (candidatesToPrune.length === 0) {
        const result: PruningResult = {
          itemsScanned: items.length,
          itemsDeleted: 0,
          bytesFreed: 0,
          duplicatesRemoved: 0,
          errors: [],
        };

        setStatus((prev) => ({
          ...prev,
          isPruning: false,
          lastResult: result,
        }));

        return result;
      }

      // Execute pruning
      const deleteFunction = createDeleteFunction(
        storageService,
        userAddress,
        encryptionKey,
      );

      const result = await executePruning(candidatesToPrune, deleteFunction);

      setStatus((prev) => ({
        ...prev,
        isPruning: false,
        lastResult: result,
        itemsToReview: [],
      }));

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("[Pruning] Complete pruning failed:", error);

      setStatus((prev) => ({
        ...prev,
        isAnalyzing: false,
        isPruning: false,
        error: errorMsg,
      }));

      throw error;
    }
  };

  /**
   * Get storage statistics without pruning
   */
  const fetchStorageStats = async (
    storageService: StorageService,
    userAddress: string,
    encryptionKey: WalletEncryptionKey,
    dataType?: string,
  ) => {
    try {
      const stats = await getStorageStats(
        storageService,
        userAddress,
        encryptionKey,
        dataType,
      );

      const formatted = formatStorageStats(stats);
      console.log("[Pruning] Storage stats:", formatted);

      return { stats, formatted };
    } catch (error) {
      console.error("[Pruning] Failed to fetch storage stats:", error);
      throw error;
    }
  };

  return {
    status,
    analyzePruningCandidates,
    executePruningOperation,
    performCompletePruning,
    fetchStorageStats,
    getLastPruningSummary,
    calculatePotentialSavings,
    resetPruningStatus,
  };
}
