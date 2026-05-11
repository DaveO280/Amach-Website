/**
 * helpers.ts
 * Pure (no-I/O) helpers for `/api/merkle/v2/upload`.
 *
 * Factored out of `route.ts` so they can be unit-tested directly without
 * spinning up the Next.js request lifecycle.
 *
 * Wire contract — what the iOS uploader sends:
 *
 *   POST /api/merkle/v2/upload
 *   {
 *     walletAddress: "0x…",
 *     encryptionKey: WalletEncryptionKey,
 *     window: "baseline" | "finish",
 *     leaves: WireLeaf[]                // 1..128 leaves
 *   }
 *
 * `WireLeaf` is `AmachLeafV2Fields` with the byte-typed fields
 * (`reservedPayload`, `sourceHash`) encoded as hex strings, since JSON has
 * no native bytes type. iOS produces hex via Foundation; the helpers below
 * convert hex → `Uint8Array` so the existing `serializeLeafV2` can run
 * untouched.
 *
 * Storage contract — what the route writes to Storj:
 *
 *   dataType = "merkle-v2-baseline-leaves" | "merkle-v2-finish-leaves"
 *   payload  = {
 *     walletAddress, window, generatedAt, leafCount,
 *     leaves: StoredLeafEntry[]         // serializedHex + hashDec + structured fields
 *   }
 *
 * `improvementLeafFetcher.ts` reads each entry's `serializedHex` verbatim
 * (its preferred path), so the iOS bytes and the eventually-hashed bytes
 * stay byte-identical.
 */

import {
  AmachLeafV2Fields,
  V2_LEAF_BYTES,
  hashLeafV2,
  serializeLeafV2,
} from "@/zk/improvementWitnessBuilder";
import {
  BASELINE_LEAVES_DATATYPE,
  FINISH_LEAVES_DATATYPE,
} from "@/zk/improvementLeafFetcher";

export type UploadWindow = "baseline" | "finish";

/** JSON-wire shape: byte fields are hex strings. All other fields match
 *  `AmachLeafV2Fields` exactly. */
export type WireLeaf = Omit<
  AmachLeafV2Fields,
  "reservedPayload" | "sourceHash"
> & {
  reservedPayload?: string;
  sourceHash?: string;
};

/** What we store inside each `leaves[]` entry. `serializedHex` is the
 *  authoritative byte form; the structured fields are kept for forward
 *  compatibility (audit, alternate readers). */
export type StoredLeafEntry = WireLeaf & {
  serializedHex: string;
  hashDec: string;
};

export interface StoredLeavesPayload {
  walletAddress: string;
  window: UploadWindow;
  generatedAt: number;
  leafCount: number;
  leaves: StoredLeafEntry[];
}

export function windowToDataType(window: UploadWindow): string {
  return window === "baseline"
    ? BASELINE_LEAVES_DATATYPE
    : FINISH_LEAVES_DATATYPE;
}

export function isUploadWindow(value: unknown): value is UploadWindow {
  return value === "baseline" || value === "finish";
}

export function hexToBytes(hex: string, label: string): Uint8Array {
  const clean =
    hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) {
    throw new Error(`${label}: odd-length hex string (${clean.length})`);
  }
  if (!/^[0-9a-fA-F]*$/.test(clean)) {
    throw new Error(`${label}: non-hex characters`);
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToHex(buf: Uint8Array): string {
  let out = "";
  for (let i = 0; i < buf.length; i += 1) {
    out += buf[i].toString(16).padStart(2, "0");
  }
  return out;
}

/** Convert a wire leaf (byte fields as hex strings) into the canonical
 *  `AmachLeafV2Fields` shape that `serializeLeafV2` expects. */
export function wireLeafToFields(
  wire: WireLeaf,
  idx: number,
): AmachLeafV2Fields {
  const { reservedPayload, sourceHash, ...rest } = wire;
  return {
    ...rest,
    reservedPayload:
      reservedPayload !== undefined && reservedPayload.length > 0
        ? hexToBytes(reservedPayload, `leaves[${idx}].reservedPayload`)
        : undefined,
    // `sourceHash` on AmachLeafV2Fields already accepts string | Uint8Array,
    // so the wire string is passed through untouched.
    sourceHash,
  };
}

/** Serialize + Poseidon4-hash a single wire leaf and return the stored
 *  entry shape that gets persisted to Storj. */
export function enrichLeaf(wire: WireLeaf, idx: number): StoredLeafEntry {
  const fields = wireLeafToFields(wire, idx);
  const buf = serializeLeafV2(fields);
  if (buf.length !== V2_LEAF_BYTES) {
    throw new Error(
      `internal: leaf ${idx} serialized to ${buf.length} bytes, expected ${V2_LEAF_BYTES}`,
    );
  }
  const hash = hashLeafV2(buf);
  return {
    ...wire,
    serializedHex: bytesToHex(buf),
    hashDec: hash.toString(10),
  };
}

export function buildStoredPayload(
  walletAddress: string,
  window: UploadWindow,
  wireLeaves: WireLeaf[],
): StoredLeavesPayload {
  const enriched = wireLeaves.map(enrichLeaf);
  return {
    walletAddress,
    window,
    generatedAt: Date.now(),
    leafCount: enriched.length,
    leaves: enriched,
  };
}

/** Capacity is fixed by the improvement circuit (depth=7 → 128 leaves). */
export const MAX_LEAVES_PER_WINDOW = 128;
