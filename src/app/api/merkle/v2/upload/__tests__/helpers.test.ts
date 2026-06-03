/**
 * Tests for `/api/merkle/v2/upload` helpers.
 *
 * Covers:
 *   - Wire → AmachLeafV2Fields conversion (hex strings → byte arrays)
 *   - enrichLeaf: produces the `serializedHex` + `hashDec` shape that
 *     `improvementLeafFetcher.ts` consumes
 *   - Parity with the canonical `hash_leaf.js v2` test vector from the
 *     iOS repo (`zk/scripts/hash_leaf.js`). If this drifts, every iOS
 *     uploaded leaf will fail to round-trip through the proof builder.
 *   - Window → dataType mapping (matches the constants the fetcher reads)
 *   - buildStoredPayload: top-level shape + per-entry shape
 */

import { BASELINE_LEAVES_DATATYPE, FINISH_LEAVES_DATATYPE } from "../helpers";
import {
  hashLeafV2,
  serializeLeafV2,
  V2_LEAF_BYTES,
} from "@/zk/improvementWitnessBuilder";
import {
  bytesToHex,
  buildStoredPayload,
  enrichLeaf,
  hexToBytes,
  isUploadWindow,
  MAX_LEAVES_PER_WINDOW,
  WireLeaf,
  wireLeafToFields,
  windowToDataType,
} from "../helpers";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

/** Mirrors `buildTestLeafV2()` defaults in `zk/scripts/hash_leaf.js`. The
 *  Poseidon4 hash this produces is the canonical iOS-repo test vector. */
const CANONICAL_WIRE_LEAF: WireLeaf = {
  wallet: "0xabababababababababababababababababababababababababababababababab",
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
  sourceHash:
    "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
};

/** Captured from running `node zk/scripts/hash_leaf.js v2` in the iOS repo. */
const EXPECTED_SERIALIZED_HEX =
  "02000100abababababababababababababababababababababababababababababababab0000002afed400002134000088b8003c019c023001c20203000f03ff01a91e78073a189c004b005f00f00014000000000000000000000000cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const EXPECTED_HASH_DEC =
  "18725532646486479229680827961653568949006776413866252906274597062145598179461";

// ─────────────────────────────────────────────────────────────────────────────
// Wire-format helpers
// ─────────────────────────────────────────────────────────────────────────────

describe("hexToBytes / bytesToHex round-trip", () => {
  it("accepts 0x-prefixed input", () => {
    expect(Array.from(hexToBytes("0xdeadbeef", "fixture"))).toEqual([
      0xde, 0xad, 0xbe, 0xef,
    ]);
  });

  it("accepts unprefixed input", () => {
    expect(Array.from(hexToBytes("0a1b2c", "fixture"))).toEqual([
      0x0a, 0x1b, 0x2c,
    ]);
  });

  it("rejects odd-length hex", () => {
    expect(() => hexToBytes("abc", "fixture")).toThrow("odd-length");
  });

  it("rejects non-hex characters", () => {
    expect(() => hexToBytes("zz", "fixture")).toThrow("non-hex");
  });

  it("round-trips bytesToHex(hexToBytes(...))", () => {
    const original = "ababcdcd00ff";
    expect(bytesToHex(hexToBytes(original, "rt"))).toBe(original);
  });
});

describe("isUploadWindow", () => {
  it.each(["baseline", "finish"])("accepts %s", (w) => {
    expect(isUploadWindow(w)).toBe(true);
  });

  it.each([undefined, null, "", "BASELINE", "claim", 0])("rejects %p", (w) => {
    expect(isUploadWindow(w)).toBe(false);
  });
});

describe("windowToDataType", () => {
  it("maps baseline → merkle-v2-baseline-leaves", () => {
    expect(windowToDataType("baseline")).toBe(BASELINE_LEAVES_DATATYPE);
    expect(windowToDataType("baseline")).toBe("merkle-v2-baseline-leaves");
  });

  it("maps finish → merkle-v2-finish-leaves", () => {
    expect(windowToDataType("finish")).toBe(FINISH_LEAVES_DATATYPE);
    expect(windowToDataType("finish")).toBe("merkle-v2-finish-leaves");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Wire → fields conversion
// ─────────────────────────────────────────────────────────────────────────────

describe("wireLeafToFields", () => {
  it("decodes reservedPayload hex → Uint8Array", () => {
    const reservedHex = "0102030405060708090a0b0c";
    const fields = wireLeafToFields(
      { ...CANONICAL_WIRE_LEAF, reservedPayload: reservedHex },
      0,
    );
    expect(fields.reservedPayload).toBeInstanceOf(Uint8Array);
    expect(Array.from(fields.reservedPayload!)).toEqual([
      0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c,
    ]);
  });

  it("passes sourceHash through as a string (serializeLeafV2 handles both forms)", () => {
    const fields = wireLeafToFields(CANONICAL_WIRE_LEAF, 0);
    expect(fields.sourceHash).toBe(CANONICAL_WIRE_LEAF.sourceHash);
  });

  it("leaves reservedPayload undefined when not provided", () => {
    const fields = wireLeafToFields(CANONICAL_WIRE_LEAF, 0);
    expect(fields.reservedPayload).toBeUndefined();
  });

  it("rejects malformed reservedPayload with the leaf index in the message", () => {
    expect(() =>
      wireLeafToFields(
        { ...CANONICAL_WIRE_LEAF, reservedPayload: "not-hex!!" },
        7,
      ),
    ).toThrow("leaves[7].reservedPayload");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Per-leaf enrichment — the parity check the iOS uploader depends on
// ─────────────────────────────────────────────────────────────────────────────

describe("enrichLeaf — canonical iOS-repo parity vector", () => {
  it("produces the expected 124-byte serializedHex", () => {
    const entry = enrichLeaf(CANONICAL_WIRE_LEAF, 0);
    expect(entry.serializedHex.length).toBe(V2_LEAF_BYTES * 2);
    expect(entry.serializedHex).toBe(EXPECTED_SERIALIZED_HEX);
  });

  it("produces the expected Poseidon4 hash (decimal)", () => {
    const entry = enrichLeaf(CANONICAL_WIRE_LEAF, 0);
    expect(entry.hashDec).toBe(EXPECTED_HASH_DEC);
  });

  it("preserves all original wire fields verbatim", () => {
    const entry = enrichLeaf(CANONICAL_WIRE_LEAF, 0);
    // Every key in the input should appear unchanged in the output, on top
    // of the two server-added fields.
    for (const [k, v] of Object.entries(CANONICAL_WIRE_LEAF)) {
      expect((entry as Record<string, unknown>)[k]).toEqual(v);
    }
    expect(entry).toHaveProperty("serializedHex");
    expect(entry).toHaveProperty("hashDec");
  });

  it("agrees with a direct serializeLeafV2 + hashLeafV2 call", () => {
    const direct = serializeLeafV2(wireLeafToFields(CANONICAL_WIRE_LEAF, 0));
    const entry = enrichLeaf(CANONICAL_WIRE_LEAF, 0);
    expect(entry.serializedHex).toBe(bytesToHex(direct));
    expect(entry.hashDec).toBe(hashLeafV2(direct).toString(10));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Full payload shape
// ─────────────────────────────────────────────────────────────────────────────

describe("buildStoredPayload", () => {
  const wallet = "0xabababababababababababababababababababab";

  it("returns top-level metadata + leaves array of the right shape", () => {
    const payload = buildStoredPayload(wallet, "baseline", [
      CANONICAL_WIRE_LEAF,
      { ...CANONICAL_WIRE_LEAF, dayId: 43 },
    ]);
    expect(payload).toEqual(
      expect.objectContaining({
        walletAddress: wallet,
        window: "baseline",
        leafCount: 2,
      }),
    );
    expect(typeof payload.generatedAt).toBe("number");
    expect(payload.leaves).toHaveLength(2);
  });

  it("each entry has both serializedHex and hashDec", () => {
    const payload = buildStoredPayload(wallet, "finish", [CANONICAL_WIRE_LEAF]);
    expect(payload.leaves[0].serializedHex).toBe(EXPECTED_SERIALIZED_HEX);
    expect(payload.leaves[0].hashDec).toBe(EXPECTED_HASH_DEC);
  });

  it("the payload shape matches what improvementLeafFetcher consumes", () => {
    // The fetcher needs `stored.leaves` to be a non-empty array, and reads
    // each entry's `serializedHex` (preferred) or structured fields.
    const payload = buildStoredPayload(wallet, "baseline", [
      CANONICAL_WIRE_LEAF,
    ]);
    expect(Array.isArray(payload.leaves)).toBe(true);
    expect(payload.leaves.length).toBeGreaterThan(0);
    for (const entry of payload.leaves) {
      expect(typeof entry.serializedHex).toBe("string");
      expect(entry.serializedHex.length).toBe(V2_LEAF_BYTES * 2);
      expect(entry.wallet).toBeDefined();
      expect(entry.dayId).toBeDefined();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Capacity constant
// ─────────────────────────────────────────────────────────────────────────────

describe("MAX_LEAVES_PER_WINDOW", () => {
  it("matches the depth-7 circuit capacity", () => {
    expect(MAX_LEAVES_PER_WINDOW).toBe(128);
  });
});
