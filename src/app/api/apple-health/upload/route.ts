/**
 * POST /api/apple-health/upload
 *
 * Stores an Apple Health full-export payload to Storj, then computes and
 * caches daily health scores as a separate Storj artifact (health-scores).
 *
 * Same pattern as /api/gut-health/upload: upload → compute artifact → store.
 *
 * Request body:
 *   {
 *     walletAddress:  string
 *     encryptionKey:  WalletEncryptionKey
 *     payload:        AppleHealthStorjPayload  — manifest + dailySummaries
 *     isUpdate:       boolean                 — true when overwriting existing object
 *     oldStorjUri?:   string                  — required when isUpdate=true
 *     options?:       { metadata?: Record<string,string> }
 *     userProfile?:   NormalizedUserProfile
 *   }
 *
 * Response:
 *   {
 *     success:    boolean
 *     result:     { storjUri, contentHash }
 *     scoresUri?: string   — Storj URI of stored health-scores artifact
 *     manifest?:  AppleHealthManifest
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { getStorageService } from "@/storage";
import type { WalletEncryptionKey } from "@/utils/walletEncryption";
import type { AppleHealthStorjPayload } from "@/storage/appleHealth/AppleHealthStorjService";
import { convertStorjPayloadToHealthData } from "@/utils/storjAppleHealthConverter";
import {
  calculateDailyHealthScores,
  type DailyHealthScores,
} from "@/utils/dailyHealthScoreCalculator";
import type { NormalizedUserProfile } from "@/utils/userProfileUtils";
import type { StorageReference } from "@/storage";

export const runtime = "nodejs";
export const maxDuration = 120;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export interface StoredHealthScoresPayload {
  scores: Record<string, DailyHealthScores>;
  lastComputedAt: string;
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

async function computeAndStoreScores(
  payload: AppleHealthStorjPayload,
  walletAddress: string,
  encryptionKey: WalletEncryptionKey,
  userProfile: NormalizedUserProfile,
): Promise<string | undefined> {
  const storageService = getStorageService();

  // Convert Storj daily summaries to the same HealthDataResults format the
  // client-side calculator uses (one synthetic data point per metric per day).
  const healthData = convertStorjPayloadToHealthData(payload);
  const healthDataResults = Object.entries(healthData).reduce(
    (acc: Record<string, unknown[]>, [key, points]) => {
      acc[key] = points.map((p) => ({ ...p, type: key }));
      return acc;
    },
    {},
  );

  const newScores = calculateDailyHealthScores(
    healthDataResults as Parameters<typeof calculateDailyHealthScores>[0],
    userProfile,
  );

  if (newScores.length === 0) {
    console.log("[apple-health/upload] No scores computed, skipping store");
    return undefined;
  }

  console.log(
    `[apple-health/upload] Computed ${newScores.length} daily scores`,
  );

  // Fetch existing health-scores from Storj and merge (new days win).
  let existingScores: Record<string, DailyHealthScores> = {};
  let existingUri: string | undefined;

  try {
    const refs: StorageReference[] = await storageService.listUserData(
      walletAddress,
      encryptionKey,
      "health-scores",
    );

    if (refs.length > 0) {
      const latest = refs.reduce((a, b) =>
        (a.uploadedAt ?? 0) > (b.uploadedAt ?? 0) ? a : b,
      );
      existingUri = latest.uri;

      const retrieved =
        await storageService.retrieveHealthData<StoredHealthScoresPayload>(
          latest.uri,
          encryptionKey,
        );
      if (retrieved.data?.scores) {
        existingScores = retrieved.data.scores;
      }
    }
  } catch (err) {
    console.warn(
      "[apple-health/upload] Could not fetch existing health-scores:",
      err,
    );
  }

  // Merge: new computation wins per date
  const merged: Record<string, DailyHealthScores> = { ...existingScores };
  for (const dayScore of newScores) {
    merged[dayScore.date] = dayScore;
  }

  const scoresPayload: StoredHealthScoresPayload = {
    scores: merged,
    lastComputedAt: new Date().toISOString(),
  };

  let scoresResult;
  if (existingUri) {
    scoresResult = await storageService.updateHealthData(
      existingUri,
      scoresPayload,
      walletAddress,
      encryptionKey,
      { dataType: "health-scores" },
    );
  } else {
    scoresResult = await storageService.storeHealthData(
      scoresPayload,
      walletAddress,
      encryptionKey,
      { dataType: "health-scores" },
    );
  }

  return scoresResult.storjUri;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const {
      walletAddress,
      encryptionKey,
      payload,
      isUpdate,
      oldStorjUri,
      options,
      userProfile = {},
    } = body as {
      walletAddress: string;
      encryptionKey: WalletEncryptionKey;
      payload: AppleHealthStorjPayload;
      isUpdate: boolean;
      oldStorjUri?: string;
      options?: { metadata?: Record<string, string> };
      userProfile?: NormalizedUserProfile;
    };

    if (!walletAddress || !encryptionKey || !payload) {
      return NextResponse.json(
        {
          success: false,
          error: "walletAddress, encryptionKey, and payload are required",
        },
        { status: 400, headers: CORS },
      );
    }

    const storageService = getStorageService();

    // Store or update the Apple Health payload in Storj
    let storeResult;
    if (isUpdate && oldStorjUri) {
      storeResult = await storageService.updateHealthData(
        oldStorjUri,
        payload,
        walletAddress,
        encryptionKey,
        { dataType: "apple-health-full-export", ...options },
      );
    } else {
      storeResult = await storageService.storeHealthData(
        payload,
        walletAddress,
        encryptionKey,
        { dataType: "apple-health-full-export", ...options },
      );
    }

    console.log(
      `[apple-health/upload] Stored Apple Health payload: ${storeResult.storjUri}`,
    );

    // Compute and store daily health scores (non-fatal, time-bounded).
    //
    // TIMEOUT GUARD: score computation fetches an existing Storj object,
    // computes scores for the full history, and stores a new object. On large
    // datasets this can take 30–90 seconds. Without a deadline it can consume
    // the entire maxDuration (120 s) and prevent the HTTP response from being
    // sent — the caller (e.g. iOS app) then receives a 504 Gateway Timeout and
    // marks the upload as failed even though the Storj write above succeeded.
    //
    // We race against an 80-second wall clock. If scores win, great. If the
    // timeout fires first we log a warning and still return a successful
    // response — the iOS app records the upload as complete and the scores
    // will be recomputed on the next upload.
    const SCORE_DEADLINE_MS = 80_000;
    let scoresUri: string | undefined;
    const scoreStart = Date.now();
    try {
      const scoreResult = await Promise.race([
        computeAndStoreScores(
          payload,
          walletAddress,
          encryptionKey,
          userProfile,
        ),
        new Promise<undefined>((resolve) =>
          setTimeout(() => {
            console.warn(
              `[apple-health/upload] Score computation timed out after ${SCORE_DEADLINE_MS / 1000}s — skipping`,
            );
            resolve(undefined);
          }, SCORE_DEADLINE_MS),
        ),
      ]);
      scoresUri = scoreResult;
      if (scoresUri) {
        console.log(
          `[apple-health/upload] Stored health scores: ${scoresUri} (${Date.now() - scoreStart}ms)`,
        );
      }
    } catch (scoreErr) {
      console.error(
        "[apple-health/upload] Score computation/storage failed (non-fatal):",
        scoreErr,
      );
    }

    return NextResponse.json(
      {
        success: true,
        result: {
          storjUri: storeResult.storjUri,
          contentHash: storeResult.contentHash,
        },
        scoresUri,
        manifest: payload.manifest,
      },
      { headers: CORS },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    console.error("[apple-health/upload] Error:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500, headers: CORS },
    );
  }
}
