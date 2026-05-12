/**
 * improvementWitnessBuilder.ts
 *
 * Browser-side port of the AmachHealth-iOS ZK witness-builder scripts
 * (zk/scripts/hash_leaf.js, build_tree.js, build_improvement_witness.js)
 * used to produce snarkjs input for `improvement.circom` /
 * AverageImprovementProofV1.
 *
 * Leaf format: v2 (124 bytes, AmachLeafV2)
 *   - byte 0:  version (0x02)
 *   - byte 1:  leafType (0x00 = daily_summary)
 *   - byte 2:  schemaVersion (0x01)
 *   - byte 3:  reservedEnvelope
 *   - bytes 4..35:    wallet (32 bytes, big-endian, left-padded)
 *   - bytes 36..39:   dayId (u32 BE)
 *   - bytes 40..41:   timezoneOffset (i16 BE)
 *   - bytes 42..45:   steps (u32 BE)
 *   - bytes 46..49:   activeEnergy (u32 BE)
 *   - bytes 50..51:   exerciseMins (u16 BE)
 *   - bytes 52..53:   hrv (u16 BE)
 *   - bytes 54..55:   restingHR (u16 BE)
 *   - bytes 56..57:   sleepMins (u16 BE)
 *   - byte 58:        workoutCount (u8)
 *   - byte 59:        sourceCount (u8)
 *   - bytes 60..63:   dataFlags (u32 BE)
 *   - bytes 64..65:   vo2max (u16 BE)           <-- circuit metric, chunk 2 offset 2
 *   - bytes 66..67:   weight (u16 BE)
 *   - bytes 68..69:   bodyFatPct (u16 BE)
 *   - bytes 70..71:   leanMass (u16 BE)
 *   - bytes 72..73:   deepSleepMins (u16 BE)
 *   - bytes 74..75:   remSleepMins (u16 BE)
 *   - bytes 76..77:   lightSleepMins (u16 BE)
 *   - bytes 78..79:   awakeMins (u16 BE)
 *   - bytes 80..91:   reservedPayload (12 bytes)
 *   - bytes 92..123:  sourceHash (32 bytes)
 *
 * Chunking (must stay byte-for-byte identical with AmachLeafV2.swift and the
 * iOS hash_leaf.js v2 path — any drift breaks proofs):
 *   chunk1 = bytes  0..30   (31 bytes)
 *   chunk2 = bytes 31..61   (31 bytes)
 *   chunk3 = bytes 62..92   (31 bytes)   <-- vo2max lives at bytes 64..65,
 *                                            i.e. chunk3 offset 2..3 in iOS
 *                                            (METRIC_CHUNK_IDX=2 in 0-based
 *                                            chunk-numbering — confusingly the
 *                                            iOS code names this "chunk 2"
 *                                            because chunks are 0-indexed)
 *   chunk4 = bytes 93..123  (31 bytes)
 *
 * Tree: depth-7 binary Merkle, Poseidon2 internal nodes, padded to 128 leaves
 * with a fixed dummy v2 leaf (envelope-only) so unused slots are deterministic.
 */

import { poseidon2, poseidon4 } from "poseidon-lite";
import type { WalletEncryptionKey } from "@/utils/walletEncryption";
import { fetchImprovementLeavesForWallet } from "@/zk/improvementLeafFetcher";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const V2_LEAF_BYTES = 124;
export const V2_VERSION_BYTE = 0x02;
export const V2_LEAF_TYPE_DAILY_SUMMARY = 0x00;
export const V2_SCHEMA_VERSION_DAILY_SUMMARY = 0x01;

/** Circuit constants pinned by `AverageImprovementProof(N=2, M=2, depth=7,
 *  metricChunkIdx=2, metricByteOffsetInChunk=2)`. */
export const MERKLE_DEPTH = 7;
export const TREE_SIZE = 1 << MERKLE_DEPTH; // 128
export const N_BASELINE = 2;
export const M_FINISH = 2;
export const METRIC_CHUNK_IDX = 2;
export const METRIC_BYTE_OFFSET_IN_CHUNK = 2;
export const METRIC_POINTER =
  METRIC_CHUNK_IDX * 31 + METRIC_BYTE_OFFSET_IN_CHUNK; // 64

/** BN128 scalar field size. Field elements must be strictly less than this. */
const BN128_FIELD_SIZE = BigInt(
  "21888242871839275222246405745257275088548364400416034343698204186575808495617",
);

/** Field-zero element used to pad tree levels. */
const ZERO_LEAF = 0n;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Logical health-data shape consumed by the witness builder. Each entry
 * corresponds to one daily summary leaf in the user's v2 Merkle tree.
 *
 * Field semantics match AmachLeafV2.swift / iOS hash_leaf.js test-leaf
 * builder — see the file header for byte-level layout. All numeric fields are
 * integers in the units the iOS pipeline normalizes to (e.g. weight in
 * grams/10, percentages in basis points).
 */
export interface AmachLeafV2Fields {
  /** Hex address (with or without 0x prefix). Wallet bytes are right-aligned
   *  into a 32-byte big-endian buffer. */
  wallet: string;
  dayId: number;
  timezoneOffset: number;
  steps: number;
  activeEnergy: number;
  exerciseMins: number;
  hrv: number;
  restingHR: number;
  sleepMins: number;
  workoutCount: number;
  sourceCount: number;
  /** u32 — full 4-byte data-flags field. */
  dataFlags: number;
  vo2max: number;
  weight: number;
  bodyFatPct: number;
  leanMass: number;
  deepSleepMins: number;
  remSleepMins: number;
  lightSleepMins: number;
  awakeMins: number;
  /** Optional; defaults to 12 zero bytes. */
  reservedPayload?: Uint8Array;
  /** Hex (with or without 0x prefix) or 32-byte Uint8Array. */
  sourceHash?: string | Uint8Array;
  // Envelope overrides — defaults match the v2.0 daily_summary contract; only
  // pass these when deliberately constructing malformed leaves for tests.
  version?: number;
  leafType?: number;
  schemaVersion?: number;
  reservedEnvelope?: number;
}

/**
 * snarkjs input shape for `improvement.circom`. Field names match the circom
 * signal names verbatim — snarkjs maps these directly. All numeric values are
 * decimal strings (snarkjs reads BigInts that way).
 *
 * `meta` is a non-circuit block carrying the honestly-computed improvement
 * for UI/debug display.
 */
export interface ImprovementWitness {
  // Public signals
  baselineRoot: string;
  finishRoot: string;
  metricPointer: string;
  claimedMagnitudeBp: string;
  claimedSignFlag: "0" | "1";
  // Private — baseline (length N=2)
  baselineLeafHashes: [string, string];
  baselineChunks: [
    [string, string, string, string],
    [string, string, string, string],
  ];
  baselinePaths: [string[], string[]];
  baselineIdx: [string[], string[]];
  // Private — finish (length M=2)
  finishLeafHashes: [string, string];
  finishChunks: [
    [string, string, string, string],
    [string, string, string, string],
  ];
  finishPaths: [string[], string[]];
  finishIdx: [string[], string[]];
  /** Honestly-computed metadata. Not a circuit input. */
  meta: {
    baselineRoot: string; // hex
    finishRoot: string; // hex
    baselineSum: string;
    finishSum: string;
    baselineN: number;
    finishM: number;
    improvementBp: string;
    signFlag: 0 | 1;
    metricPointer: number;
  };
}

/**
 * Parameters for the pure (no-I/O) witness builder. The caller is responsible
 * for sourcing the leaf data; this layer just turns leaves + index selection
 * into snarkjs witness signals.
 *
 * Either `baselineLeaves` / `finishLeaves` can be:
 *   - `AmachLeafV2Fields[]` (typed health data — will be serialized here), or
 *   - `Uint8Array[]` (pre-serialized 124-byte v2 leaves).
 */
export interface ImprovementWitnessParams {
  baselineLeaves: AmachLeafV2Fields[] | Uint8Array[];
  finishLeaves: AmachLeafV2Fields[] | Uint8Array[];
  /** Indices into `baselineLeaves` contributing to the baseline average. Length must equal N (=2). */
  baselineIndices: number[];
  /** Indices into `finishLeaves` contributing to the finish average. Length must equal M (=2). */
  finishIndices: number[];
  /** Circuit metric pointer — defaults to vo2max (chunk 2, byte 2). */
  metricChunkIdx?: number;
  metricByteOffsetInChunk?: number;
  /** Defaults match the deployed circuit: N=2, M=2, depth=7. */
  N?: number;
  M?: number;
  depth?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Byte-buffer helpers (Buffer-free, browser-compatible)
// ─────────────────────────────────────────────────────────────────────────────

function writeUInt8(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = value & 0xff;
}

function writeUInt16BE(buf: Uint8Array, offset: number, value: number): void {
  const v = value & 0xffff;
  buf[offset] = (v >>> 8) & 0xff;
  buf[offset + 1] = v & 0xff;
}

function writeInt16BE(buf: Uint8Array, offset: number, value: number): void {
  // Two's-complement i16
  const v = value < 0 ? value + 0x10000 : value;
  writeUInt16BE(buf, offset, v);
}

function writeUInt32BE(buf: Uint8Array, offset: number, value: number): void {
  const v = value >>> 0; // unsigned coerce
  buf[offset] = (v >>> 24) & 0xff;
  buf[offset + 1] = (v >>> 16) & 0xff;
  buf[offset + 2] = (v >>> 8) & 0xff;
  buf[offset + 3] = v & 0xff;
}

function strip0x(s: string): string {
  return s.startsWith("0x") || s.startsWith("0X") ? s.slice(2) : s;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = strip0x(hex);
  if (clean.length % 2 !== 0) {
    throw new Error(`hexToBytes: odd-length hex string (${clean.length})`);
  }
  if (!/^[0-9a-fA-F]*$/.test(clean)) {
    throw new Error(`hexToBytes: non-hex characters in "${hex}"`);
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(buf: Uint8Array): string {
  let out = "";
  for (let i = 0; i < buf.length; i += 1) {
    out += buf[i].toString(16).padStart(2, "0");
  }
  return out;
}

/** Right-align `src` into a fresh `len`-byte Uint8Array (truncating from the
 *  left if oversized — matches the iOS toBuf32 helper). */
function toBufN(src: Uint8Array, len: number): Uint8Array {
  if (src.length === len) return src;
  const out = new Uint8Array(len);
  if (src.length > len) {
    out.set(src.subarray(src.length - len), 0);
  } else {
    out.set(src, len - src.length);
  }
  return out;
}

function walletToBytes32(wallet: string): Uint8Array {
  // Mirrors `toBuf32` in `zk/scripts/hash_leaf.js` (the on-disk leaf-format
  // spec): inputs ≤ 32 bytes are right-aligned into a 32-byte buffer (zero
  // bytes on the left); inputs > 32 bytes use the first 32. EVM 20-byte
  // addresses round-trip through this as 12 zero bytes + 20 wallet bytes,
  // matching the previous EVM-only behavior, but synthetic 32-byte test
  // wallets (as used in hash_leaf.js's buildTestLeafV2 fixture) now
  // preserve all 32 bytes — required for Swift/JS hash parity.
  const raw = hexToBytes(strip0x(wallet));
  return toBufN(raw, 32);
}

function bytesToFieldElement(
  bytes: Uint8Array,
  start: number,
  end: number,
  paddedLen = 31,
): bigint {
  // Read [start, end) into a field element. If the slice is shorter than
  // `paddedLen`, the bytes are LEFT-aligned (zero-padded on the RIGHT) —
  // matches the v1 chunk-3 layout in hash_leaf.js. For v2 chunks the slice is
  // always exactly 31 bytes so no padding kicks in.
  const slice = bytes.subarray(start, end);
  let hex = bytesToHex(slice);
  if (slice.length < paddedLen) {
    hex = hex.padEnd(paddedLen * 2, "0");
  }
  if (hex.length === 0) return 0n;
  return BigInt("0x" + hex);
}

function validateFieldElement(value: bigint, label: string): void {
  if (value >= BN128_FIELD_SIZE) {
    throw new Error(
      `Field-element overflow at ${label}: chunk exceeds BN128 scalar field.`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// v2 leaf serialization + hashing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a 124-byte v2 leaf buffer from the logical health-data fields. The
 * byte layout is pinned to AmachLeafV2.swift / iOS buildTestLeafV2 — see file
 * header for the full map.
 */
export function serializeLeafV2(fields: AmachLeafV2Fields): Uint8Array {
  const buf = new Uint8Array(V2_LEAF_BYTES);
  let o = 0;
  writeUInt8(buf, o, fields.version ?? V2_VERSION_BYTE);
  o += 1;
  writeUInt8(buf, o, fields.leafType ?? V2_LEAF_TYPE_DAILY_SUMMARY);
  o += 1;
  writeUInt8(buf, o, fields.schemaVersion ?? V2_SCHEMA_VERSION_DAILY_SUMMARY);
  o += 1;
  writeUInt8(buf, o, fields.reservedEnvelope ?? 0);
  o += 1;
  buf.set(walletToBytes32(fields.wallet), o);
  o += 32;
  writeUInt32BE(buf, o, fields.dayId);
  o += 4;
  writeInt16BE(buf, o, fields.timezoneOffset);
  o += 2;
  writeUInt32BE(buf, o, fields.steps);
  o += 4;
  writeUInt32BE(buf, o, fields.activeEnergy);
  o += 4;
  writeUInt16BE(buf, o, fields.exerciseMins);
  o += 2;
  writeUInt16BE(buf, o, fields.hrv);
  o += 2;
  writeUInt16BE(buf, o, fields.restingHR);
  o += 2;
  writeUInt16BE(buf, o, fields.sleepMins);
  o += 2;
  writeUInt8(buf, o, fields.workoutCount);
  o += 1;
  writeUInt8(buf, o, fields.sourceCount);
  o += 1;
  writeUInt32BE(buf, o, fields.dataFlags);
  o += 4;
  writeUInt16BE(buf, o, fields.vo2max);
  o += 2;
  writeUInt16BE(buf, o, fields.weight);
  o += 2;
  writeUInt16BE(buf, o, fields.bodyFatPct);
  o += 2;
  writeUInt16BE(buf, o, fields.leanMass);
  o += 2;
  writeUInt16BE(buf, o, fields.deepSleepMins);
  o += 2;
  writeUInt16BE(buf, o, fields.remSleepMins);
  o += 2;
  writeUInt16BE(buf, o, fields.lightSleepMins);
  o += 2;
  writeUInt16BE(buf, o, fields.awakeMins);
  o += 2;
  const reserved = fields.reservedPayload ?? new Uint8Array(12);
  buf.set(toBufN(reserved, 12), o);
  o += 12;
  const sourceHashBytes =
    fields.sourceHash === undefined
      ? new Uint8Array(32)
      : typeof fields.sourceHash === "string"
        ? hexToBytes(strip0x(fields.sourceHash).padStart(64, "0").slice(0, 64))
        : fields.sourceHash;
  buf.set(toBufN(sourceHashBytes, 32), o);
  o += 32;
  if (o !== V2_LEAF_BYTES) {
    throw new Error(
      `serializeLeafV2 internal: wrote ${o} bytes, expected ${V2_LEAF_BYTES}`,
    );
  }
  return buf;
}

/** Decompose a 124-byte v2 leaf into the four 31-byte field-element chunks
 *  consumed by Poseidon4. */
export function chunksV2(
  leafBytes: Uint8Array,
): [bigint, bigint, bigint, bigint] {
  if (leafBytes.length !== V2_LEAF_BYTES) {
    throw new Error(
      `chunksV2: expected ${V2_LEAF_BYTES}-byte leaf, got ${leafBytes.length}`,
    );
  }
  if (leafBytes[0] !== V2_VERSION_BYTE) {
    throw new Error(
      `chunksV2: expected version byte 0x${V2_VERSION_BYTE.toString(16)}, ` +
        `got 0x${leafBytes[0].toString(16)}`,
    );
  }
  const c1 = bytesToFieldElement(leafBytes, 0, 31);
  const c2 = bytesToFieldElement(leafBytes, 31, 62);
  const c3 = bytesToFieldElement(leafBytes, 62, 93);
  const c4 = bytesToFieldElement(leafBytes, 93, 124);
  validateFieldElement(c1, "v2.chunk1");
  validateFieldElement(c2, "v2.chunk2");
  validateFieldElement(c3, "v2.chunk3");
  validateFieldElement(c4, "v2.chunk4");
  return [c1, c2, c3, c4];
}

/** Poseidon4 hash of a 124-byte v2 leaf. */
export function hashLeafV2(leafBytes: Uint8Array): bigint {
  const [c1, c2, c3, c4] = chunksV2(leafBytes);
  return poseidon4([c1, c2, c3, c4]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Merkle tree (depth-7 padded, Poseidon2 internal nodes)
// ─────────────────────────────────────────────────────────────────────────────

function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** Build a Merkle tree padded to exactly 2^depth leaves. Returns the full
 *  level-by-level structure; tree[0] is the leaf level, tree[depth] is [root].
 */
function buildMerkleTree(leafHashes: bigint[], depth: number): bigint[][] {
  const target = 1 << depth;
  if (leafHashes.length > target) {
    throw new Error(
      `buildMerkleTree: ${leafHashes.length} leaves exceeds depth-${depth} capacity (${target})`,
    );
  }
  const sized = leafHashes.slice();
  while (sized.length < target) sized.push(ZERO_LEAF);

  // Sanity: also pad to next power of 2 (no-op when target is already pow2).
  const level0Size = Math.max(target, nextPowerOf2(sized.length));
  while (sized.length < level0Size) sized.push(ZERO_LEAF);

  const tree: bigint[][] = [sized];
  let cur = sized;
  while (cur.length > 1) {
    const next: bigint[] = [];
    for (let i = 0; i < cur.length; i += 2) {
      next.push(poseidon2([cur[i], cur[i + 1]]));
    }
    tree.push(next);
    cur = next;
  }
  return tree;
}

function merklePath(
  tree: bigint[][],
  idx: number,
): { siblings: bigint[]; indices: number[] } {
  const depth = tree.length - 1;
  const siblings: bigint[] = [];
  const indices: number[] = [];
  let cursor = idx;
  for (let level = 0; level < depth; level += 1) {
    const isRight = cursor % 2 === 1;
    const sibIdx = isRight ? cursor - 1 : cursor + 1;
    const sib = sibIdx < tree[level].length ? tree[level][sibIdx] : ZERO_LEAF;
    siblings.push(sib);
    indices.push(isRight ? 1 : 0);
    cursor = Math.floor(cursor / 2);
  }
  return { siblings, indices };
}

/** Deterministic dummy leaf used to pad trees up to 2^depth without
 *  introducing version-byte validation failures. Pads with envelope-only
 *  (version=0x02, leafType=0x00, schemaVersion=0x01, all-zero payload).
 *  Mirrors makeDummyLeaf in build_improvement_witness.js. */
function makeDummyLeafV2(): Uint8Array {
  const buf = new Uint8Array(V2_LEAF_BYTES);
  buf[0] = V2_VERSION_BYTE;
  buf[1] = V2_LEAF_TYPE_DAILY_SUMMARY;
  buf[2] = V2_SCHEMA_VERSION_DAILY_SUMMARY;
  return buf;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure witness builder
// ─────────────────────────────────────────────────────────────────────────────

function asLeafBuffer(
  input: AmachLeafV2Fields | Uint8Array,
  label: string,
): Uint8Array {
  if (input instanceof Uint8Array) {
    if (input.length !== V2_LEAF_BYTES) {
      throw new Error(
        `${label}: pre-serialized leaf must be ${V2_LEAF_BYTES} bytes, got ${input.length}`,
      );
    }
    return input;
  }
  return serializeLeafV2(input);
}

/**
 * Build a snarkjs witness for AverageImprovementProof from typed health data.
 *
 * Mirrors `buildImprovementWitness` in
 * AmachHealth-iOS/zk/scripts/build_improvement_witness.js, including the
 * honest-claim derivation:
 *
 *   improvementBp = ((finishSum * N - baselineSum * M) * 10000)
 *                   / (baselineSum * M)
 *   signFlag      = 0 if finishSum*N >= baselineSum*M else 1
 *
 * The circuit enforces strict equality on `claimedMagnitudeBp`; this builder
 * returns the exact quotient that closes the equation. If the honest result
 * isn't integer-bp the proof will still verify (the floor is what the iOS
 * builder picks too), but the chain-side magnitude will be the floored value.
 */
export function buildImprovementWitnessFromLeaves(
  params: ImprovementWitnessParams,
): ImprovementWitness {
  const {
    baselineLeaves,
    finishLeaves,
    baselineIndices,
    finishIndices,
    metricChunkIdx = METRIC_CHUNK_IDX,
    metricByteOffsetInChunk = METRIC_BYTE_OFFSET_IN_CHUNK,
    N = N_BASELINE,
    M = M_FINISH,
    depth = MERKLE_DEPTH,
  } = params;

  if (!Array.isArray(baselineLeaves) || baselineLeaves.length === 0) {
    throw new Error("baselineLeaves must be a non-empty array");
  }
  if (!Array.isArray(finishLeaves) || finishLeaves.length === 0) {
    throw new Error("finishLeaves must be a non-empty array");
  }
  if (baselineIndices.length !== N) {
    throw new Error(
      `baselineIndices length ${baselineIndices.length} != N ${N}`,
    );
  }
  if (finishIndices.length !== M) {
    throw new Error(`finishIndices length ${finishIndices.length} != M ${M}`);
  }

  const targetSize = 1 << depth;
  if (baselineLeaves.length > targetSize) {
    throw new Error(
      `baselineLeaves (${baselineLeaves.length}) exceeds depth-${depth} capacity (${targetSize})`,
    );
  }
  if (finishLeaves.length > targetSize) {
    throw new Error(
      `finishLeaves (${finishLeaves.length}) exceeds depth-${depth} capacity (${targetSize})`,
    );
  }

  // Normalize to byte buffers, then pad with the deterministic dummy leaf so
  // the tree always has exactly 2^depth entries. Padded slots are never
  // referenced by the inclusion-proof indices.
  const dummy = makeDummyLeafV2();
  const baselineBufs: Uint8Array[] = baselineLeaves.map((l, i) =>
    asLeafBuffer(l, `baselineLeaves[${i}]`),
  );
  const finishBufs: Uint8Array[] = finishLeaves.map((l, i) =>
    asLeafBuffer(l, `finishLeaves[${i}]`),
  );
  while (baselineBufs.length < targetSize) baselineBufs.push(dummy);
  while (finishBufs.length < targetSize) finishBufs.push(dummy);

  const baselineHashes = baselineBufs.map(hashLeafV2);
  const finishHashes = finishBufs.map(hashLeafV2);

  const baselineTree = buildMerkleTree(baselineHashes, depth);
  const finishTree = buildMerkleTree(finishHashes, depth);

  const baselineRoot = baselineTree[baselineTree.length - 1][0];
  const finishRoot = finishTree[finishTree.length - 1][0];

  // Per-index slice: chunks, leaf hash, Merkle path, extracted metric value.
  const sliceFor = (
    bufs: Uint8Array[],
    tree: bigint[][],
    idx: number,
  ): {
    leafHash: bigint;
    chunks: [bigint, bigint, bigint, bigint];
    path: bigint[];
    indices: number[];
    metricValue: number;
  } => {
    if (idx < 0 || idx >= bufs.length) {
      throw new Error(`leaf index ${idx} out of range (size ${bufs.length})`);
    }
    const buf = bufs[idx];
    const chunks = chunksV2(buf);
    const leafHash = hashLeafV2(buf);
    const { siblings, indices } = merklePath(tree, idx);
    // Metric is a u16 big-endian read at (chunkIdx*31 + offset).
    const metricStart = metricChunkIdx * 31 + metricByteOffsetInChunk;
    const hi = buf[metricStart] ?? 0;
    const lo = buf[metricStart + 1] ?? 0;
    const metricValue = (hi << 8) | lo;
    return { leafHash, chunks, path: siblings, indices, metricValue };
  };

  const baselineSlices = baselineIndices.map((idx) =>
    sliceFor(baselineBufs, baselineTree, idx),
  );
  const finishSlices = finishIndices.map((idx) =>
    sliceFor(finishBufs, finishTree, idx),
  );

  const baselineSum = baselineSlices.reduce(
    (s, x) => s + BigInt(x.metricValue),
    0n,
  );
  const finishSum = finishSlices.reduce(
    (s, x) => s + BigInt(x.metricValue),
    0n,
  );

  const N_big = BigInt(N);
  const M_big = BigInt(M);
  const finishCross = finishSum * N_big;
  const baselineCross = baselineSum * M_big;

  if (baselineCross === 0n) {
    throw new Error(
      "baselineSum * M must be non-zero — improvement undefined (all-zero baseline metrics).",
    );
  }

  const signFlag: 0n | 1n = finishCross >= baselineCross ? 0n : 1n;
  const diffMag =
    finishCross >= baselineCross
      ? finishCross - baselineCross
      : baselineCross - finishCross;

  // The circuit's SignedImprovementCheck enforces
  //   claimedMagnitudeBp * baselineCross === diffMag * 10000
  // as strict equality. Previously this builder returned the integer FLOOR of
  // the honest quotient, which silently produced unprovable witnesses whenever
  // the honest improvement wasn't a whole number of basis points (the prover
  // failed at SignedImprovementCheck_…). Now we round half-up — the closest
  // integer bp to the honest value — and then verify the rounded claim
  // re-satisfies strict equality before returning. If it doesn't (i.e. the
  // chosen baseline+finish sums genuinely don't divide cleanly into 1bp), we
  // throw with a descriptive error rather than ship a witness the circuit
  // will reject.
  const numerator = diffMag * 10000n;
  const floorBp = numerator / baselineCross;
  const remainder = numerator - floorBp * baselineCross;
  // Round half-up: bump when 2·remainder ≥ baselineCross.
  const honestClaimMagnitudeBp =
    remainder * 2n >= baselineCross ? floorBp + 1n : floorBp;
  // Re-verify strict equality. After rounding the residual is bounded by
  // baselineCross/2, so any drift here means the honest improvement isn't an
  // integer bp and the proof would fail at SignedImprovementCheck.
  const lhs = honestClaimMagnitudeBp * baselineCross;
  if (lhs !== numerator) {
    const drift = lhs > numerator ? lhs - numerator : numerator - lhs;
    throw new Error(
      `buildImprovementWitnessFromLeaves: chosen baseline+finish sums do not ` +
        `yield an integer-bp honest improvement, so the circuit's strict ` +
        `equality constraint cannot be satisfied. ` +
        `baselineSum=${baselineSum}, finishSum=${finishSum}, N=${N}, M=${M}, ` +
        `baselineCross=${baselineCross}, diffMag=${diffMag}, ` +
        `rounded claimedMagnitudeBp=${honestClaimMagnitudeBp} ` +
        `(off by ${drift} / baselineCross=${baselineCross}). ` +
        `Pick baseline+finish leaves where (|finishSum·N − baselineSum·M| · 10000) ` +
        `is exactly divisible by baselineSum·M.`,
    );
  }

  const expectedPointer = metricChunkIdx * 31 + metricByteOffsetInChunk;

  // Coerce to tuple types — TS can't see that N=2,M=2 yields length-2 arrays
  // unless we tell it.
  const baselineLeafHashes: [string, string] = [
    baselineSlices[0].leafHash.toString(10),
    baselineSlices[1].leafHash.toString(10),
  ];
  const baselineChunks: [
    [string, string, string, string],
    [string, string, string, string],
  ] = [
    [
      baselineSlices[0].chunks[0].toString(10),
      baselineSlices[0].chunks[1].toString(10),
      baselineSlices[0].chunks[2].toString(10),
      baselineSlices[0].chunks[3].toString(10),
    ],
    [
      baselineSlices[1].chunks[0].toString(10),
      baselineSlices[1].chunks[1].toString(10),
      baselineSlices[1].chunks[2].toString(10),
      baselineSlices[1].chunks[3].toString(10),
    ],
  ];
  const baselinePaths: [string[], string[]] = [
    baselineSlices[0].path.map((p) => p.toString(10)),
    baselineSlices[1].path.map((p) => p.toString(10)),
  ];
  const baselineIdx: [string[], string[]] = [
    baselineSlices[0].indices.map((i) => i.toString(10)),
    baselineSlices[1].indices.map((i) => i.toString(10)),
  ];

  const finishLeafHashes: [string, string] = [
    finishSlices[0].leafHash.toString(10),
    finishSlices[1].leafHash.toString(10),
  ];
  const finishChunks: [
    [string, string, string, string],
    [string, string, string, string],
  ] = [
    [
      finishSlices[0].chunks[0].toString(10),
      finishSlices[0].chunks[1].toString(10),
      finishSlices[0].chunks[2].toString(10),
      finishSlices[0].chunks[3].toString(10),
    ],
    [
      finishSlices[1].chunks[0].toString(10),
      finishSlices[1].chunks[1].toString(10),
      finishSlices[1].chunks[2].toString(10),
      finishSlices[1].chunks[3].toString(10),
    ],
  ];
  const finishPaths: [string[], string[]] = [
    finishSlices[0].path.map((p) => p.toString(10)),
    finishSlices[1].path.map((p) => p.toString(10)),
  ];
  const finishIdx: [string[], string[]] = [
    finishSlices[0].indices.map((i) => i.toString(10)),
    finishSlices[1].indices.map((i) => i.toString(10)),
  ];

  return {
    baselineRoot: baselineRoot.toString(10),
    finishRoot: finishRoot.toString(10),
    metricPointer: expectedPointer.toString(10),
    claimedMagnitudeBp: honestClaimMagnitudeBp.toString(10),
    claimedSignFlag: signFlag === 0n ? "0" : "1",
    baselineLeafHashes,
    baselineChunks,
    baselinePaths,
    baselineIdx,
    finishLeafHashes,
    finishChunks,
    finishPaths,
    finishIdx,
    meta: {
      baselineRoot: "0x" + baselineRoot.toString(16),
      finishRoot: "0x" + finishRoot.toString(16),
      baselineSum: baselineSum.toString(10),
      finishSum: finishSum.toString(10),
      baselineN: N,
      finishM: M,
      improvementBp:
        (signFlag === 0n ? "" : "-") + honestClaimMagnitudeBp.toString(10),
      signFlag: signFlag === 0n ? 0 : 1,
      metricPointer: expectedPointer,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Wallet-keyed entry point (per assignment spec)
// ─────────────────────────────────────────────────────────────────────────────

/** Read the circuit metric (u16 BE at `METRIC_POINTER`) from a v2 leaf. */
function readMetricFromLeaf(buf: Uint8Array): number {
  const hi = buf[METRIC_POINTER] ?? 0;
  const lo = buf[METRIC_POINTER + 1] ?? 0;
  return (hi << 8) | lo;
}

/**
 * Pick `k` indices into `leaves` that maximize honest improvement, ranking
 * by the circuit metric (vo2max by default). Baseline-side picks the lowest
 * `k` non-zero metrics; finish-side picks the highest `k`. Falls back to
 * natural order when fewer than `k` non-zero candidates exist, letting the
 * inner builder raise the appropriate zero-baseline error instead of silently
 * picking padding leaves.
 */
function pickIndicesByMetric(
  leaves: Uint8Array[],
  k: number,
  direction: "lowest-nonzero" | "highest",
  label: string,
): number[] {
  if (leaves.length < k) {
    throw new Error(
      `${label}: need at least ${k} leaves, got ${leaves.length}`,
    );
  }
  const ranked = leaves.map((buf, idx) => ({
    idx,
    metric: readMetricFromLeaf(buf),
  }));
  let candidates = ranked;
  if (direction === "lowest-nonzero") {
    const nonZero = ranked.filter((x) => x.metric > 0);
    candidates =
      nonZero.length >= k
        ? nonZero.sort((a, b) => a.metric - b.metric)
        : ranked.sort((a, b) => a.metric - b.metric);
  } else {
    candidates = ranked.slice().sort((a, b) => b.metric - a.metric);
  }
  return candidates.slice(0, k).map((x) => x.idx);
}

/**
 * Build the AverageImprovementProof witness for a given wallet's Spring Push
 * entry.
 *
 * Loads the wallet's latest `merkle-v2-baseline-leaves` and
 * `merkle-v2-finish-leaves` bundles from Storj (via `/api/storj`), picks the
 * N=2 lowest-non-zero-metric baseline indices and M=2 highest-metric finish
 * indices to maximize the honest improvement claim, then delegates to
 * `buildImprovementWitnessFromLeaves`.
 *
 * The wallet's encryption key is required because the leaf bundles are stored
 * encrypted; the caller (e.g. the Spring Push widget) obtains it via
 * `walletService.getWalletDerivedEncryptionKey()`.
 */
export async function buildImprovementWitness(
  walletAddress: string,
  encryptionKey: WalletEncryptionKey,
): Promise<ImprovementWitness> {
  const { baselineLeaves, finishLeaves } =
    await fetchImprovementLeavesForWallet(walletAddress, encryptionKey);

  const baselineIndices = pickIndicesByMetric(
    baselineLeaves,
    N_BASELINE,
    "lowest-nonzero",
    "baselineLeaves",
  );
  const finishIndices = pickIndicesByMetric(
    finishLeaves,
    M_FINISH,
    "highest",
    "finishLeaves",
  );

  return buildImprovementWitnessFromLeaves({
    baselineLeaves,
    finishLeaves,
    baselineIndices,
    finishIndices,
  });
}

// Test/dev exports — exposed so unit tests and dev tools can hit the lower
// primitives without going through the wallet-keyed entry point.
export const __internal = {
  buildMerkleTree,
  merklePath,
  makeDummyLeafV2,
  walletToBytes32,
  hexToBytes,
  bytesToHex,
  pickIndicesByMetric,
  readMetricFromLeaf,
};
