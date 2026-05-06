/**
 * v2 leaf format — serialization, parsing, validation, and Poseidon4 chunking.
 *
 * Authoritative spec:
 *   /Users/dave/Documents/Claude/Projects/Amach Health/VERIFICATION_FACTORY.md
 *   (section "The Leaf Format Evolution → v2")
 *
 * Cross-platform parity is asserted against the same fixed test vectors
 * checked by both Swift and JS:
 *   /Users/dave/AmachHealth-iOS/.../zk/scripts/__tests__/v2_test_vectors.js
 *   /Users/dave/AmachHealth-iOS/.../AmachHealth/Tests/AmachLeafV2Tests.swift
 *
 * If you change anything in this file, regenerate vectors on the iOS side
 * and re-run __tests__/leaf.test.ts.
 */

import { poseidon3 } from "poseidon-lite/poseidon3";
import { poseidon4 } from "poseidon-lite/poseidon4";

import type { AmachLeafV2 } from "./types";

// ─── Constants ───────────────────────────────────────────────────────────────

export const V1_LEAF_BYTES = 90;
export const V2_LEAF_BYTES = 124;
export const V2_VERSION_BYTE = 0x02;
export const V2_LEAF_TYPE_DAILY_SUMMARY = 0x00;
export const V2_SCHEMA_VERSION_DAILY_SUMMARY = 0x01;

// BN128 scalar field — same constant used by circomlib and snarkJS.
export const BN128_FIELD_SIZE = BigInt(
  "21888242871839275222246405745257275088548364400416034343698204186575808495617"
);

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Hash a serialized leaf. Auto-selects v1 (Poseidon3, 90 bytes) or v2
 * (Poseidon4, 124 bytes) by buffer length and (for v2) version byte.
 */
export function hashLeaf(leafBytes: Buffer): bigint {
  if (!Buffer.isBuffer(leafBytes)) {
    throw new Error(`hashLeaf expects a Buffer, got ${typeof leafBytes}`);
  }
  if (leafBytes.length === V1_LEAF_BYTES) {
    return hashLeafV1(leafBytes);
  }
  if (leafBytes.length === V2_LEAF_BYTES) {
    return hashLeafV2(leafBytes);
  }
  throw new Error(
    `hashLeaf: unsupported leaf length ${leafBytes.length}. ` +
      `Expected ${V1_LEAF_BYTES} (v1) or ${V2_LEAF_BYTES} (v2).`
  );
}

export function hashLeafV1(leafBytes: Buffer): bigint {
  if (leafBytes.length !== V1_LEAF_BYTES) {
    throw new Error(
      `hashLeafV1 expects a ${V1_LEAF_BYTES}-byte Buffer, got ${leafBytes.length}`
    );
  }
  const [c1, c2, c3] = chunksV1(leafBytes);
  return BigInt(poseidon3([c1, c2, c3]).toString());
}

export function hashLeafV2(leafBytes: Buffer): bigint {
  if (leafBytes.length !== V2_LEAF_BYTES) {
    throw new Error(
      `hashLeafV2 expects a ${V2_LEAF_BYTES}-byte Buffer, got ${leafBytes.length}`
    );
  }
  const [c1, c2, c3, c4] = chunksV2(leafBytes);
  return BigInt(poseidon4([c1, c2, c3, c4]).toString());
}

/**
 * v1 chunking — 31 + 31 + 28-right-padded-to-31. Identical to the legacy
 * MerkleLeaf.swift / hash_leaf.js paths. Preserved here so the legitimacy
 * script can verify v1 commitments if needed.
 */
export function chunksV1(leafBytes: Buffer): [bigint, bigint, bigint] {
  const c1 = bufToBigInt(leafBytes.subarray(0, 31));
  const c2 = bufToBigInt(leafBytes.subarray(31, 62));

  const c3Buf = Buffer.alloc(31, 0);
  leafBytes.subarray(62, 90).copy(c3Buf, 0); // 28 → 31, right-pad with zeros
  const c3 = bufToBigInt(c3Buf);

  validateFieldElement(c1, "v1.chunk1");
  validateFieldElement(c2, "v1.chunk2");
  validateFieldElement(c3, "v1.chunk3");
  return [c1, c2, c3];
}

/**
 * v2 chunking — four 31-byte slices over 124 bytes. No padding needed.
 *   Chunk 1: bytes  0-30  (envelope + wallet[0..27])
 *   Chunk 2: bytes 31-61  (wallet[27..32] + dayId + ... )
 *   Chunk 3: bytes 62-92  (vo2max + body comp + sleep + reservedPayload[0..1])
 *   Chunk 4: bytes 93-123 (reservedPayload[1..12] + sourceHash[0..19])
 */
export function chunksV2(
  leafBytes: Buffer
): [bigint, bigint, bigint, bigint] {
  if (leafBytes[0] !== V2_VERSION_BYTE) {
    throw new Error(
      `chunksV2: expected version byte 0x${V2_VERSION_BYTE.toString(16)}, ` +
        `got 0x${leafBytes[0].toString(16)}`
    );
  }
  const c1 = bufToBigInt(leafBytes.subarray(0, 31));
  const c2 = bufToBigInt(leafBytes.subarray(31, 62));
  const c3 = bufToBigInt(leafBytes.subarray(62, 93));
  const c4 = bufToBigInt(leafBytes.subarray(93, 124));
  validateFieldElement(c1, "v2.chunk1");
  validateFieldElement(c2, "v2.chunk2");
  validateFieldElement(c3, "v2.chunk3");
  validateFieldElement(c4, "v2.chunk4");
  return [c1, c2, c3, c4];
}

// ─── Serialization (v2) ──────────────────────────────────────────────────────

/**
 * Serialize an AmachLeafV2 to its 124-byte wire form. Field offsets match the
 * normative schema in VERIFICATION_FACTORY.md exactly.
 */
export function serializeLeafV2(leaf: AmachLeafV2): Buffer {
  if (leaf.wallet.length !== 32) {
    throw new Error(`wallet must be 32 bytes, got ${leaf.wallet.length}`);
  }
  if (leaf.sourceHash.length !== 32) {
    throw new Error(`sourceHash must be 32 bytes, got ${leaf.sourceHash.length}`);
  }
  if (leaf.reservedPayload.length !== 12) {
    throw new Error(
      `reservedPayload must be 12 bytes, got ${leaf.reservedPayload.length}`
    );
  }

  const buf = Buffer.alloc(V2_LEAF_BYTES, 0);
  let o = 0;
  buf.writeUInt8(leaf.version, o); o += 1;
  buf.writeUInt8(leaf.leafType, o); o += 1;
  buf.writeUInt8(leaf.schemaVersion, o); o += 1;
  buf.writeUInt8(leaf.reservedEnvelope, o); o += 1;
  leaf.wallet.copy(buf, o); o += 32;
  buf.writeUInt32BE(leaf.dayId >>> 0, o); o += 4;
  buf.writeInt16BE(leaf.timezoneOffset, o); o += 2;
  buf.writeUInt32BE(leaf.steps >>> 0, o); o += 4;
  buf.writeUInt32BE(leaf.activeEnergy >>> 0, o); o += 4;
  buf.writeUInt16BE(leaf.exerciseMins, o); o += 2;
  buf.writeUInt16BE(leaf.hrv, o); o += 2;
  buf.writeUInt16BE(leaf.restingHR, o); o += 2;
  buf.writeUInt16BE(leaf.sleepMins, o); o += 2;
  buf.writeUInt8(leaf.workoutCount, o); o += 1;
  buf.writeUInt8(leaf.sourceCount, o); o += 1;
  buf.writeUInt32BE(leaf.dataFlags >>> 0, o); o += 4;
  buf.writeUInt16BE(leaf.vo2max, o); o += 2;
  buf.writeUInt16BE(leaf.weight, o); o += 2;
  buf.writeUInt16BE(leaf.bodyFatPct, o); o += 2;
  buf.writeUInt16BE(leaf.leanMass, o); o += 2;
  buf.writeUInt16BE(leaf.deepSleepMins, o); o += 2;
  buf.writeUInt16BE(leaf.remSleepMins, o); o += 2;
  buf.writeUInt16BE(leaf.lightSleepMins, o); o += 2;
  buf.writeUInt16BE(leaf.awakeMins, o); o += 2;
  leaf.reservedPayload.copy(buf, o); o += 12;
  leaf.sourceHash.copy(buf, o); o += 32;
  if (o !== V2_LEAF_BYTES) {
    throw new Error(`serializeLeafV2: wrote ${o} bytes, expected ${V2_LEAF_BYTES}`);
  }
  return buf;
}

/** Parse a 124-byte v2 leaf back into a structured object. */
export function deserializeLeafV2(buf: Buffer): AmachLeafV2 {
  if (buf.length !== V2_LEAF_BYTES) {
    throw new Error(
      `deserializeLeafV2: expected ${V2_LEAF_BYTES} bytes, got ${buf.length}`
    );
  }
  let o = 0;
  const version = buf.readUInt8(o); o += 1;
  const leafType = buf.readUInt8(o); o += 1;
  const schemaVersion = buf.readUInt8(o); o += 1;
  const reservedEnvelope = buf.readUInt8(o); o += 1;
  const wallet = Buffer.from(buf.subarray(o, o + 32)); o += 32;
  const dayId = buf.readUInt32BE(o); o += 4;
  const timezoneOffset = buf.readInt16BE(o); o += 2;
  const steps = buf.readUInt32BE(o); o += 4;
  const activeEnergy = buf.readUInt32BE(o); o += 4;
  const exerciseMins = buf.readUInt16BE(o); o += 2;
  const hrv = buf.readUInt16BE(o); o += 2;
  const restingHR = buf.readUInt16BE(o); o += 2;
  const sleepMins = buf.readUInt16BE(o); o += 2;
  const workoutCount = buf.readUInt8(o); o += 1;
  const sourceCount = buf.readUInt8(o); o += 1;
  const dataFlags = buf.readUInt32BE(o); o += 4;
  const vo2max = buf.readUInt16BE(o); o += 2;
  const weight = buf.readUInt16BE(o); o += 2;
  const bodyFatPct = buf.readUInt16BE(o); o += 2;
  const leanMass = buf.readUInt16BE(o); o += 2;
  const deepSleepMins = buf.readUInt16BE(o); o += 2;
  const remSleepMins = buf.readUInt16BE(o); o += 2;
  const lightSleepMins = buf.readUInt16BE(o); o += 2;
  const awakeMins = buf.readUInt16BE(o); o += 2;
  const reservedPayload = Buffer.from(buf.subarray(o, o + 12)); o += 12;
  const sourceHash = Buffer.from(buf.subarray(o, o + 32)); o += 32;

  return {
    version,
    leafType,
    schemaVersion,
    reservedEnvelope,
    wallet,
    dayId,
    timezoneOffset,
    steps,
    activeEnergy,
    exerciseMins,
    hrv,
    restingHR,
    sleepMins,
    workoutCount,
    sourceCount,
    dataFlags,
    vo2max,
    weight,
    bodyFatPct,
    leanMass,
    deepSleepMins,
    remSleepMins,
    lightSleepMins,
    awakeMins,
    reservedPayload,
    sourceHash
  };
}

/**
 * Validate the v2.0 daily-summary envelope. Used by Category A.4.
 * Returns null on pass, a human-readable error message on fail.
 */
export function validateLeafEnvelopeV2(leaf: AmachLeafV2): string | null {
  if (leaf.version !== V2_VERSION_BYTE) {
    return `version byte 0x${leaf.version.toString(16)} ≠ 0x02`;
  }
  if (leaf.leafType !== V2_LEAF_TYPE_DAILY_SUMMARY) {
    return `leafType 0x${leaf.leafType.toString(16)} ≠ 0x00 (daily_summary)`;
  }
  if (leaf.schemaVersion !== V2_SCHEMA_VERSION_DAILY_SUMMARY) {
    return `schemaVersion 0x${leaf.schemaVersion.toString(16)} ≠ 0x01`;
  }
  if (leaf.reservedEnvelope !== 0) {
    return `reservedEnvelope must be zero in v2.0`;
  }
  for (let i = 0; i < leaf.reservedPayload.length; i++) {
    if (leaf.reservedPayload[i] !== 0) {
      return `reservedPayload byte ${i} must be zero in v2.0`;
    }
  }
  return null;
}

/** Build a v2 leaf from partial overrides. Convenience for tests / fixtures. */
export function buildLeafV2(overrides: Partial<AmachLeafV2> = {}): AmachLeafV2 {
  const defaults: AmachLeafV2 = {
    version: V2_VERSION_BYTE,
    leafType: V2_LEAF_TYPE_DAILY_SUMMARY,
    schemaVersion: V2_SCHEMA_VERSION_DAILY_SUMMARY,
    reservedEnvelope: 0,
    wallet: Buffer.alloc(32, 0xab),
    dayId: 42,
    timezoneOffset: -300,
    steps: 8500,
    activeEnergy: 35000,
    exerciseMins: 60,
    hrv: 412,
    restingHR: 560,
    sleepMins: 450,
    workoutCount: 2,
    sourceCount: 3,
    dataFlags: 0x000f_03ff,
    vo2max: 425,
    weight: 7800,
    bodyFatPct: 1850,
    leanMass: 6300,
    deepSleepMins: 75,
    remSleepMins: 95,
    lightSleepMins: 240,
    awakeMins: 20,
    reservedPayload: Buffer.alloc(12, 0),
    sourceHash: Buffer.alloc(32, 0xcc)
  };
  return { ...defaults, ...overrides };
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function bufToBigInt(buf: Buffer): bigint {
  if (buf.length === 0) return 0n;
  const hex = buf.toString("hex");
  return BigInt("0x" + hex);
}

export function validateFieldElement(value: bigint, name: string): void {
  if (value >= BN128_FIELD_SIZE) {
    throw new Error(
      `Field element overflow: ${name} (0x${value.toString(16)}) >= BN128 field size`
    );
  }
}
