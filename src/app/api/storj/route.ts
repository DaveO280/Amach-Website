import { NextRequest, NextResponse } from "next/server";
import { getStorageService } from "@/storage";
import { getStorjTimelineService } from "@/storage";
import { getStorjConversationService } from "@/storage";
import { getStorjSyncService } from "@/storage";
import type { WalletEncryptionKey } from "@/utils/walletEncryption";

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
        const syncService = getStorjSyncService();
        result = await syncService.syncConversationMemory(
          userAddress,
          typedEncryptionKey,
          options,
        );
        break;
      }

      case "conversation/restore": {
        const syncService = getStorjSyncService();
        result = await syncService.restoreConversationMemory(
          userAddress,
          typedEncryptionKey,
          storjUri,
        );
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
