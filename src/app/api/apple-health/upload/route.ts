/**
 * POST /api/apple-health/upload
 *
 * Receives NEW daily summaries from the client, fetches the existing
 * apple-health-full-export payload from Storj server-side, merges the two,
 * builds the manifest, stores the merged payload, then computes and caches
 * daily health scores as a separate Storj artifact.
 *
 * Why server-side merge?
 * The old approach had the client download the full existing payload (~2–5 MB),
 * merge in the browser, then re-upload the merged payload. As the health history
 * grows this exceeds Vercel's 4.5 MB request body limit and the Vercel 120-second
 * function budget. Server-to-Storj is fast (datacenter bandwidth); keeping the
 * POST body small (new data only) is the key fix.
 *
 * Request body:
 *   {
 *     walletAddress:    string
 *     encryptionKey:    WalletEncryptionKey
 *     newDailySummaries: Record<string, DailySummary>  — only new/updated days
 *     sourceSummary:    SourceSummary  — pre-computed source counts & metric keys
 *     userProfile?:     NormalizedUserProfile
 *   }
 *
 * Response:
 *   {
 *     success:    boolean
 *     result:     { storjUri, contentHash }
 *     scoresUri?: string
 *     manifest?:  AppleHealthManifest
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { getStorageService } from "@/storage";
import type { WalletEncryptionKey } from "@/utils/walletEncryption";
import {
  AppleHealthStorjService,
  type AppleHealthStorjPayload,
  type DailySummary,
  type SourceSummary,
} from "@/storage/appleHealth/AppleHealthStorjService";
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
      newDailySummaries,
      sourceSummary,
      userProfile = {},
    } = body as {
      walletAddress: string;
      encryptionKey: WalletEncryptionKey;
      newDailySummaries: Record<string, DailySummary>;
      sourceSummary: SourceSummary;
      userProfile?: NormalizedUserProfile;
    };

    if (
      !walletAddress ||
      !encryptionKey ||
      !newDailySummaries ||
      !sourceSummary
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "walletAddress, encryptionKey, newDailySummaries, and sourceSummary are required",
        },
        { status: 400, headers: CORS },
      );
    }

    const storageService = getStorageService();
    const storjService = new AppleHealthStorjService();

    // Fetch existing apple-health payload from Storj (server-to-Storj is fast).
    // If fetch fails we still proceed — new data is stored without history merge.
    //
    // Error-handling split: keep list and retrieve in separate try/catch blocks.
    // A list failure (network/auth) → existingUri stays undefined → new file created.
    // A retrieve/decrypt failure (corrupted/0-byte prior write) → existingUri is
    // still set so we overwrite the bad file rather than accumulating a second one,
    // but existingPayload remains null so we merge against the new summaries only.
    let existingPayload: AppleHealthStorjPayload | null = null;
    let existingUri: string | undefined;
    let allExistingRefs: StorageReference[] = [];

    try {
      const refs: StorageReference[] = await storageService.listUserData(
        walletAddress,
        encryptionKey,
        "apple-health-full-export",
      );
      allExistingRefs = refs;

      if (refs.length > 0) {
        // Sort newest-first so we try the most recent healthy file first.
        // With accumulated files, the absolute-newest may be 0-byte / corrupted
        // (pre-fix uploads). Iterating gives us the best chance of finding a
        // valid payload to merge against, while still setting existingUri to
        // whichever file we'll overwrite.
        const sorted = [...refs].sort(
          (a, b) => (b.uploadedAt ?? 0) - (a.uploadedAt ?? 0),
        );

        // Default existingUri to the newest file (will be overwritten regardless).
        existingUri = sorted[0].uri;

        for (const ref of sorted) {
          try {
            const retrieved =
              await storageService.retrieveHealthData<AppleHealthStorjPayload>(
                ref.uri,
                encryptionKey,
              );
            if (retrieved.data?.dailySummaries) {
              existingPayload = retrieved.data;
              existingUri = ref.uri; // overwrite the healthy file
              console.log(
                `[apple-health/upload] Using existing payload from ${ref.uri} (tried ${sorted.indexOf(ref) + 1}/${sorted.length})`,
              );
              break;
            }
          } catch (retrieveErr) {
            console.warn(
              "[apple-health/upload] Could not decrypt",
              ref.uri,
              "— trying next:",
              retrieveErr instanceof Error ? retrieveErr.message : retrieveErr,
            );
          }
        }

        if (!existingPayload) {
          console.warn(
            `[apple-health/upload] All ${sorted.length} existing ref(s) failed to decrypt — uploading new data only`,
          );
        }
      }
    } catch (fetchErr) {
      console.warn(
        "[apple-health/upload] Could not list existing payloads, will create new:",
        fetchErr,
      );
    }

    // Merge: new summaries win per day+metric over the existing history
    const mergedSummaries: Record<string, DailySummary> = existingPayload
      ? storjService.mergeDailySummaries(
          existingPayload.dailySummaries,
          newDailySummaries,
        )
      : { ...newDailySummaries };

    // Build manifest server-side (has access to merged summaries + existing manifest)
    const manifest = storjService.buildManifestFromSummaries(
      sourceSummary,
      mergedSummaries,
      existingPayload?.manifest,
    );

    const payload: AppleHealthStorjPayload = {
      manifest,
      dailySummaries: mergedSummaries,
    };

    // Compute content hash (SHA-256 of JSON payload before encryption)
    const payloadJson = JSON.stringify(payload);
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(payloadJson),
    );
    const contentHash = `0x${Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")}`;

    // Store or update in Storj
    const storeOptions = {
      dataType: "apple-health-full-export",
      metadata: {
        version: "1",
        dateRange: `${manifest.dateRange.start}_${manifest.dateRange.end}`,
        metricsCount: String(manifest.metricsPresent.length),
        completenessScore: String(manifest.completeness.score),
        tier: manifest.completeness.tier,
      },
    };

    let storeResult;
    if (existingUri) {
      storeResult = await storageService.updateHealthData(
        existingUri,
        payload,
        walletAddress,
        encryptionKey,
        storeOptions,
      );
    } else {
      storeResult = await storageService.storeHealthData(
        payload,
        walletAddress,
        encryptionKey,
        storeOptions,
      );
    }

    console.log(
      `[apple-health/upload] Stored Apple Health payload: ${storeResult.storjUri}`,
    );

    // Prune any old apple-health-full-export files that aren't the one we just wrote.
    // Each upload overwrites only the latest file — older files accumulate otherwise.
    const staleRefs = allExistingRefs.filter(
      (r) => r.uri !== storeResult.storjUri,
    );
    if (staleRefs.length > 0) {
      console.log(
        `[apple-health/upload] Pruning ${staleRefs.length} stale apple-health-full-export file(s)`,
      );
      await Promise.allSettled(
        staleRefs.map((r) =>
          storageService
            .deleteHealthData(r.uri, walletAddress, encryptionKey)
            .catch((err: unknown) =>
              console.warn(
                "[apple-health/upload] Could not prune stale file:",
                r.uri,
                err instanceof Error ? err.message : err,
              ),
            ),
        ),
      );
    }

    // Score computation with a tight deadline.
    //
    // Budget breakdown (120 s function limit):
    //   - Receive body + parse:              ~2 s
    //   - Fetch existing payload from Storj: ~5–20 s
    //   - Merge + manifest + hash:           ~1 s
    //   - Store merged payload to Storj:     ~10–30 s
    //   Total before scores:                 ~18–53 s  (budget: 53 s remaining)
    //
    // We cap score computation at 45 s so the response is returned even if
    // Storj is slow. Scores will be recomputed on the next upload.
    const SCORE_DEADLINE_MS = 45_000;
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
          contentHash,
          size: storeResult.size,
        },
        scoresUri,
        manifest,
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
