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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStorjPruning } from "@/hooks/useStorjPruning";
import { getStorageService } from "@/storage/StorageService";
import {
  getSnapshotInfo,
  formatSnapshotInfo,
} from "@/storage/StorjPruningIntegration";
import {
  getWalletDerivedEncryptionKey,
  type WalletEncryptionKey,
} from "@/utils/walletEncryption";
import { useState, useEffect } from "react";
import { Database, Trash2, Info, AlertCircle, CheckCircle } from "lucide-react";

interface StorageManagementSectionProps {
  userAddress: string;
  signMessage: (message: string) => Promise<string>;
}

interface StorageStats {
  totalItems: number;
  totalSizeMB: number;
  dataTypes: Record<string, { count: number; sizeMB: number }>;
}

export function StorageManagementSection({
  userAddress,
  signMessage,
}: StorageManagementSectionProps) {
  const {
    status,
    performCompletePruning,
    fetchStorageStats,
    getLastPruningSummary,
  } = useStorjPruning();

  const [encryptionKey, setEncryptionKey] =
    useState<WalletEncryptionKey | null>(null);
  const [isLoadingKey, setIsLoadingKey] = useState(false);
  const [keyError, setKeyError] = useState<string>("");

  const [stats, setStats] = useState<StorageStats | null>(null);
  const [snapshotInfo, setSnapshotInfo] = useState<string>("");
  const [selectedDataType, setSelectedDataType] = useState<string>("all");
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  // Initialize encryption key
  useEffect(() => {
    if (!userAddress || encryptionKey) return;

    const initKey = async () => {
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
      } finally {
        setIsLoadingKey(false);
      }
    };

    void initKey();
  }, [userAddress, signMessage, encryptionKey]);

  // Fetch initial stats when key is ready
  useEffect(() => {
    if (!encryptionKey) return;

    void handleRefreshStats();
  }, [encryptionKey]);

  const handleRefreshStats = async () => {
    if (!encryptionKey) return;

    setIsLoadingStats(true);
    try {
      const storageService = getStorageService();
      const dataType =
        selectedDataType === "all" ? undefined : selectedDataType;

      const { stats: rawStats } = await fetchStorageStats(
        storageService,
        userAddress,
        encryptionKey,
        dataType,
      );

      // Format stats for display
      const formattedStats: StorageStats = {
        totalItems: rawStats.totalItems,
        totalSizeMB: rawStats.totalSizeBytes / (1024 * 1024),
        dataTypes: Object.fromEntries(
          Object.entries(rawStats.byDataType).map(([type, data]) => [
            type,
            {
              count: data.count,
              sizeMB: data.sizeBytes / (1024 * 1024),
            },
          ]),
        ),
      };

      setStats(formattedStats);

      // Fetch snapshot info for health-raw data
      if (dataType === "health-raw" || !dataType) {
        const snapshots = await getSnapshotInfo(
          storageService,
          userAddress,
          encryptionKey,
          "health-raw",
        );
        const formatted = formatSnapshotInfo(snapshots);
        setSnapshotInfo(formatted);
      }
    } catch (error) {
      console.error("[StorageManagement] Failed to fetch stats:", error);
    } finally {
      setIsLoadingStats(false);
    }
  };

  const handlePrune = async (dataType: string) => {
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
      const storageService = getStorageService();
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

      // Refresh stats after pruning
      await handleRefreshStats();
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
                onClick={() => {
                  setKeyError("");
                  setEncryptionKey(null);
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
        {/* Storage Statistics */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">
              Storage Overview
            </h3>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRefreshStats}
              disabled={
                isLoadingStats || status.isAnalyzing || status.isPruning
              }
            >
              {isLoadingStats ? "Loading..." : "Refresh"}
            </Button>
          </div>

          {stats && (
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-600 font-medium">Total Items</p>
                <p className="text-2xl font-bold text-blue-900">
                  {stats.totalItems}
                </p>
              </div>
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <p className="text-xs text-purple-600 font-medium">
                  Total Size
                </p>
                <p className="text-2xl font-bold text-purple-900">
                  {stats.totalSizeMB.toFixed(1)} MB
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Data Type Breakdown */}
        {stats && Object.keys(stats.dataTypes).length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">
              By Data Type
            </h3>
            <div className="space-y-2">
              {Object.entries(stats.dataTypes).map(([type, data]) => (
                <div
                  key={type}
                  className="flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-200"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{type}</p>
                    <p className="text-xs text-gray-600">
                      {data.count} items • {data.sizeMB.toFixed(2)} MB
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handlePrune(type)}
                    disabled={status.isAnalyzing || status.isPruning}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Clean
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Snapshot Info */}
        {snapshotInfo && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Info className="h-4 w-4" />
              Protected Snapshots
            </h3>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono">
                {snapshotInfo}
              </pre>
            </div>
          </div>
        )}

        {/* Pruning Controls */}
        <div className="pt-3 border-t">
          <Tabs value={selectedDataType} onValueChange={setSelectedDataType}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="conversation-session">Chats</TabsTrigger>
              <TabsTrigger value="health-raw">Health Data</TabsTrigger>
              <TabsTrigger value="context-vault">Context</TabsTrigger>
            </TabsList>
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
          </Tabs>
        </div>

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
