"use client";

import { useHealthDataContext } from "@/components/HealthDataContextWrapper";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAi } from "@/store/aiStore";
import { parseHealthReport } from "@/utils/reportParsers";
import { Send, FileText } from "lucide-react";
import Papa from "papaparse";
import React, { useEffect, useRef, useState } from "react";
import { healthDataStore } from "../../data/store/healthDataStore";
import { parsePDF } from "../../utils/pdfParser";
import { useWalletService } from "@/hooks/useWalletService";
import { MessageLimitPopup } from "@/components/ui/MessageLimitPopup";
import { ReportParserViewer } from "./ReportParserViewer";
import { getCachedWalletEncryptionKey } from "@/utils/walletEncryption";
import type { ParsedReportSummary } from "@/types/reportData";
import { getWalletDerivedEncryptionKey } from "@/utils/walletEncryption";
import { generateSearchTag, getUserSecret } from "@/utils/searchableEncryption";
import { getChainEventTypeForReportType } from "@/utils/storjChainMarkerRegistry";
import { conversationMemoryStore } from "@/data/store/conversationMemoryStore";
import type { ConversationMemory } from "@/types/conversationMemory";

// Define types for our message interface
interface MessageType {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

interface CosaintChatUIProps {
  uploadFileButtonRef?: React.RefObject<HTMLButtonElement>;
}

const CosaintChatUI: React.FC<CosaintChatUIProps> = ({
  uploadFileButtonRef,
}) => {
  const {
    messages,
    sendMessage,
    isLoading,
    error,
    clearMessages,
    useMultiAgent,
    setUseMultiAgent,
  } = useAi();
  const walletService = useWalletService();
  const { isConnected, address, signMessage } = walletService;
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const {
    metrics,
    uploadedFiles,
    addUploadedFile,
    removeUploadedFile,
    addParsedReports,
    clearChatHistory,
    reports,
    removeReport,
    updateReport,
  } = useHealthDataContext();

  // Add state for upload form
  const [uploadRawData, setUploadRawData] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  // State for saved files from IndexedDB
  const [savedFiles, setSavedFiles] = useState<
    Array<{
      id: string;
      fileName: string;
      fileType: string;
      fileSize: number;
      uploadedAt: string;
      lastAccessed: string;
    }>
  >([]);
  const [loadingStartTime, setLoadingStartTime] = useState<number | null>(null);
  const [loadingElapsedSec, setLoadingElapsedSec] = useState<number>(0);
  const [lastResponseMs, setLastResponseMs] = useState<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [autoExpandOnSend, setAutoExpandOnSend] = useState(true);
  const [messageCount, setMessageCount] = useState(0);
  const [showMessageLimitPopup, setShowMessageLimitPopup] = useState(false);
  const [showReportViewer, setShowReportViewer] = useState(false);

  // Dev-only: quick way to adjust Quick-mode token budget without using the console.
  const isDev = process.env.NODE_ENV === "development";
  const [showDevTools, setShowDevTools] = useState<boolean>(() => {
    if (!isDev) return false;
    try {
      const raw = window.localStorage.getItem("cosaint_show_dev_tools");
      if (raw === null) return true;
      return raw === "true";
    } catch {
      return true;
    }
  });
  const [quickMaxTokensUi, setQuickMaxTokensUi] = useState<string>(() => {
    if (!isDev) return "";
    try {
      return window.localStorage.getItem("cosaint_quick_max_tokens") || "";
    } catch {
      return "";
    }
  });
  const [devMemorySyncLoading, setDevMemorySyncLoading] = useState(false);
  const [devMemorySyncError, setDevMemorySyncError] = useState<string>("");
  const [devMemorySyncResult, setDevMemorySyncResult] = useState<{
    storjUri?: string;
    contentHash?: string;
    raw?: unknown;
  } | null>(null);
  const [devStorjHistoryLoading, setDevStorjHistoryLoading] = useState(false);
  const [devStorjHistoryError, setDevStorjHistoryError] = useState<string>("");
  const [devStorjHistoryItems, setDevStorjHistoryItems] = useState<
    Array<{
      uri: string;
      contentHash: string;
      size: number;
      uploadedAt: number;
      dataType: string;
      metadata?: Record<string, string>;
    }>
  >([]);
  const [devStorjHistorySelected, setDevStorjHistorySelected] = useState<{
    uri: string;
    json: string;
  } | null>(null);
  const [devStorjRestoreLoading, setDevStorjRestoreLoading] = useState(false);
  const [devStorjRestoreError, setDevStorjRestoreError] = useState<string>("");
  const [devStorjRestoreOk, setDevStorjRestoreOk] = useState<string>("");
  const [devVeniceSessionTestLoading, setDevVeniceSessionTestLoading] =
    useState(false);
  const [devVeniceSessionTestError, setDevVeniceSessionTestError] =
    useState<string>("");
  const [devVeniceSessionTestResult, setDevVeniceSessionTestResult] = useState<{
    secret: string;
    firstResponse: string;
    secondResponse: string;
    passed: boolean;
  } | null>(null);

  const closeDevMemorySync = (): void => {
    setDevMemorySyncLoading(false);
    setDevMemorySyncError("");
    setDevMemorySyncResult(null);
  };
  const closeDevStorjViewer = (): void => {
    setDevStorjHistoryLoading(false);
    setDevStorjHistoryError("");
    setDevStorjHistoryItems([]);
    setDevStorjHistorySelected(null);
    setDevStorjRestoreLoading(false);
    setDevStorjRestoreError("");
    setDevStorjRestoreOk("");
  };
  const closeDevVeniceSessionTest = (): void => {
    setDevVeniceSessionTestLoading(false);
    setDevVeniceSessionTestError("");
    setDevVeniceSessionTestResult(null);
  };

  // File manager UI (keeps chat uncluttered)
  const [showFileManager, setShowFileManager] = useState(false);
  const [fileManagerTab, setFileManagerTab] = useState<
    "attached" | "saved" | "storj" | "upload"
  >("attached");

  // Import parsed reports directly from Storj (skip re-parsing)
  const [storjImportError, setStorjImportError] = useState<string>("");
  const [storjImportLoading, setStorjImportLoading] = useState(false);
  const [storjImportSuccess, setStorjImportSuccess] = useState<string>("");
  const [storjReports, setStorjReports] = useState<
    Array<{
      uri: string;
      dataType: string;
      contentHash?: string;
      uploadedAt?: string;
      sizeBytes?: number;
      metadata?: Record<string, string>;
    }>
  >([]);
  const [selectedStorjUris, setSelectedStorjUris] = useState<Set<string>>(
    () => new Set(),
  );
  const [savingReportsToStorj, setSavingReportsToStorj] = useState(false);
  const [saveReportsError, setSaveReportsError] = useState<string>("");
  const ENABLE_STORJ_SAVE_UI = process.env.NODE_ENV === "development";

  const AUTO_EXPAND_STORAGE_KEY = "cosaintAutoExpandOnSend";
  const MESSAGE_COUNT_STORAGE_KEY = "cosaintMessageCountNoWallet";
  const MAX_MESSAGES_WITHOUT_WALLET = 10;
  const WARNING_MESSAGE_COUNT = 5;

  // Load message count from localStorage on mount
  useEffect(() => {
    if (!isConnected) {
      const savedCount = localStorage.getItem(MESSAGE_COUNT_STORAGE_KEY);
      if (savedCount) {
        const count = parseInt(savedCount, 10);
        setMessageCount(count);
        // Show warning popup if at warning threshold and not already at limit
        if (
          count >= WARNING_MESSAGE_COUNT &&
          count < MAX_MESSAGES_WITHOUT_WALLET
        ) {
          setShowMessageLimitPopup(true);
        }
      }
    } else {
      // Reset count when wallet is connected
      setMessageCount(0);
      localStorage.removeItem(MESSAGE_COUNT_STORAGE_KEY);
      setShowMessageLimitPopup(false);
    }
  }, [isConnected]);

  const devSyncConversationMemoryToStorj = async (opts?: {
    force?: boolean;
    seedIfMissing?: boolean;
  }): Promise<void> => {
    if (!isDev) return;

    try {
      setDevMemorySyncLoading(true);
      setDevMemorySyncError("");
      setDevMemorySyncResult(null);

      if (!isConnected || !address) {
        setDevMemorySyncError("Connect a wallet to sync memory to Storj.");
        return;
      }

      const encryptionKey = await getCachedWalletEncryptionKey(
        address,
        signMessage,
      );

      await conversationMemoryStore.initialize();
      const memoryFromDb: ConversationMemory | null =
        await conversationMemoryStore.getMemory(address);
      const memory: ConversationMemory | null =
        memoryFromDb ||
        (opts?.seedIfMissing
          ? {
              userId: address,
              criticalFacts: [],
              importantSessions: [],
              recentSessions: [],
              preferences: {},
              lastUpdated: new Date().toISOString(),
              totalSessions: 0,
              totalFactsExtracted: 0,
            }
          : null);
      if (!memory) {
        setDevMemorySyncError(
          "No local conversation memory found yet. Use “seed + sync” to test Storj without waiting for a thread rollover.",
        );
        return;
      }

      console.log("[DevMemorySync] Syncing ConversationMemory to Storj", {
        userId: address,
        hasLocalMemory: !!memoryFromDb,
        seeded: !!opts?.seedIfMissing && !memoryFromDb,
        sessions:
          (memory.importantSessions?.length || 0) +
          (memory.recentSessions?.length || 0),
        facts: memory.criticalFacts?.length || 0,
        force: !!opts?.force,
      });

      const resp = await fetch("/api/storj", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "conversation/sync",
          userAddress: address,
          encryptionKey,
          data: memory,
          options: {
            background: false,
            ...(opts?.force
              ? { metadata: { devForceAt: new Date().toISOString() } }
              : {}),
          },
        }),
      });

      const payload = (await resp.json()) as {
        success?: boolean;
        error?: string;
        result?: { success?: boolean; storjUri?: string; contentHash?: string };
      };

      if (
        !resp.ok ||
        payload?.success === false ||
        payload?.result?.success === false
      ) {
        throw new Error(payload?.error || "Storj sync failed");
      }

      setDevMemorySyncResult({
        storjUri: payload?.result?.storjUri,
        contentHash: payload?.result?.contentHash,
        raw: payload,
      });

      console.log("[DevMemorySync] Sync result", payload);
    } catch (e) {
      setDevMemorySyncError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setDevMemorySyncLoading(false);
    }
  };

  const devListStorjConversationHistory = async (): Promise<void> => {
    if (!isDev) return;
    try {
      setDevStorjHistoryLoading(true);
      setDevStorjHistoryError("");
      setDevStorjHistorySelected(null);
      setDevStorjRestoreError("");
      setDevStorjRestoreOk("");

      if (!isConnected || !address) {
        setDevStorjHistoryError("Connect a wallet to list Storj history.");
        return;
      }

      const encryptionKey = await getCachedWalletEncryptionKey(
        address,
        signMessage,
      );

      const resp = await fetch("/api/storj", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "storage/list",
          userAddress: address,
          encryptionKey,
          dataType: "conversation-history",
        }),
      });
      const payload = (await resp.json()) as {
        success?: boolean;
        error?: string;
        result?: unknown;
      };
      if (!resp.ok || payload?.success === false) {
        throw new Error(payload?.error || "Failed to list Storj items");
      }

      const items = (
        Array.isArray(payload?.result) ? payload.result : []
      ) as Array<{
        uri: string;
        contentHash: string;
        size: number;
        uploadedAt: number;
        dataType: string;
        metadata?: Record<string, string>;
      }>;

      items.sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
      setDevStorjHistoryItems(items);
      console.log("[DevStorjHistory] Listed conversation-history snapshots", {
        count: items.length,
      });
    } catch (e) {
      setDevStorjHistoryError(e instanceof Error ? e.message : "List failed");
    } finally {
      setDevStorjHistoryLoading(false);
    }
  };

  const devViewStorjConversationHistory = async (item: {
    uri: string;
    contentHash?: string;
  }): Promise<void> => {
    if (!isDev) return;
    try {
      setDevStorjHistoryLoading(true);
      setDevStorjHistoryError("");
      setDevStorjHistorySelected(null);

      if (!isConnected || !address) {
        setDevStorjHistoryError("Connect a wallet to view Storj history.");
        return;
      }

      const encryptionKey = await getCachedWalletEncryptionKey(
        address,
        signMessage,
      );

      const resp = await fetch("/api/storj", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "storage/retrieve",
          userAddress: address,
          encryptionKey,
          storjUri: item.uri,
          expectedHash: item.contentHash,
        }),
      });
      const payload = (await resp.json()) as {
        success?: boolean;
        error?: string;
        result?: { data?: unknown };
      };
      if (!resp.ok || payload?.success === false) {
        throw new Error(payload?.error || "Failed to retrieve Storj item");
      }

      const data = payload?.result?.data ?? payload?.result;
      const json = JSON.stringify(data, null, 2);
      setDevStorjHistorySelected({ uri: item.uri, json });
      console.log("[DevStorjHistory] Retrieved snapshot", { uri: item.uri });
    } catch (e) {
      setDevStorjHistoryError(e instanceof Error ? e.message : "View failed");
    } finally {
      setDevStorjHistoryLoading(false);
    }
  };

  const devRestoreConversationMemoryFromStorj = async (storjUri?: string) => {
    if (!isDev) return;
    try {
      setDevStorjRestoreLoading(true);
      setDevStorjRestoreError("");
      setDevStorjRestoreOk("");

      if (!isConnected || !address) {
        setDevStorjRestoreError("Connect a wallet to restore memory.");
        return;
      }

      const encryptionKey = await getCachedWalletEncryptionKey(
        address,
        signMessage,
      );

      const resp = await fetch("/api/storj", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "conversation/restore",
          userAddress: address,
          encryptionKey,
          storjUri,
        }),
      });
      const payload = (await resp.json()) as {
        success?: boolean;
        error?: string;
        result?: { success?: boolean; memory?: ConversationMemory };
      };
      if (
        !resp.ok ||
        payload?.success === false ||
        payload?.result?.success === false
      ) {
        throw new Error(payload?.error || "Restore failed");
      }

      const memory = payload?.result?.memory;
      if (!memory) {
        throw new Error("Restore succeeded but no memory payload returned");
      }

      await conversationMemoryStore.initialize();
      await conversationMemoryStore.saveMemory(memory);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("conversation-memory-updated"));
      }

      setDevStorjRestoreOk(
        `Restored memory from ${storjUri ? "selected snapshot" : "latest snapshot"}`,
      );
      console.log("[DevStorjHistory] Restored ConversationMemory", {
        from: storjUri ?? "latest",
      });
    } catch (e) {
      setDevStorjRestoreError(
        e instanceof Error ? e.message : "Restore failed",
      );
    } finally {
      setDevStorjRestoreLoading(false);
    }
  };

  const devTestVeniceApiSessionMemory = async (): Promise<void> => {
    if (!isDev) return;
    try {
      setDevVeniceSessionTestLoading(true);
      setDevVeniceSessionTestError("");
      setDevVeniceSessionTestResult(null);

      const secret = `alpha-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;

      const common = {
        temperature: 0,
        max_tokens: 120,
        venice_parameters: {
          disable_thinking: true,
          strip_thinking_response: true,
          include_venice_system_prompt: false,
        },
      };

      // Call 1: ask the model to remember a secret (in this request only).
      const r1 = await fetch("/api/venice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: `Reply only with "ACK". Remember this exact string for the *next message in this same conversation*: ${secret}`,
            },
          ],
          ...common,
        }),
      });
      const j1 = (await r1.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: string;
      };
      const firstResponse = String(
        j1?.choices?.[0]?.message?.content ?? "",
      ).trim();

      // Call 2: DO NOT send previous messages. If Venice API is stateful, it should still recall.
      const r2 = await fetch("/api/venice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content:
                "What exact string did I ask you to remember? Reply only with the string.",
            },
          ],
          ...common,
        }),
      });
      const j2 = (await r2.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: string;
      };
      const secondResponse = String(
        j2?.choices?.[0]?.message?.content ?? "",
      ).trim();

      const passed = secondResponse.includes(secret);
      setDevVeniceSessionTestResult({
        secret,
        firstResponse,
        secondResponse,
        passed,
      });

      console.log("[DevVeniceSessionTest] result", {
        secret,
        firstResponse,
        secondResponse,
        passed,
      });
    } catch (e) {
      setDevVeniceSessionTestError(
        e instanceof Error ? e.message : "Test failed",
      );
    } finally {
      setDevVeniceSessionTestLoading(false);
    }
  };

  // Ensure multi-agent is disabled when wallet is not connected
  useEffect(() => {
    if (!isConnected && useMultiAgent) {
      setUseMultiAgent(false);
    }
  }, [isConnected, useMultiAgent, setUseMultiAgent]);

  const inferReportType = (
    fileName: string,
  ): "dexa" | "bloodwork" | undefined => {
    const lower = fileName.toLowerCase();
    if (lower.includes("dexa") || lower.includes("dxa")) {
      return "dexa";
    }
    if (
      lower.includes("lab") ||
      lower.includes("blood") ||
      lower.includes("panel") ||
      lower.includes("lipid") ||
      lower.includes("hormone")
    ) {
      return "bloodwork";
    }
    return undefined;
  };

  const getMeta = (
    md: Record<string, string> | undefined,
    key: string,
  ): string | undefined => {
    if (!md) return undefined;
    const lowerKey = key.toLowerCase();
    return md[key] ?? md[lowerKey];
  };

  const loadStorjReportsList = async (): Promise<void> => {
    if (!address) {
      setStorjImportError("Connect your wallet to import saved reports.");
      return;
    }

    setStorjImportLoading(true);
    setStorjImportError("");
    setStorjImportSuccess("");
    setStorjReports([]);
    setSelectedStorjUris(new Set());

    try {
      const encryptionKey = await getCachedWalletEncryptionKey(
        address,
        signMessage,
      );

      const fetchList = async (dataType: string) => {
        const res = await fetch("/api/storj", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "storage/list",
            userAddress: address,
            encryptionKey,
            dataType,
          }),
        });
        const json = (await res.json()) as {
          success?: boolean;
          result?: unknown;
          error?: string;
        };
        if (!res.ok || json.success === false) {
          throw new Error(
            json.error || `Failed to list Storj reports (${dataType})`,
          );
        }
        return (
          (json.result as Array<{
            uri: string;
            metadata?: Record<string, string>;
            contentHash?: string;
            uploadedAt?: string;
            sizeBytes?: number;
          }>) || []
        );
      };

      const [bloodwork, dexa] = await Promise.all([
        fetchList("bloodwork-report-fhir"),
        fetchList("dexa-report-fhir"),
      ]);

      const merged = [
        ...bloodwork.map((r) => ({ ...r, dataType: "bloodwork-report-fhir" })),
        ...dexa.map((r) => ({ ...r, dataType: "dexa-report-fhir" })),
      ].sort((a, b) => {
        const aMs = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
        const bMs = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
        return bMs - aMs;
      });

      setStorjReports(merged);
    } catch (e) {
      setStorjImportError(
        e instanceof Error ? e.message : "Failed to load reports from Storj",
      );
    } finally {
      setStorjImportLoading(false);
    }
  };

  const toggleSelectedStorjUri = (uri: string): void => {
    setSelectedStorjUris((prev) => {
      const next = new Set(prev);
      if (next.has(uri)) next.delete(uri);
      else next.add(uri);
      return next;
    });
  };

  const importSelectedStorjReports = async (): Promise<void> => {
    if (!address) {
      setStorjImportError("Connect your wallet to import saved reports.");
      return;
    }
    if (selectedStorjUris.size === 0) {
      setStorjImportError("Select a report to import.");
      return;
    }

    setStorjImportLoading(true);
    setStorjImportError("");
    setStorjImportSuccess("");

    try {
      const encryptionKey = await getCachedWalletEncryptionKey(
        address,
        signMessage,
      );

      const selectedList = Array.from(selectedStorjUris);
      const results: ParsedReportSummary[] = [];

      for (const storjUri of selectedList) {
        const selected = storjReports.find((r) => r.uri === storjUri);
        const reportType =
          getMeta(selected?.metadata, "reporttype") ||
          (selected?.dataType === "bloodwork-report-fhir"
            ? "bloodwork"
            : "dexa");

        const res = await fetch("/api/storj", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "report/retrieve",
            userAddress: address,
            encryptionKey,
            storjUri,
            reportType,
          }),
        });

        const json = (await res.json()) as {
          success?: boolean;
          result?: unknown;
          error?: string;
        };

        if (!res.ok || json.success === false) {
          throw new Error(
            json.error || `Failed to retrieve report: ${storjUri}`,
          );
        }

        const report = json.result as ParsedReportSummary["report"] | null;
        if (!report) {
          throw new Error("Storj returned no report data");
        }

        results.push({
          report,
          extractedAt: new Date().toISOString(),
          storjUri,
          savedToStorjAt: selected?.uploadedAt || new Date().toISOString(),
        });
      }

      addParsedReports(results);
      // Make it obvious these are now part of the chat context by showing them in the Uploaded Files pills.
      const existingStorjUris = new Set(
        uploadedFiles
          .map((f) => f.rawData?.["storjUri"])
          .filter((v): v is string => typeof v === "string" && v.length > 0),
      );

      let attachedCount = 0;
      for (const r of results) {
        if (!r.storjUri || existingStorjUris.has(r.storjUri)) continue;
        existingStorjUris.add(r.storjUri);
        attachedCount += 1;

        const date =
          r.report.type === "bloodwork"
            ? r.report.reportDate
            : r.report.scanDate;
        const source = r.report.source ? String(r.report.source) : "";

        addUploadedFile({
          type: "storj",
          summary: `Storj: ${r.report.type.toUpperCase()}${date ? ` • ${date}` : ""}${source ? ` • ${source}` : ""}`,
          date: new Date().toISOString(),
          rawData: {
            importedFromStorj: true,
            storjUri: r.storjUri,
            reportType: r.report.type,
            reportDate: date,
            source,
          },
          parsedReports: [r],
        });
      }

      setStorjImportSuccess(
        `Imported ${results.length} report(s) — ${attachedCount} added to chat context.`,
      );
      setSelectedStorjUris(new Set());
      setShowReportViewer(true);
      setShowFileManager(false);
      setFileManagerTab("attached");
    } catch (e) {
      setStorjImportError(
        e instanceof Error ? e.message : "Failed to import report from Storj",
      );
    } finally {
      setStorjImportLoading(false);
    }
  };

  const formatContentHash = (hash: string): `0x${string}` => {
    const h = hash.startsWith("0x") ? hash : `0x${hash}`;
    return h as `0x${string}`;
  };

  const recordReportUploadOnChain = async (params: {
    storjUri: string;
    contentHash: string;
    reportType: "dexa" | "bloodwork";
  }): Promise<void> => {
    if (!address) throw new Error("Wallet not connected");
    const walletClient = await walletService.getWalletClient();
    if (!walletClient) throw new Error("Failed to get wallet client");

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

    const userSecret = await getUserSecret({
      address,
      signMessage,
    });

    const chainEventType = getChainEventTypeForReportType(params.reportType);
    if (!chainEventType) {
      throw new Error(
        `No chain eventType registered for reportType: ${params.reportType}`,
      );
    }
    const searchTag = generateSearchTag(chainEventType, userSecret);
    const formattedHash = formatContentHash(params.contentHash);
    if (formattedHash.length !== 66) {
      throw new Error(
        `Invalid contentHash length: expected 66 chars (0x + 64 hex), got ${formattedHash.length}`,
      );
    }

    const txHash = await walletClient.writeContract({
      address: SECURE_HEALTH_PROFILE_CONTRACT as `0x${string}`,
      abi: secureHealthProfileAbi,
      functionName: "addHealthEventWithStorj",
      args: ["", searchTag as `0x${string}`, params.storjUri, formattedHash],
      chain: getActiveChain(),
      account: walletClient.account ?? (address as `0x${string}`),
      gas: 2000000n,
    });

    await publicClient.waitForTransactionReceipt({ hash: txHash });
  };

  const saveAllParsedReportsToStorj = async (): Promise<void> => {
    if (!ENABLE_STORJ_SAVE_UI) return;
    if (!isConnected || !address) {
      setSaveReportsError("Connect your wallet to save reports to Storj.");
      return;
    }
    if (reports.length === 0) {
      setSaveReportsError("No parsed reports available to save.");
      return;
    }

    const unsaved = reports
      .map((r, idx) => ({ r, idx }))
      .filter(({ r }) => !r.storjUri);

    if (unsaved.length === 0) {
      setSaveReportsError("");
      setShowReportViewer(true);
      return;
    }

    setSavingReportsToStorj(true);
    setSaveReportsError("");

    try {
      // Derive key once for the whole batch
      const encryptionKey = await getWalletDerivedEncryptionKey(
        address,
        signMessage,
      );

      for (const { r, idx } of unsaved) {
        const resp = await fetch("/api/storj", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "report/store",
            userAddress: address,
            encryptionKey,
            data: r,
            options: {
              metadata: {
                uploadedAt: new Date().toISOString(),
                source: "chat-ui",
              },
            },
          }),
        });

        const payload = await resp.json();
        const result = payload?.result;

        if (result?.success && result?.storjUri) {
          const contentHash =
            (result?.contentHash as string | undefined) ||
            (result?.existingContentHash as string | undefined) ||
            "";
          if (!contentHash) {
            throw new Error(
              "Storj save succeeded but no contentHash was returned; cannot record on-chain marker.",
            );
          }

          await recordReportUploadOnChain({
            storjUri: result.storjUri,
            contentHash,
            reportType: r.report.type,
          });

          updateReport(idx, {
            storjUri: result.storjUri,
            savedToStorjAt: new Date().toISOString(),
          });
        } else {
          throw new Error(result?.error || "Failed to save report to Storj");
        }
      }

      setShowReportViewer(true);
    } catch (e) {
      setSaveReportsError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingReportsToStorj(false);
    }
  };

  // Scroll to the bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus the input field when the component mounts
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Load saved files when component mounts
  useEffect(() => {
    loadSavedFiles();
  }, []);

  // Reset loading time when loading state changes
  useEffect(() => {
    if (!isLoading) {
      setLoadingStartTime(null);
    }
  }, [isLoading]);

  useEffect((): (() => void) | void => {
    if (!isExpanded) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return (): void => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isExpanded]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const storedValue = window.localStorage.getItem(AUTO_EXPAND_STORAGE_KEY);
      if (storedValue !== null) {
        setAutoExpandOnSend(storedValue === "true");
      }
    } catch (error) {
      console.warn("Failed to read auto-expand preference:", error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(
        AUTO_EXPAND_STORAGE_KEY,
        String(autoExpandOnSend),
      );
    } catch (error) {
      console.warn("Failed to persist auto-expand preference:", error);
    }
  }, [autoExpandOnSend]);

  const formatDuration = (ms: number): string => {
    if (!Number.isFinite(ms) || ms < 0) return "";
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}m ${s}s`;
  };

  // In-button timer (unobtrusive): show elapsed seconds while a response is generating.
  useEffect(() => {
    if (!isLoading || loadingStartTime === null) {
      setLoadingElapsedSec(0);
      return;
    }
    const update = (): void => {
      setLoadingElapsedSec(
        Math.max(0, Math.floor((Date.now() - loadingStartTime) / 1000)),
      );
    };
    update();
    const id = window.setInterval(update, 250);
    return () => window.clearInterval(id);
  }, [isLoading, loadingStartTime]);

  const handleSendMessage = async (): Promise<void> => {
    if (input.trim() === "") return;

    // Check message limit when wallet is not connected
    if (!isConnected) {
      // Block if already at or over limit (after 10 messages, block the 11th+)
      if (messageCount >= MAX_MESSAGES_WITHOUT_WALLET) {
        setShowMessageLimitPopup(true);
        return;
      }

      // Update message count
      const newCount = messageCount + 1;
      setMessageCount(newCount);
      localStorage.setItem(MESSAGE_COUNT_STORAGE_KEY, newCount.toString());

      // Show warning popup at warning threshold (5th message)
      if (newCount === WARNING_MESSAGE_COUNT) {
        setShowMessageLimitPopup(true);
      }

      // After 10th message is sent (newCount = 10), allow it but next attempt will be blocked
      // The popup will show when they try to send the 11th message
    }

    const startedAt = Date.now();
    setLoadingStartTime(startedAt);
    if (autoExpandOnSend && !isExpanded) {
      setIsExpanded(true);
    }
    await sendMessage(input);
    setInput("");
    setLastResponseMs(Date.now() - startedAt);
    setLoadingStartTime(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Load saved files from IndexedDB
  const loadSavedFiles = async (): Promise<void> => {
    try {
      const files = await healthDataStore.getAllUploadedFiles();
      setSavedFiles(
        files.map((file) => ({
          id: file.id,
          fileName: file.fileName,
          fileType: file.fileType,
          fileSize: file.fileSize,
          uploadedAt: file.uploadedAt,
          lastAccessed: file.lastAccessed,
        })),
      );
    } catch (error) {
      console.error("❌ Failed to load saved files:", error);
    }
  };

  useEffect(() => {
    if (!showFileManager) return;
    if (fileManagerTab === "saved") {
      void loadSavedFiles();
    }
    if (fileManagerTab === "storj" && isConnected) {
      void loadStorjReportsList();
    }
  }, [showFileManager, fileManagerTab, isConnected]);

  // Load a saved file into chat context
  const loadSavedFileIntoContext = async (fileId: string): Promise<void> => {
    setIsProcessingFile(true);
    try {
      const file = await healthDataStore.getUploadedFile(fileId);
      if (file) {
        const parsedReports =
          file.parsedContent && typeof file.parsedContent === "string"
            ? await parseHealthReport(file.parsedContent, {
                sourceName: file.fileName,
                useAI: true,
              })
            : [];

        if (parsedReports.length) {
          addParsedReports(parsedReports);
        }

        addUploadedFile({
          type: file.fileType.includes("pdf")
            ? "pdf"
            : file.fileType.split("/")[1] || "unknown",
          summary: `${file.fileName} (${file.fileType.toUpperCase()}) - ${file.fileSize} bytes`,
          date: file.uploadedAt,
          rawData: {
            fileName: file.fileName,
            fileSize: file.fileSize,
            fileType: file.fileType,
            parsedType: file.fileType.includes("pdf")
              ? "pdf"
              : file.fileType.split("/")[1] || "unknown",
            content: file.parsedContent,
            preview:
              file.parsedContent.length > 10000
                ? file.parsedContent.substring(0, 10000) + "... (truncated)"
                : file.parsedContent,
            pageCount: file.pageCount,
            metadata: file.metadata,
          },
          parsedReports,
        });
        console.log(`✅ Loaded saved file into context: ${file.fileName}`);
      }
    } catch (error) {
      console.error("❌ Failed to load saved file:", error);
    } finally {
      setIsProcessingFile(false);
    }
  };

  // Delete a saved file from IndexedDB
  const deleteSavedFile = async (fileId: string): Promise<void> => {
    try {
      await healthDataStore.deleteUploadedFile(fileId);
      console.log(`✅ Deleted saved file: ${fileId}`);
      // Reload the saved files list
      await loadSavedFiles();
    } catch (error) {
      console.error("❌ Failed to delete saved file:", error);
    }
  };

  // Parse file content based on file type
  const parseFileContent = async (
    file: File,
  ): Promise<{ content: string; type: string }> => {
    return new Promise((resolve, reject): void => {
      const reader = new FileReader();

      reader.onload = (e): void => {
        try {
          const content = e.target?.result as string;

          if (file.type === "text/csv" || file.name.endsWith(".csv")) {
            // Parse CSV files
            const results = Papa.parse(content, {
              header: true,
            });
            resolve({
              content: JSON.stringify(results.data, null, 2),
              type: "csv",
            });
          } else if (file.type === "text/xml" || file.name.endsWith(".xml")) {
            // For XML files, store the raw content
            resolve({
              content: content,
              type: "xml",
            });
          } else if (
            file.type === "application/json" ||
            file.name.endsWith(".json")
          ) {
            // Parse JSON files
            try {
              const parsed = JSON.parse(content);
              resolve({
                content: JSON.stringify(parsed, null, 2),
                type: "json",
              });
            } catch (error) {
              reject(
                new Error(
                  `JSON parsing error: ${error instanceof Error ? error.message : "Invalid JSON"}`,
                ),
              );
            }
          } else if (file.type === "text/plain" || file.name.endsWith(".txt")) {
            // For text files, store the raw content
            resolve({
              content: content,
              type: "text",
            });
          } else if (
            file.type === "application/pdf" ||
            file.name.endsWith(".pdf")
          ) {
            // For PDF files, we need to handle them separately since they're binary
            reject(new Error("PDF files should be handled by the PDF parser"));
          } else {
            // For other file types, try to read as text
            resolve({
              content: content,
              type: "unknown",
            });
          }
        } catch (error) {
          reject(
            new Error(
              `File processing error: ${error instanceof Error ? error.message : "Unknown error"}`,
            ),
          );
        }
      };

      reader.onerror = (): void => {
        reject(new Error("Failed to read file"));
      };

      reader.readAsText(file);
    });
  };

  // Handler for upload form submit
  const handleUploadSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!uploadRawData) {
      setUploadError("Please select a file to upload.");
      return;
    }

    setIsProcessingFile(true);
    setUploadError("");

    try {
      // Get the file from the input
      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const file = fileInput?.files?.[0];

      if (!file) {
        setUploadError("No file selected.");
        return;
      }

      console.log(
        `[FileUpload] Starting upload: ${file.name} (${file.size} bytes)`,
      );

      // Parse the file content based on file type
      let parsedContent: {
        content: string;
        type: string;
        pageCount?: number;
        metadata?: Record<string, unknown>;
      };

      if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
        console.log(`[FileUpload] Parsing PDF file...`);
        // Use PDF parser for PDF files
        const pdfResult = await parsePDF(file);
        console.log(
          `[FileUpload] PDF parsed: ${pdfResult.pageCount} pages, ${pdfResult.text.length} characters`,
        );
        parsedContent = {
          content: pdfResult.text,
          type: "pdf",
          pageCount: pdfResult.pageCount,
          metadata: pdfResult.metadata,
        };
      } else {
        console.log(`[FileUpload] Parsing text file...`);
        // Use regular parser for other file types
        parsedContent = await parseFileContent(file);
        console.log(
          `[FileUpload] Text parsed: ${parsedContent.content.length} characters`,
        );
      }

      // Add the parsed file to context
      console.log(
        `[FileUpload] Extracting structured reports from parsed content...`,
      );
      const parsedReports =
        parsedContent.type === "pdf" || parsedContent.type === "text"
          ? await parseHealthReport(parsedContent.content, {
              inferredType: inferReportType(file.name),
              sourceName: file.name,
              useAI: true, // Use AI parsing for better extraction
            })
          : [];

      console.log(
        `[FileUpload] Extracted ${parsedReports.length} report(s):`,
        parsedReports.map((r) => {
          if (r.report.type === "bloodwork") {
            return {
              type: r.report.type,
              hasMetrics: r.report.metrics?.length || 0,
              hasRegions: "N/A",
            };
          } else {
            // Must be dexa
            return {
              type: r.report.type,
              hasMetrics: "N/A",
              hasRegions:
                r.report.type === "dexa"
                  ? r.report.regions?.length || 0
                  : "N/A",
            };
          }
        }),
      );

      if (parsedReports.length) {
        addParsedReports(parsedReports);
      }

      addUploadedFile({
        type: parsedContent.type,
        summary: `${file.name} (${parsedContent.type.toUpperCase()}) - ${file.size} bytes`,
        date: new Date().toISOString(),
        rawData: {
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          parsedType: parsedContent.type,
          content: parsedContent.content,
          // For large files, store a preview instead of full content
          preview:
            parsedContent.content.length > 10000
              ? parsedContent.content.substring(0, 10000) + "... (truncated)"
              : parsedContent.content,
          // Additional PDF-specific data
          pageCount: parsedContent.pageCount || undefined,
          metadata: parsedContent.metadata || undefined,
        },
        parsedReports,
      });

      // Save the parsed file to IndexedDB for persistence
      try {
        const fileId = await healthDataStore.saveUploadedFile(
          file,
          parsedContent.content,
          parsedContent.metadata,
          parsedContent.pageCount,
        );
        console.log(`✅ File saved to IndexedDB with ID: ${fileId}`);
      } catch (dbError) {
        console.error("❌ Failed to save file to IndexedDB:", dbError);
        // Don't fail the upload if IndexedDB save fails
      }

      setShowFileManager(false);
      setFileManagerTab("attached");
      setUploadRawData("");
      console.log(
        `✅ File uploaded successfully: ${file.name} (${parsedContent.type})`,
      );
    } catch (error) {
      console.error("❌ File upload error:", error);
      setUploadError(
        `Failed to process file: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsProcessingFile(false);
    }
  };

  const containerClasses = isExpanded
    ? "flex h-full flex-col gap-4 overflow-hidden"
    : "flex flex-col min-h-[75vh] max-h-[90vh] lg:h-[calc(100vh-220px)]";

  const chatHistoryClasses = isExpanded
    ? "flex-1 overflow-y-auto rounded-3xl border border-emerald-100 bg-white p-6 shadow-lg"
    : "mb-4 flex-1 overflow-y-auto rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm";

  const chatLayout = (
    <div className={containerClasses}>
      <div className="flex flex-col gap-3">
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Chat mode
            </span>
            <div className="flex flex-col gap-1">
              <div className="inline-flex w-fit rounded-lg border border-emerald-200 bg-white shadow-sm relative group">
                <button
                  type="button"
                  onClick={() => setUseMultiAgent(false)}
                  className={`whitespace-nowrap px-3 py-1 text-xs font-medium transition-colors ${
                    !useMultiAgent
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-emerald-700 hover:bg-emerald-50"
                  }`}
                >
                  Quick (general advice)
                </button>
                <button
                  type="button"
                  onClick={() => isConnected && setUseMultiAgent(true)}
                  disabled={!isConnected}
                  className={`whitespace-nowrap px-3 py-1 text-xs font-medium transition-colors relative ${
                    useMultiAgent
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-emerald-700 hover:bg-emerald-50"
                  } ${!isConnected ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  Deep (uses your health data)
                </button>
                {!isConnected && (
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-2 bg-emerald-900/95 text-white text-xs rounded-md invisible group-hover:visible pointer-events-none whitespace-nowrap z-50">
                    🔒 Create a wallet to unlock Deep mode
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 -mb-0.5 border-4 border-transparent border-b-emerald-900/95"></div>
                  </div>
                )}
              </div>
              {!useMultiAgent ? (
                <span className="text-[11px] text-amber-700">
                  Quick mode uses chat history only (no health data/reports).
                  Switch to Deep for personalized, data-informed answers.
                </span>
              ) : (
                <span className="text-[11px] text-amber-700">
                  Deep mode uses your connected health data/reports and runs
                  specialists before Cosaint replies (slower).
                </span>
              )}

              {isDev && (
                <div className="mt-2 rounded border border-emerald-200 bg-white/70 p-2 text-[11px] text-slate-700">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-emerald-800">
                      Dev tools
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded border border-slate-200 bg-white px-2 py-0.5 hover:bg-slate-50"
                        onClick={() => {
                          const next = !showDevTools;
                          setShowDevTools(next);
                          try {
                            window.localStorage.setItem(
                              "cosaint_show_dev_tools",
                              String(next),
                            );
                          } catch {
                            // ignore
                          }
                        }}
                      >
                        {showDevTools ? "hide" : "show"}
                      </button>
                      {showDevTools && (
                        <button
                          type="button"
                          className="rounded border border-slate-200 bg-white px-2 py-0.5 hover:bg-slate-50"
                          onClick={() => {
                            closeDevMemorySync();
                            closeDevStorjViewer();
                            closeDevVeniceSessionTest();
                          }}
                          title="Clear/close all dev panels"
                        >
                          close all
                        </button>
                      )}
                    </div>
                  </div>

                  {showDevTools && (
                    <div className="mt-2 flex flex-col gap-3">
                      {!useMultiAgent && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">
                            Quick debug max_tokens:
                          </span>
                          {[
                            { label: "1500", value: "1500" },
                            { label: "4000", value: "4000" },
                            { label: "8000", value: "8000" },
                          ].map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              className={`rounded border px-2 py-0.5 ${
                                (quickMaxTokensUi || "1500") === opt.value
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                                  : "border-slate-200 bg-white hover:bg-slate-50"
                              }`}
                              onClick={() => {
                                try {
                                  window.localStorage.setItem(
                                    "cosaint_quick_max_tokens",
                                    opt.value,
                                  );
                                  setQuickMaxTokensUi(opt.value);
                                } catch {
                                  // ignore
                                }
                              }}
                              title="Sets localStorage.cosaint_quick_max_tokens"
                            >
                              {opt.label}
                            </button>
                          ))}
                          <button
                            type="button"
                            className="rounded border border-slate-200 bg-white px-2 py-0.5 hover:bg-slate-50"
                            onClick={() => {
                              try {
                                window.localStorage.removeItem(
                                  "cosaint_quick_max_tokens",
                                );
                                setQuickMaxTokensUi("");
                              } catch {
                                // ignore
                              }
                            }}
                            title="Clears localStorage.cosaint_quick_max_tokens"
                          >
                            reset
                          </button>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">Dev: memory sync</span>
                        <button
                          type="button"
                          className="rounded border border-slate-200 bg-white px-2 py-0.5 hover:bg-slate-50 disabled:opacity-50"
                          disabled={devMemorySyncLoading}
                          onClick={() =>
                            void devSyncConversationMemoryToStorj()
                          }
                        >
                          {devMemorySyncLoading
                            ? "syncing..."
                            : "sync to Storj"}
                        </button>
                        <button
                          type="button"
                          className="rounded border border-slate-200 bg-white px-2 py-0.5 hover:bg-slate-50 disabled:opacity-50"
                          disabled={devMemorySyncLoading}
                          onClick={() =>
                            void devSyncConversationMemoryToStorj({
                              force: true,
                            })
                          }
                        >
                          force
                        </button>
                        <button
                          type="button"
                          className="rounded border border-slate-200 bg-white px-2 py-0.5 hover:bg-slate-50 disabled:opacity-50"
                          disabled={devMemorySyncLoading}
                          onClick={() =>
                            void devSyncConversationMemoryToStorj({
                              seedIfMissing: true,
                            })
                          }
                        >
                          seed + sync
                        </button>
                        <button
                          type="button"
                          className="rounded border border-slate-200 bg-white px-2 py-0.5 hover:bg-slate-50"
                          onClick={closeDevMemorySync}
                          title="Clear memory sync status"
                        >
                          close
                        </button>
                        {!isConnected && (
                          <span className="text-slate-500">connect wallet</span>
                        )}
                        {devMemorySyncError && (
                          <span className="text-rose-700">
                            {devMemorySyncError}
                          </span>
                        )}
                        {devMemorySyncResult?.storjUri && (
                          <span className="text-emerald-700">
                            saved: {devMemorySyncResult.storjUri}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">
                            Dev: Storj chat history
                          </span>
                          <button
                            type="button"
                            className="rounded border border-slate-200 bg-white px-2 py-0.5 hover:bg-slate-50 disabled:opacity-50"
                            disabled={devStorjHistoryLoading}
                            onClick={() =>
                              void devListStorjConversationHistory()
                            }
                          >
                            {devStorjHistoryLoading ? "loading..." : "list"}
                          </button>
                          <button
                            type="button"
                            className="rounded border border-slate-200 bg-white px-2 py-0.5 hover:bg-slate-50 disabled:opacity-50"
                            disabled={devStorjRestoreLoading}
                            onClick={() =>
                              void devRestoreConversationMemoryFromStorj()
                            }
                          >
                            {devStorjRestoreLoading
                              ? "restoring..."
                              : "restore latest"}
                          </button>
                          <button
                            type="button"
                            className="rounded border border-slate-200 bg-white px-2 py-0.5 hover:bg-slate-50"
                            onClick={closeDevStorjViewer}
                            title="Clear Storj viewer results"
                          >
                            close
                          </button>
                          <span className="text-slate-500">
                            {devStorjHistoryItems.length
                              ? `${devStorjHistoryItems.length} snapshots`
                              : "no list loaded"}
                          </span>
                          {devStorjHistoryError && (
                            <span className="text-rose-700">
                              {devStorjHistoryError}
                            </span>
                          )}
                          {devStorjRestoreError && (
                            <span className="text-rose-700">
                              {devStorjRestoreError}
                            </span>
                          )}
                          {devStorjRestoreOk && (
                            <span className="text-emerald-700">
                              {devStorjRestoreOk}
                            </span>
                          )}
                        </div>

                        {devStorjHistoryItems.length > 0 && (
                          <div className="max-h-40 overflow-auto rounded border border-slate-200 bg-white p-2">
                            <div className="flex flex-col gap-1">
                              {devStorjHistoryItems.slice(0, 10).map((it) => (
                                <div
                                  key={it.uri}
                                  className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-1 last:border-b-0 last:pb-0"
                                >
                                  <span className="text-slate-600">
                                    {new Date(it.uploadedAt).toLocaleString()} ·{" "}
                                    {(it.size / 1024).toFixed(1)} KB
                                  </span>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <button
                                      type="button"
                                      className="rounded border border-slate-200 bg-white px-2 py-0.5 hover:bg-slate-50"
                                      onClick={() =>
                                        void devViewStorjConversationHistory({
                                          uri: it.uri,
                                          contentHash: it.contentHash,
                                        })
                                      }
                                    >
                                      view
                                    </button>
                                    <button
                                      type="button"
                                      className="rounded border border-slate-200 bg-white px-2 py-0.5 hover:bg-slate-50"
                                      onClick={() =>
                                        void devRestoreConversationMemoryFromStorj(
                                          it.uri,
                                        )
                                      }
                                    >
                                      restore
                                    </button>
                                    <span className="text-slate-500 truncate max-w-[320px]">
                                      {it.uri}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {devStorjHistorySelected && (
                          <div className="rounded border border-slate-200 bg-white p-2">
                            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                              <span className="text-slate-600 truncate max-w-[520px]">
                                {devStorjHistorySelected.uri}
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  className="rounded border border-slate-200 bg-white px-2 py-0.5 hover:bg-slate-50"
                                  onClick={() => {
                                    try {
                                      void navigator.clipboard.writeText(
                                        devStorjHistorySelected.json,
                                      );
                                    } catch {
                                      // ignore
                                    }
                                  }}
                                >
                                  copy JSON
                                </button>
                                <button
                                  type="button"
                                  className="rounded border border-slate-200 bg-white px-2 py-0.5 hover:bg-slate-50"
                                  onClick={() =>
                                    setDevStorjHistorySelected(null)
                                  }
                                >
                                  close
                                </button>
                              </div>
                            </div>
                            <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-[10px] text-slate-800">
                              {devStorjHistorySelected.json}
                            </pre>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">
                            Dev: Venice “session memory” test
                          </span>
                          <button
                            type="button"
                            className="rounded border border-slate-200 bg-white px-2 py-0.5 hover:bg-slate-50 disabled:opacity-50"
                            disabled={devVeniceSessionTestLoading}
                            onClick={() => void devTestVeniceApiSessionMemory()}
                          >
                            {devVeniceSessionTestLoading
                              ? "testing..."
                              : "run test"}
                          </button>
                          <button
                            type="button"
                            className="rounded border border-slate-200 bg-white px-2 py-0.5 hover:bg-slate-50"
                            onClick={closeDevVeniceSessionTest}
                            title="Clear Venice session test output"
                          >
                            close
                          </button>
                          {devVeniceSessionTestError && (
                            <span className="text-rose-700">
                              {devVeniceSessionTestError}
                            </span>
                          )}
                          {devVeniceSessionTestResult && (
                            <span
                              className={
                                devVeniceSessionTestResult.passed
                                  ? "text-emerald-700"
                                  : "text-amber-700"
                              }
                            >
                              {devVeniceSessionTestResult.passed
                                ? "PASS (stateful)"
                                : "FAIL (stateless)"}
                            </span>
                          )}
                        </div>

                        {devVeniceSessionTestResult && (
                          <div className="rounded border border-slate-200 bg-white p-2">
                            <div className="text-slate-600">
                              Secret:{" "}
                              <span className="font-mono">
                                {devVeniceSessionTestResult.secret}
                              </span>
                            </div>
                            <div className="mt-1 text-slate-600">
                              Call #1:{" "}
                              <span className="font-mono">
                                {devVeniceSessionTestResult.firstResponse ||
                                  "(empty)"}
                              </span>
                            </div>
                            <div className="mt-1 text-slate-600">
                              Call #2:{" "}
                              <span className="font-mono">
                                {devVeniceSessionTestResult.secondResponse ||
                                  "(empty)"}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1"></div>
          <div className="flex items-center gap-3 self-end sm:self-auto">
            <label className="flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-emerald-700 shadow-sm">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-emerald-600"
                checked={autoExpandOnSend}
                onChange={(event) => setAutoExpandOnSend(event.target.checked)}
              />
              Auto expand on send
            </label>
            <Button
              size="sm"
              variant="outline"
              className="whitespace-nowrap"
              onClick={() => setIsExpanded((prev) => !prev)}
            >
              {isExpanded ? "Exit expanded view" : "Expand view"}
            </Button>
          </div>
        </div>

        {!isExpanded && (
          <div className="flex flex-col items-start gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                ref={uploadFileButtonRef}
                size="sm"
                className="w-fit bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => {
                  setShowFileManager(true);
                  setFileManagerTab("upload");
                  setUploadError("");
                  setStorjImportError("");
                  setStorjImportSuccess("");
                  setSaveReportsError("");
                }}
              >
                Upload File to Context
              </Button>

              <Button
                size="sm"
                variant="outline"
                className="w-fit"
                onClick={() => {
                  setShowFileManager(true);
                  setFileManagerTab("attached");
                  setUploadError("");
                  setStorjImportError("");
                  setStorjImportSuccess("");
                  setSaveReportsError("");
                }}
              >
                Manage files
                <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800">
                  {uploadedFiles.length} attached
                </span>
              </Button>

              {reports.length > 0 && (
                <span className="text-xs text-emerald-800">
                  Parsed reports:{" "}
                  <span className="font-semibold">{reports.length}</span>
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <Dialog
        open={showFileManager}
        onOpenChange={(open) => {
          setShowFileManager(open);
          if (!open) {
            setStorjImportError("");
            setStorjImportSuccess("");
            setUploadError("");
            setSaveReportsError("");
          }
        }}
      >
        <DialogContent
          preventOutsideClose
          className="max-w-3xl max-h-[85vh] overflow-y-auto bg-white text-gray-900"
        >
          <DialogHeader>
            <DialogTitle>File Manager</DialogTitle>
          </DialogHeader>

          <Tabs
            value={fileManagerTab}
            onValueChange={(v) =>
              setFileManagerTab(v as "attached" | "saved" | "storj" | "upload")
            }
          >
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="attached">
                Attached ({uploadedFiles.length})
              </TabsTrigger>
              <TabsTrigger value="upload">Upload</TabsTrigger>
              <TabsTrigger value="saved">
                Saved ({savedFiles.length})
              </TabsTrigger>
              <TabsTrigger value="storj" disabled={!isConnected}>
                Storj
              </TabsTrigger>
            </TabsList>

            <TabsContent value="attached" className="mt-4 space-y-3">
              {saveReportsError && (
                <div className="text-xs text-red-700">{saveReportsError}</div>
              )}

              {uploadedFiles.length === 0 ? (
                <div className="text-sm text-gray-600">
                  No files attached to chat yet.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-gray-600">
                      These files are available to Cosaint during chat.
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {reports && reports.length > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowReportViewer(true)}
                          className="flex items-center gap-1"
                        >
                          <FileText className="h-3 w-3" />
                          View Parsed Reports ({reports.length})
                        </Button>
                      )}
                      {ENABLE_STORJ_SAVE_UI &&
                        isConnected &&
                        reports.length > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={
                              savingReportsToStorj ||
                              reports.filter((r) => !r.storjUri).length === 0
                            }
                            onClick={() => void saveAllParsedReportsToStorj()}
                            title="Save all parsed reports (DEXA/Bloodwork) to Storj and record on-chain markers"
                          >
                            {savingReportsToStorj
                              ? "Saving..."
                              : `Save ${reports.filter((r) => !r.storjUri).length} to Storj`}
                          </Button>
                        )}
                    </div>
                  </div>

                  <div className="flex max-h-56 flex-col gap-2 overflow-y-auto pr-1">
                    {uploadedFiles.map((file, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded border bg-white px-3 py-2 text-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">
                            {file.summary}
                          </div>
                          <div className="text-xs text-gray-500">
                            Attached {new Date(file.date).toLocaleString()}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => removeUploadedFile(idx)}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="upload" className="mt-4 space-y-3">
              <form
                onSubmit={handleUploadSubmit}
                className="rounded-lg border border-emerald-100 bg-emerald-50 p-3"
              >
                <div className="mb-2">
                  <label className="mb-1 block text-xs font-semibold">
                    File
                  </label>
                  <input
                    type="file"
                    className="w-full rounded border p-2 text-sm"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setUploadRawData(
                          JSON.stringify({
                            fileName: file.name,
                            size: file.size,
                            type: file.type,
                          }),
                        );
                      } else {
                        setUploadRawData("");
                      }
                    }}
                    accept=".csv,.xml,.json,.txt,.pdf,text/csv,text/xml,application/json,text/plain,application/pdf"
                    required
                  />
                  {uploadRawData && (
                    <div className="mt-1 text-xs text-gray-600">
                      File selected: {JSON.parse(uploadRawData).fileName}
                    </div>
                  )}
                </div>
                {uploadError && (
                  <div className="mb-2 text-xs text-red-600">{uploadError}</div>
                )}
                {isProcessingFile && (
                  <div className="mb-2 flex items-center gap-2 text-xs text-emerald-700">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent"></div>
                    <span>Parsing file and extracting structured data...</span>
                  </div>
                )}
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isProcessingFile}
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    {isProcessingFile ? "Processing..." : "Upload"}
                  </Button>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="saved" className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">Saved Files</div>
                <Button size="sm" variant="outline" onClick={loadSavedFiles}>
                  Refresh
                </Button>
              </div>
              {savedFiles.length === 0 ? (
                <div className="text-sm text-gray-600">
                  No saved files found.
                </div>
              ) : (
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {savedFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between rounded border bg-white p-2 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">
                          {file.fileName}
                        </div>
                        <div className="text-xs text-gray-500">
                          {file.fileType} • {(file.fileSize / 1024).toFixed(1)}{" "}
                          KB
                        </div>
                        <div className="text-xs text-gray-400">
                          {new Date(file.uploadedAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="ml-2 flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => loadSavedFileIntoContext(file.id)}
                        >
                          Load to chat
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteSavedFile(file.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="storj" className="mt-4 space-y-3">
              {!isConnected ? (
                <div className="text-sm text-gray-600">
                  Connect your wallet to import saved reports from Storj.
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={loadStorjReportsList}
                      disabled={storjImportLoading}
                    >
                      {storjImportLoading ? "Loading..." : "Refresh list"}
                    </Button>
                    <Button
                      size="sm"
                      onClick={importSelectedStorjReports}
                      disabled={
                        storjImportLoading || selectedStorjUris.size === 0
                      }
                      className="bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      {storjImportLoading
                        ? "Importing..."
                        : `Import selected (${selectedStorjUris.size})`}
                    </Button>
                  </div>

                  {storjImportError && (
                    <div className="text-xs text-red-700">
                      {storjImportError}
                    </div>
                  )}
                  {storjImportSuccess && (
                    <div className="text-xs text-emerald-800">
                      {storjImportSuccess}
                    </div>
                  )}

                  <div className="max-h-64 overflow-y-auto rounded border border-gray-100">
                    {storjReports.length === 0 ? (
                      <div className="p-2 text-xs text-gray-600">
                        {storjImportLoading
                          ? "Loading saved reports..."
                          : "No saved reports found yet."}
                      </div>
                    ) : (
                      storjReports.map((r) => {
                        const reportType =
                          getMeta(r.metadata, "reporttype") ||
                          (r.dataType === "bloodwork-report-fhir"
                            ? "bloodwork"
                            : "dexa");
                        const date =
                          getMeta(r.metadata, "scandate") ||
                          getMeta(r.metadata, "reportdate") ||
                          r.uploadedAt ||
                          "";
                        const label = `${reportType.toUpperCase()}${date ? ` • ${date}` : ""}`;

                        return (
                          <button
                            key={r.uri}
                            type="button"
                            onClick={() => toggleSelectedStorjUri(r.uri)}
                            className={`w-full px-2 py-2 text-left text-xs hover:bg-emerald-50 ${
                              selectedStorjUris.has(r.uri)
                                ? "bg-emerald-50 border-l-4 border-emerald-600"
                                : ""
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={selectedStorjUris.has(r.uri)}
                                onChange={() => toggleSelectedStorjUri(r.uri)}
                                onClick={(e) => e.stopPropagation()}
                                className="h-3.5 w-3.5 accent-emerald-600"
                              />
                              <div className="font-semibold text-emerald-900">
                                {label}
                              </div>
                            </div>
                            <div className="truncate text-[11px] text-gray-600">
                              {r.uri}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Report Parser Viewer Modal */}
      {showReportViewer && reports && reports.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-6xl h-[90vh] bg-white rounded-lg shadow-xl">
            <ReportParserViewer
              reports={reports}
              onClose={() => setShowReportViewer(false)}
              onDeleteReport={(index) => {
                removeReport(index);
                // If we deleted the last report, close the viewer
                if (reports.length <= 1) {
                  setShowReportViewer(false);
                }
              }}
              onUpdateReport={updateReport}
            />
          </div>
        </div>
      )}

      {/* Report Parser Viewer Modal */}
      {showReportViewer && reports && reports.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-6xl h-[90vh] bg-white rounded-lg shadow-xl">
            <ReportParserViewer
              reports={reports}
              onClose={() => setShowReportViewer(false)}
              onDeleteReport={(index) => {
                removeReport(index);
                // If we deleted the last report, close the viewer
                if (reports.length <= 1) {
                  setShowReportViewer(false);
                }
              }}
              onUpdateReport={updateReport}
            />
          </div>
        </div>
      )}

      {!isExpanded && (
        <div className="mb-2 text-sm text-emerald-800">
          Available Metrics:{" "}
          {metrics
            ? Object.keys(metrics)
                .map((key) => {
                  if (key === "hrv") return "HRV";
                  if (key === "restingHR") return "Resting HR";
                  return (
                    key.charAt(0).toUpperCase() +
                    key
                      .slice(1)
                      .split(/(?=[A-Z])/)
                      .join(" ")
                  );
                })
                .join(", ")
            : "None"}
        </div>
      )}

      {messages.length > 0 && (
        <div className="mb-2 flex justify-end">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              clearMessages();
              clearChatHistory();
            }}
            disabled={isLoading}
          >
            Clear Chat
          </Button>
        </div>
      )}

      <div className={chatHistoryClasses}>
        {isProcessingFile ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent"></div>
            <p className="text-lg font-medium text-emerald-700">
              Processing file...
            </p>
            <p className="mt-2 text-sm text-emerald-600">
              Parsing PDF and extracting structured data with AI
            </p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-gray-500">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
              <span className="text-2xl">🌿</span>
            </div>
            <h3 className="mb-2 text-lg font-semibold text-emerald-700">
              Welcome to Cosaint AI Health Companion
            </h3>
            <p className="max-w-md text-sm">
              I&apos;m here to provide holistic health insights combining
              traditional wisdom with modern science. How can I help you today?
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message: MessageType) => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[80%] break-words rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-line shadow-sm ${
                    message.role === "user"
                      ? "bg-emerald-600 text-white"
                      : "border border-amber-100 bg-amber-50 text-amber-900"
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {error && (
        <div className="mb-2 rounded bg-red-50 p-2 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="relative">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>): void =>
            setInput(e.target.value)
          }
          onKeyDown={handleKeyDown}
          placeholder="Ask Cosaint about your health..."
          className="min-h-[60px] w-full resize-none rounded-md border border-gray-300 p-3 pr-12 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
          maxLength={500}
          disabled={isLoading}
        />
        <Button
          className="absolute bottom-2 right-2"
          size="sm"
          onClick={handleSendMessage}
          disabled={isLoading || input.trim() === ""}
        >
          {isLoading ? (
            <div className="flex items-center gap-1">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"></div>
              <span className="text-xs">{`${loadingElapsedSec}s`}</span>
            </div>
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>

      <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
        <div>
          {lastResponseMs !== null
            ? `Last: ${formatDuration(lastResponseMs)}`
            : ""}
        </div>
        <div>{input.length}/500</div>
      </div>

      {/* Message Limit Popup */}
      {!isConnected && (
        <MessageLimitPopup
          isVisible={showMessageLimitPopup}
          onClose={() => setShowMessageLimitPopup(false)}
          messageCount={messageCount}
          maxMessages={MAX_MESSAGES_WITHOUT_WALLET}
        />
      )}
    </div>
  );

  return (
    <>
      {isExpanded && (
        <div className="fixed inset-0 z-40 bg-emerald-950/40 backdrop-blur-sm transition-opacity" />
      )}
      {isExpanded ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <div className="flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-emerald-100 bg-gradient-to-br from-white via-emerald-50/60 to-white p-6 shadow-2xl">
            {chatLayout}
          </div>
        </div>
      ) : (
        chatLayout
      )}
    </>
  );
};

export default CosaintChatUI;
