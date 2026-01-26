import { NextRequest, NextResponse } from "next/server";
import { getStorageService } from "@/storage";
import { getStorjTimelineService } from "@/storage";
import { getStorjConversationService } from "@/storage";
import { getStorjReportService } from "@/storage/StorjReportService";
import type { WalletEncryptionKey } from "@/utils/walletEncryption";
import { getKeyDerivationMessage } from "@/utils/walletEncryption";
import { verifyMessage } from "viem";
import { StorjClient } from "@/storage/StorjClient";
import type { ConversationMemory } from "@/types/conversationMemory";
import {
  generateLegacyAddressBucketName,
  generateLegacyAddressBucketNameNo0x,
  generateLegacyKeyedBucketName,
} from "@/utils/storjAccessControl";

export const runtime = "nodejs";
export const maxDuration = 60; // 60 seconds - allows for Storj operations

/**
 * API endpoint for Storj operations
 *
 * This route acts as a server-side proxy for client-side components to interact with Storj.
 * Required because AWS SDK and Node.js crypto module cannot run in the browser.
 *
 * Supported actions:
 * - timeline/store: Store a timeline event
 * - timeline/retrieve: Retrieve a timeline event
 * - conversation/store: Store conversation session
 * - conversation/retrieve: Retrieve conversation session
 * - conversation/sync: Sync conversation memory
 * - conversation/restore: Restore conversation memory
 * - storage/store: Generic data storage
 * - storage/retrieve: Generic data retrieval
 * - storage/update: Update existing data (overwrites at same URI)
 * - storage/list: List user data
 * - storage/delete: Delete data
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const {
      action,
      userAddress,
      encryptionKey,
      data,
      storjUri,
      dataType,
      expectedHash,
      options,
    } = body;

    if (!userAddress || !encryptionKey) {
      return NextResponse.json(
        { error: "User address and encryption key are required" },
        { status: 400 },
      );
    }

    const typedEncryptionKey = encryptionKey as WalletEncryptionKey;
    let result;

    switch (action) {
      // Timeline operations
      case "timeline/store": {
        if (!data) {
          return NextResponse.json(
            { error: "Event data is required for timeline/store" },
            { status: 400 },
          );
        }
        console.log(
          `📤 timeline/store: eventType=${data.eventType}, eventId=${data.id}`,
        );
        const timelineService = getStorjTimelineService();
        try {
          result = await timelineService.storeTimelineEvent(
            data,
            userAddress,
            typedEncryptionKey,
            options,
          );
          console.log(
            `📤 timeline/store result:`,
            JSON.stringify(result, null, 2),
          );
        } catch (storeError) {
          console.error(`❌ timeline/store error:`, storeError);
          result = {
            success: false,
            error:
              storeError instanceof Error
                ? storeError.message
                : "Unknown error",
          };
        }
        break;
      }

      case "timeline/retrieve": {
        if (!storjUri) {
          return NextResponse.json(
            { error: "storjUri is required for timeline/retrieve" },
            { status: 400 },
          );
        }
        console.log(
          `📥 timeline/retrieve: storjUri=${storjUri}, hasExpectedHash=${!!expectedHash}`,
        );
        const timelineService = getStorjTimelineService();
        try {
          result = await timelineService.retrieveTimelineEvent(
            storjUri,
            typedEncryptionKey,
            expectedHash,
          );
          console.log(
            `📥 timeline/retrieve result: ${result ? "found" : "null"}`,
          );
        } catch (retrieveError) {
          console.error(`❌ timeline/retrieve error:`, retrieveError);
          result = null;
        }
        break;
      }

      // Conversation operations
      case "conversation/store": {
        if (!data?.session || !data?.messages) {
          return NextResponse.json(
            {
              error: "Session and messages are required for conversation/store",
            },
            { status: 400 },
          );
        }
        const conversationService = getStorjConversationService();
        result = await conversationService.storeConversationSession(
          data.session,
          data.messages,
          userAddress,
          typedEncryptionKey,
          options,
        );
        break;
      }

      case "conversation/retrieve": {
        if (!storjUri) {
          return NextResponse.json(
            { error: "storjUri is required for conversation/retrieve" },
            { status: 400 },
          );
        }
        const conversationService = getStorjConversationService();
        result = await conversationService.retrieveConversationSession(
          storjUri,
          typedEncryptionKey,
        );
        break;
      }

      case "conversation/sync": {
        // NOTE: Server routes cannot read browser IndexedDB.
        // Client must send the ConversationMemory snapshot in `data`.
        if (!data) {
          return NextResponse.json(
            {
              error:
                "Conversation memory snapshot is required for conversation/sync",
            },
            { status: 400 },
          );
        }
        const conversationService = getStorjConversationService();
        result = await conversationService.syncMemoryToStorj(
          data as ConversationMemory,
          userAddress,
          typedEncryptionKey,
          options,
        );
        break;
      }

      case "conversation/restore": {
        // Restore returns the ConversationMemory snapshot to the client, which can save it to IndexedDB.
        const conversationService = getStorjConversationService();

        let history;
        if (storjUri) {
          history = await conversationService.retrieveConversationHistory(
            storjUri,
            typedEncryptionKey,
          );
        } else {
          const snapshots =
            await conversationService.listUserConversationHistory(
              userAddress,
              typedEncryptionKey,
            );
          if (!snapshots.length) {
            return NextResponse.json(
              { error: "No conversation history found on Storj" },
              { status: 404 },
            );
          }
          const latest = snapshots.sort(
            (a, b) => b.uploadedAt - a.uploadedAt,
          )[0];
          history = await conversationService.retrieveConversationHistory(
            latest.storjUri,
            typedEncryptionKey,
          );
        }

        if (!history) {
          return NextResponse.json(
            { error: "Failed to retrieve conversation history from Storj" },
            { status: 500 },
          );
        }

        const memory: ConversationMemory = {
          userId: history.userId,
          criticalFacts: history.criticalFacts.map((f) => ({
            id: f.id,
            category:
              f.category as ConversationMemory["criticalFacts"][0]["category"],
            value: f.value,
            context: f.context,
            dateIdentified: f.dateIdentified,
            isActive: f.isActive,
            source: "blockchain" as const,
            storageLocation: f.storageLocation as
              | "local"
              | "blockchain"
              | "both",
            blockchainTxHash: f.blockchainTxHash,
          })),
          importantSessions: history.sessions
            .filter(
              (s) => s.importance === "critical" || s.importance === "high",
            )
            .map((s) => ({
              id: s.id,
              date: new Date(s.startedAt).toISOString(),
              summary: s.summary || "",
              topics: s.topics,
              importance: s.importance,
              extractedFacts: s.extractedFacts || [],
              messageCount: s.messageCount,
            })),
          recentSessions: history.sessions
            .filter((s) => s.importance === "medium" || s.importance === "low")
            .map((s) => ({
              id: s.id,
              date: new Date(s.startedAt).toISOString(),
              summary: s.summary || "",
              topics: s.topics,
              importance: s.importance,
              extractedFacts: s.extractedFacts || [],
              messageCount: s.messageCount,
            })),
          preferences: history.preferences as ConversationMemory["preferences"],
          lastUpdated: new Date(history.lastSyncedAt).toISOString(),
          totalSessions: history.sessions.length,
          totalFactsExtracted: history.criticalFacts.length,
        };

        result = { success: true, memory };
        break;
      }

      // Generic storage operations
      case "storage/store": {
        if (!data || !dataType) {
          return NextResponse.json(
            { error: "Data and dataType are required for storage/store" },
            { status: 400 },
          );
        }
        const storageService = getStorageService();
        result = await storageService.storeHealthData(
          data,
          userAddress,
          typedEncryptionKey,
          { dataType, ...options },
        );
        break;
      }

      case "storage/retrieve": {
        if (!storjUri) {
          return NextResponse.json(
            { error: "storjUri is required for storage/retrieve" },
            { status: 400 },
          );
        }
        const storageService = getStorageService();
        result = await storageService.retrieveHealthData(
          storjUri,
          typedEncryptionKey,
          expectedHash,
          userAddress,
        );
        break;
      }

      case "storage/update": {
        if (!data || !dataType) {
          return NextResponse.json(
            { error: "Data and dataType are required for storage/update" },
            { status: 400 },
          );
        }
        const oldUri = body.oldStorjUri;
        if (!oldUri) {
          return NextResponse.json(
            { error: "oldStorjUri is required for storage/update" },
            { status: 400 },
          );
        }
        const storageService = getStorageService();
        result = await storageService.updateHealthData(
          oldUri,
          data,
          userAddress,
          typedEncryptionKey,
          { dataType, ...options },
        );
        break;
      }

      case "storage/list": {
        const storageService = getStorageService();
        result = await storageService.listUserData(
          userAddress,
          typedEncryptionKey,
          dataType,
        );
        break;
      }

      case "storage/list-legacy": {
        const signature = body?.signature as string | undefined;
        if (!signature) {
          return NextResponse.json(
            { error: "signature is required for storage/list-legacy" },
            { status: 400 },
          );
        }

        const message = getKeyDerivationMessage(userAddress);
        const ok = await verifyMessage({
          address: userAddress as `0x${string}`,
          message,
          signature: signature as `0x${string}`,
        });
        if (!ok) {
          return NextResponse.json(
            { error: "Invalid signature for wallet address" },
            { status: 401 },
          );
        }

        const envPrefix = process.env.STORJ_BUCKET_PREFIX || "amach-health";
        const prefixCandidates = Array.from(
          new Set([envPrefix, "amach-health", "amachhealth", "amach"]),
        );

        // Probe multiple historical formulas. We include:
        // - address-only legacy buckets
        // - keyed buckets with different key fragment sizes (some old versions varied this)
        const key = typedEncryptionKey.key || "";
        const keyFragments = Array.from(
          new Set(
            [
              key.substring(0, 16),
              key.substring(0, 32),
              key.substring(0, 64),
              key, // full key (rare, but probe)
            ].filter((s) => s && s.length > 0),
          ),
        );

        const bucketCandidates = prefixCandidates.flatMap((bucketPrefix) => [
          generateLegacyAddressBucketName(userAddress, bucketPrefix),
          generateLegacyAddressBucketNameNo0x(userAddress, bucketPrefix),
          ...keyFragments.map((frag) =>
            generateLegacyKeyedBucketName(userAddress, frag, bucketPrefix),
          ),
        ]);

        const storjClient = StorjClient.createClient();
        const filterDataType =
          dataType && dataType !== "all" ? (dataType as string) : undefined;

        let chosenBucket: string | null = null;
        let items: unknown[] = [];
        const candidateCounts: Array<{ bucket: string; count: number }> = [];

        for (const b of bucketCandidates) {
          // Always list without S3 prefix filtering to support legacy key layouts.
          const listedAll = await storjClient.listBucketByName(b, undefined);
          const listed = filterDataType
            ? listedAll.filter((it) => it.dataType === filterDataType)
            : listedAll;
          candidateCounts.push({ bucket: b, count: listed.length });
          if (!chosenBucket && listed.length > 0) {
            chosenBucket = b;
            items = listed;
          }
        }

        result = {
          bucketPrefix: envPrefix,
          prefixCandidates,
          keyFragments: keyFragments.map((s) => s.slice(0, 12) + "…"),
          bucketCandidates,
          candidateCounts,
          chosenBucket,
          items,
        };
        break;
      }

      case "storage/retrieve-legacy": {
        const signature = body?.signature as string | undefined;
        if (!storjUri) {
          return NextResponse.json(
            { error: "storjUri is required for storage/retrieve-legacy" },
            { status: 400 },
          );
        }
        if (!signature) {
          return NextResponse.json(
            { error: "signature is required for storage/retrieve-legacy" },
            { status: 400 },
          );
        }

        const message = getKeyDerivationMessage(userAddress);
        const ok = await verifyMessage({
          address: userAddress as `0x${string}`,
          message,
          signature: signature as `0x${string}`,
        });
        if (!ok) {
          return NextResponse.json(
            { error: "Invalid signature for wallet address" },
            { status: 401 },
          );
        }

        const storageService = getStorageService();
        // IMPORTANT: pass userAddress as undefined so StorjClient does NOT run bucket ownership validation.
        result = await storageService.retrieveHealthData(
          storjUri,
          typedEncryptionKey,
          expectedHash,
          undefined,
        );
        break;
      }

      case "storage/delete": {
        if (!storjUri) {
          return NextResponse.json(
            { error: "storjUri is required for storage/delete" },
            { status: 400 },
          );
        }
        const storageService = getStorageService();
        await storageService.deleteHealthData(
          storjUri,
          userAddress,
          typedEncryptionKey,
        );
        result = { success: true };
        break;
      }

      // Report operations (FHIR)
      case "report/store": {
        if (!data) {
          return NextResponse.json(
            { error: "Report data is required for report/store" },
            { status: 400 },
          );
        }
        const reportService = getStorjReportService();
        try {
          const stored = await reportService.storeReport(
            data,
            userAddress,
            typedEncryptionKey,
            options,
          );
          // Verify decryptability immediately after store (or reuse)
          let verifiedDecrypt = false;
          if (stored?.success && stored?.storjUri) {
            const reportType = data?.report?.type ?? data?.type;
            if (reportType === "bloodwork") {
              verifiedDecrypt = Boolean(
                await reportService.retrieveBloodworkReport(
                  stored.storjUri,
                  typedEncryptionKey,
                ),
              );
            } else {
              verifiedDecrypt = Boolean(
                await reportService.retrieveDexaReport(
                  stored.storjUri,
                  typedEncryptionKey,
                ),
              );
            }
          }
          result = { ...stored, verifiedDecrypt };
        } catch (storeError) {
          console.error(`❌ report/store error:`, storeError);
          result = {
            success: false,
            error:
              storeError instanceof Error
                ? storeError.message
                : "Unknown error",
          };
        }
        break;
      }

      case "report/retrieve": {
        if (!storjUri) {
          return NextResponse.json(
            { error: "storjUri is required for report/retrieve" },
            { status: 400 },
          );
        }
        const reportType = body?.reportType as string | undefined;
        const reportService = getStorjReportService();
        try {
          if (reportType === "bloodwork") {
            result = await reportService.retrieveBloodworkReport(
              storjUri,
              typedEncryptionKey,
              body?.rawText,
            );
          } else {
            result = await reportService.retrieveDexaReport(
              storjUri,
              typedEncryptionKey,
              body?.rawText,
            );
          }
        } catch (retrieveError) {
          console.error(`❌ report/retrieve error:`, retrieveError);
          result = null;
        }
        break;
      }

      default:
        return NextResponse.json(
          { error: `Invalid action: ${action}` },
          { status: 400 },
        );
    }

    return NextResponse.json({ success: true, result });
  } catch (error: unknown) {
    console.error("Storj API Error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const errorStack =
      process.env.NODE_ENV === "development" && error instanceof Error
        ? error.stack
        : undefined;

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        ...(errorStack && { stack: errorStack }),
      },
      { status: 500 },
    );
  }
}
