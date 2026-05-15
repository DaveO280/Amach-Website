"use client";

/**
 * improvementLeafFetcher.ts
 *
 * Browser-side data source for the AverageImprovementProof witness builder.
 * Looks up the latest v2 baseline + finish leaf bundles for a wallet from
 * Storj (via the `/api/storj` route) and returns them as 124-byte v2 leaf
 * buffers ready to feed into `buildImprovementWitnessFromLeaves`.
 *
 * dataType convention — mirrors the existing `merkle-genesis-{tree,leaves}`
 * pattern used by `devZkCoverageService.ts`:
 *   - `merkle-v2-baseline-leaves` — baseline-window v2 daily summaries
 *   - `merkle-v2-finish-leaves`   — finish-window v2 daily summaries
 *
 * Expected per-leaf payload shape (matches the iOS upload format the iOS app
 * will publish to Storj — same shape as `StoredLeaves` in
 * `devZkCoverageService.ts`):
 *
 *   { leaves: Array<AmachLeafV2Fields & { serializedHex?: string; hashDec?: string }> }
 *
 * `serializedHex` (when present) is the canonical 124-byte v2 leaf encoded as
 * hex and is used verbatim so the browser-side bytes match the iOS-side bytes
 * exactly. If absent, the leaf is re-serialized from the structured fields via
 * `serializeLeafV2`.
 */

import type { WalletEncryptionKey } from "@/utils/walletEncryption";
import {
  AmachLeafV2Fields,
  V2_LEAF_BYTES,
  serializeLeafV2,
} from "@/zk/improvementWitnessBuilder";

export const BASELINE_LEAVES_DATATYPE = "merkle-v2-baseline-leaves";
export const FINISH_LEAVES_DATATYPE = "merkle-v2-finish-leaves";

interface StorjListItem {
  uri: string;
  contentHash?: string;
  uploadedAt: number;
  dataType: string;
}

type StoredLeafEntry = Partial<AmachLeafV2Fields> & {
  serializedHex?: string;
  hashDec?: string;
};

interface StoredLeaves {
  leaves: StoredLeafEntry[];
}

interface StorjApiResponse<T> {
  success?: boolean;
  result?: T;
  error?: string;
}

async function storjPost<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/storj", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as StorjApiResponse<T>;
  if (!res.ok || json.success === false || json.result === undefined) {
    throw new Error(
      json.error ||
        `Storj API call failed (action=${String(body.action)}, status=${res.status})`,
    );
  }
  return json.result;
}

function decodeSerializedHex(hex: string, label: string): Uint8Array {
  const clean =
    hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (clean.length !== V2_LEAF_BYTES * 2) {
    throw new Error(
      `${label}.serializedHex has length ${clean.length}, expected ${V2_LEAF_BYTES * 2}`,
    );
  }
  if (!/^[0-9a-fA-F]*$/.test(clean)) {
    throw new Error(`${label}.serializedHex contains non-hex characters`);
  }
  const out = new Uint8Array(V2_LEAF_BYTES);
  for (let i = 0; i < V2_LEAF_BYTES; i += 1) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function leafEntryToBytes(
  entry: StoredLeafEntry,
  idx: number,
  dataType: string,
): Uint8Array {
  const label = `${dataType}[${idx}]`;
  if (
    typeof entry.serializedHex === "string" &&
    entry.serializedHex.length > 0
  ) {
    return decodeSerializedHex(entry.serializedHex, label);
  }
  if (entry.wallet === undefined || entry.dayId === undefined) {
    throw new Error(
      `${label}: missing both serializedHex and structured v2 fields (wallet/dayId). ` +
        "The iOS uploader must publish at least one of these.",
    );
  }
  // Structured form: serialize on the fly. The witness builder will re-hash
  // anyway, so this path is functionally equivalent to serializedHex.
  return serializeLeafV2(entry as AmachLeafV2Fields);
}

export async function fetchLatestLeavesBundle(
  walletAddress: string,
  encryptionKey: WalletEncryptionKey,
  dataType: string,
): Promise<Uint8Array[]> {
  const items = await storjPost<StorjListItem[]>({
    action: "storage/list",
    userAddress: walletAddress,
    encryptionKey,
    dataType,
  });
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(
      `No "${dataType}" data found for wallet ${walletAddress}. ` +
        "Run the iOS v2 Merkle uploader (or web-side equivalent) before generating a proof.",
    );
  }
  const latest = [...items].sort((a, b) => b.uploadedAt - a.uploadedAt)[0];
  const retrieved = await storjPost<{
    data: StoredLeaves;
    verified: boolean;
    contentHash?: string;
    storjUri?: string;
  }>({
    action: "storage/retrieve",
    userAddress: walletAddress,
    encryptionKey,
    storjUri: latest.uri,
    expectedHash: latest.contentHash,
  });
  const stored = retrieved.data;
  if (!stored || !Array.isArray(stored.leaves) || stored.leaves.length === 0) {
    throw new Error(
      `"${dataType}" bundle at ${latest.uri} is empty or malformed (missing "leaves" array).`,
    );
  }
  return stored.leaves.map((entry, i) => leafEntryToBytes(entry, i, dataType));
}

export interface FetchedImprovementLeaves {
  baselineLeaves: Uint8Array[];
  finishLeaves: Uint8Array[];
}

/**
 * Fetch the latest baseline + finish v2 leaf bundles for a wallet. Throws
 * with a user-actionable message if either side is missing.
 */
export async function fetchImprovementLeavesForWallet(
  walletAddress: string,
  encryptionKey: WalletEncryptionKey,
): Promise<FetchedImprovementLeaves> {
  const [baselineLeaves, finishLeaves] = await Promise.all([
    fetchLatestLeavesBundle(
      walletAddress,
      encryptionKey,
      BASELINE_LEAVES_DATATYPE,
    ),
    fetchLatestLeavesBundle(
      walletAddress,
      encryptionKey,
      FINISH_LEAVES_DATATYPE,
    ),
  ]);
  return { baselineLeaves, finishLeaves };
}

// Test/dev exports.
export const __internal = {
  decodeSerializedHex,
  leafEntryToBytes,
};
