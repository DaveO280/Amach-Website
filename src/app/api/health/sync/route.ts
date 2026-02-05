/**
 * Health Data Sync API Endpoint
 *
 * Handles synchronization of health data between local storage (IndexedDB)
 * and remote storage (Storj).
 *
 * POST /api/health/sync
 * Body: {
 *   action: 'push' | 'pull' | 'status',
 *   userAddress: string,
 *   encryptionKey: WalletEncryptionKey,
 *   dataType?: 'apple-health' | 'bloodwork' | 'dexa' | 'all',
 *   data?: HealthDataPayload,  // Required for 'push'
 *   storjUri?: string,         // Required for 'pull', optional for 'status'
 * }
 *
 * Responses:
 * - push: { success: true, uri: string, hash: string }
 * - pull: { success: true, data: HealthData, lastSync: string }
 * - status: { success: true, lastSync: string, hasRemoteData: boolean }
 */

import { NextRequest, NextResponse } from "next/server";
import { getStorageService } from "@/storage";
import type { WalletEncryptionKey } from "@/utils/walletEncryption";

export const runtime = "nodejs";
export const maxDuration = 60;

type SyncAction = "push" | "pull" | "status";
type DataType = "apple-health" | "bloodwork" | "dexa" | "all";

interface SyncRequestBody {
  action: SyncAction;
  userAddress: string;
  encryptionKey: WalletEncryptionKey;
  dataType?: DataType;
  data?: unknown;
  storjUri?: string;
  lastKnownHash?: string;
}

interface SyncMetadata {
  dataType: string;
  syncedAt: string;
  recordCount: number;
  dateRange?: {
    start: string;
    end: string;
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as SyncRequestBody;

    // Validate required fields
    if (!body.action || !body.userAddress || !body.encryptionKey) {
      return NextResponse.json(
        { error: "action, userAddress, and encryptionKey are required" },
        { status: 400 },
      );
    }

    const {
      action,
      userAddress,
      encryptionKey,
      dataType = "apple-health",
    } = body;

    const storageService = getStorageService();

    switch (action) {
      case "push": {
        if (!body.data) {
          return NextResponse.json(
            { error: "data is required for push action" },
            { status: 400 },
          );
        }

        // Calculate record count for metadata
        let recordCount = 0;
        let dateRange: { start: string; end: string } | undefined;

        if (typeof body.data === "object" && body.data !== null) {
          const healthData = body.data as Record<string, unknown[]>;
          for (const metric in healthData) {
            if (Array.isArray(healthData[metric])) {
              recordCount += healthData[metric].length;

              // Extract date range from data
              const samples = healthData[metric] as Array<{
                startDate?: string;
              }>;
              for (const sample of samples) {
                if (sample.startDate) {
                  if (!dateRange) {
                    dateRange = {
                      start: sample.startDate,
                      end: sample.startDate,
                    };
                  } else {
                    if (sample.startDate < dateRange.start) {
                      dateRange.start = sample.startDate;
                    }
                    if (sample.startDate > dateRange.end) {
                      dateRange.end = sample.startDate;
                    }
                  }
                }
              }
            }
          }
        }

        const metadata: SyncMetadata = {
          dataType,
          syncedAt: new Date().toISOString(),
          recordCount,
          dateRange,
        };

        // Store with metadata
        const payload = {
          data: body.data,
          metadata,
        };

        console.log(`[Health Sync] Push: ${dataType}, ${recordCount} records`);

        const result = await storageService.storeHealthData(
          payload,
          userAddress,
          encryptionKey,
          { dataType },
        );

        return NextResponse.json({
          success: true,
          uri: result.storjUri,
          hash: result.contentHash,
          metadata,
        });
      }

      case "pull": {
        if (!body.storjUri) {
          return NextResponse.json(
            { error: "storjUri is required for pull action" },
            { status: 400 },
          );
        }

        console.log(`[Health Sync] Pull: ${body.storjUri}`);

        try {
          const result = await storageService.retrieveHealthData(
            body.storjUri,
            encryptionKey,
            body.lastKnownHash,
            userAddress,
          );

          return NextResponse.json({
            success: true,
            data: result.data,
            hash: result.contentHash,
            verified: result.verified,
            metadata: (result.data as { metadata?: SyncMetadata })?.metadata,
          });
        } catch (error) {
          // Handle case where data doesn't exist yet
          if (
            error instanceof Error &&
            (error.message.includes("NoSuchKey") ||
              error.message.includes("not found"))
          ) {
            return NextResponse.json({
              success: true,
              data: null,
              hasData: false,
              message: "No remote data found",
            });
          }
          throw error;
        }
      }

      case "status": {
        // Status check requires a storjUri to verify
        if (!body.storjUri) {
          return NextResponse.json({
            success: true,
            hasRemoteData: false,
            message: "No storjUri provided to check status",
          });
        }

        console.log(`[Health Sync] Status check: ${body.storjUri}`);

        try {
          // Try to retrieve to check existence and get metadata
          const result = await storageService.retrieveHealthData(
            body.storjUri,
            encryptionKey,
            undefined,
            userAddress,
          );

          const metadata = (result?.data as { metadata?: SyncMetadata })
            ?.metadata;

          return NextResponse.json({
            success: true,
            hasRemoteData: true,
            lastSync: metadata?.syncedAt ?? null,
            recordCount: metadata?.recordCount ?? null,
            dateRange: metadata?.dateRange ?? null,
            hash: result?.contentHash,
          });
        } catch (error) {
          // If we can't retrieve, data doesn't exist
          if (
            error instanceof Error &&
            (error.message.includes("NoSuchKey") ||
              error.message.includes("not found") ||
              error.message.includes("404"))
          ) {
            return NextResponse.json({
              success: true,
              hasRemoteData: false,
              lastSync: null,
            });
          }
          throw error;
        }
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (error) {
    console.error("[Health Sync] Error:", error);
    return NextResponse.json(
      {
        error: "Sync failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function OPTIONS(): Promise<NextResponse> {
  return NextResponse.json(
    {},
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    },
  );
}
