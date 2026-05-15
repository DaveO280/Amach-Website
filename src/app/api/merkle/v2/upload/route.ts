/**
 * POST /api/merkle/v2/upload
 *
 * Receives a wallet's baseline-window OR finish-window v2 daily-summary
 * leaves from the iOS app, server-side serializes each leaf into its
 * canonical 124-byte form, Poseidon4-hashes it, and stores the resulting
 * `{ leaves: [{ serializedHex, hashDec, ...structuredFields }] }` payload
 * to Storj under the dataType the web-side proof builder
 * (`improvementLeafFetcher.ts`) already reads from.
 *
 * Why server-side: ZK proving stays off-device, and the canonical
 * BN254/Poseidon implementation lives in the website worktree. iOS only
 * normalizes HealthKit data into the v2 leaf-fields shape and POSTs JSON.
 *
 * Returns the storage location + per-leaf hashes so the iOS client can
 * persist them locally (e.g. for a "leaves committed" badge) without
 * having to round-trip Storj for verification.
 */

import { NextRequest, NextResponse } from "next/server";
import type { WalletEncryptionKey } from "@/utils/walletEncryption";
import { getStorageService } from "@/storage";
import {
  buildStoredPayload,
  isUploadWindow,
  MAX_LEAVES_PER_WINDOW,
  WireLeaf,
  windowToDataType,
} from "./helpers";

export const runtime = "nodejs";
export const maxDuration = 60;

interface UploadBody {
  walletAddress?: string;
  encryptionKey?: WalletEncryptionKey;
  window?: string;
  leaves?: WireLeaf[];
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as UploadBody;

    if (!body.walletAddress || !body.encryptionKey) {
      return NextResponse.json(
        {
          success: false,
          error: "walletAddress and encryptionKey are required",
        },
        { status: 400 },
      );
    }
    if (!isUploadWindow(body.window)) {
      return NextResponse.json(
        { success: false, error: 'window must be "baseline" or "finish"' },
        { status: 400 },
      );
    }
    if (!Array.isArray(body.leaves) || body.leaves.length === 0) {
      return NextResponse.json(
        { success: false, error: "leaves must be a non-empty array" },
        { status: 400 },
      );
    }
    if (body.leaves.length > MAX_LEAVES_PER_WINDOW) {
      return NextResponse.json(
        {
          success: false,
          error: `leaves length ${body.leaves.length} exceeds depth-7 capacity (${MAX_LEAVES_PER_WINDOW})`,
        },
        { status: 400 },
      );
    }

    const payload = buildStoredPayload(
      body.walletAddress,
      body.window,
      body.leaves,
    );
    const dataType = windowToDataType(body.window);

    const storage = getStorageService();
    const stored = await storage.storeHealthData(
      payload,
      body.walletAddress,
      body.encryptionKey,
      {
        dataType,
        metadata: {
          window: body.window,
          leafCount: String(payload.leafCount),
          platform: "ios",
          v: "2",
        },
      },
    );

    console.log(
      "[upload] stored",
      body.window,
      "leaves for",
      body.walletAddress,
      "uri:",
      stored.storjUri ?? "unknown",
    );
    if (!stored?.storjUri) {
      throw new Error("Storj write returned no URI");
    }

    return NextResponse.json({
      success: true,
      storjUri: stored.storjUri,
      contentHash: stored.contentHash,
      uploadedAt: stored.uploadedAt,
      leafCount: payload.leafCount,
      window: body.window,
      dataType,
      hashes: payload.leaves.map((e) => e.hashDec),
    });
  } catch (error) {
    console.error("[ZK] /api/merkle/v2/upload error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
