import {
  buildLeafV2,
  chunksV2,
  deserializeLeafV2,
  hashLeaf,
  hashLeafV1,
  hashLeafV2,
  serializeLeafV2,
  validateLeafEnvelopeV2,
  V1_LEAF_BYTES,
  V2_LEAF_BYTES,
  V2_VERSION_BYTE
} from "../src/leaf";
import { V2_TEST_VECTORS } from "./fixtures/crossPlatformVectors";

describe("leaf — v2 cross-platform vectors", () => {
  test.each(V2_TEST_VECTORS.map((v) => [v.name, v]))(
    'fixture "%s" hashes to its pinned vector',
    (_name, v) => {
      const buf = Buffer.from(v.serializedHex, "hex");
      expect(buf.length).toBe(V2_LEAF_BYTES);
      const direct = hashLeafV2(buf);
      const dispatched = hashLeaf(buf);
      expect(direct.toString(10)).toBe(v.expectedHashDec);
      expect(dispatched.toString(10)).toBe(v.expectedHashDec);
      expect(direct.toString(16).padStart(v.expectedHashHex.length, "0")).toBe(
        v.expectedHashHex
      );
    }
  );

  test("default builder reproduces the default-mid-range vector", () => {
    const leaf = buildLeafV2();
    const buf = serializeLeafV2(leaf);
    const v = V2_TEST_VECTORS.find((x) => x.name === "default_mid_range")!;
    expect(buf.toString("hex")).toBe(v.serializedHex);
    expect(hashLeafV2(buf).toString(10)).toBe(v.expectedHashDec);
  });

  test("hash differs when only one byte changes", () => {
    const a = serializeLeafV2(buildLeafV2());
    const b = serializeLeafV2(buildLeafV2({ vo2max: 426 }));
    expect(hashLeafV2(a)).not.toEqual(hashLeafV2(b));
  });
});

describe("leaf — serialize / deserialize round-trip", () => {
  test("default leaf survives serialize → deserialize", () => {
    const leaf = buildLeafV2();
    const round = deserializeLeafV2(serializeLeafV2(leaf));
    expect(round).toEqual(leaf);
  });

  test("all-zeros payload survives round-trip", () => {
    const leaf = buildLeafV2({
      wallet: Buffer.alloc(32, 0),
      sourceHash: Buffer.alloc(32, 0),
      dayId: 0,
      timezoneOffset: 0,
      steps: 0,
      activeEnergy: 0,
      exerciseMins: 0,
      hrv: 0,
      restingHR: 0,
      sleepMins: 0,
      workoutCount: 0,
      sourceCount: 0,
      dataFlags: 0,
      vo2max: 0,
      weight: 0,
      bodyFatPct: 0,
      leanMass: 0,
      deepSleepMins: 0,
      remSleepMins: 0,
      lightSleepMins: 0,
      awakeMins: 0
    });
    const round = deserializeLeafV2(serializeLeafV2(leaf));
    expect(round).toEqual(leaf);
  });

  test("max-field-values survive round-trip", () => {
    const leaf = buildLeafV2({
      wallet: Buffer.alloc(32, 0xff),
      sourceHash: Buffer.alloc(32, 0xff),
      dayId: 0xffff_ffff,
      timezoneOffset: 32767,
      steps: 0xffff_ffff,
      activeEnergy: 0xffff_ffff,
      exerciseMins: 0xffff,
      hrv: 0xffff,
      restingHR: 0xffff,
      sleepMins: 0xffff,
      workoutCount: 0xff,
      sourceCount: 0xff,
      dataFlags: 0xffff_ffff,
      vo2max: 0xffff,
      weight: 0xffff,
      bodyFatPct: 0xffff,
      leanMass: 0xffff,
      deepSleepMins: 0xffff,
      remSleepMins: 0xffff,
      lightSleepMins: 0xffff,
      awakeMins: 0xffff
    });
    const round = deserializeLeafV2(serializeLeafV2(leaf));
    expect(round).toEqual(leaf);
  });

  test("rejects wrong-length wallet/sourceHash/reservedPayload", () => {
    expect(() =>
      serializeLeafV2(buildLeafV2({ wallet: Buffer.alloc(31, 0) }))
    ).toThrow(/wallet/);
    expect(() =>
      serializeLeafV2(buildLeafV2({ sourceHash: Buffer.alloc(31, 0) }))
    ).toThrow(/sourceHash/);
    expect(() =>
      serializeLeafV2(buildLeafV2({ reservedPayload: Buffer.alloc(11, 0) }))
    ).toThrow(/reservedPayload/);
  });
});

describe("leaf — envelope validation (Category A.4 backbone)", () => {
  test("default leaf passes envelope validation", () => {
    expect(validateLeafEnvelopeV2(buildLeafV2())).toBeNull();
  });

  test("rejects wrong version byte", () => {
    expect(validateLeafEnvelopeV2(buildLeafV2({ version: 0x01 }))).toMatch(
      /version/i
    );
  });

  test("rejects wrong leafType", () => {
    expect(validateLeafEnvelopeV2(buildLeafV2({ leafType: 0x01 }))).toMatch(
      /leafType/i
    );
  });

  test("rejects wrong schemaVersion", () => {
    expect(
      validateLeafEnvelopeV2(buildLeafV2({ schemaVersion: 0x02 }))
    ).toMatch(/schemaVersion/i);
  });

  test("rejects non-zero reservedEnvelope", () => {
    expect(
      validateLeafEnvelopeV2(buildLeafV2({ reservedEnvelope: 1 }))
    ).toMatch(/reservedEnvelope/i);
  });

  test("rejects non-zero reservedPayload", () => {
    const bad = Buffer.alloc(12, 0);
    bad[5] = 0xff;
    expect(
      validateLeafEnvelopeV2(buildLeafV2({ reservedPayload: bad }))
    ).toMatch(/reservedPayload/i);
  });
});

describe("leaf — dispatch and validation", () => {
  test("hashLeaf rejects unsupported lengths", () => {
    expect(() => hashLeaf(Buffer.alloc(89, 0))).toThrow(
      /unsupported leaf length/
    );
    expect(() => hashLeaf(Buffer.alloc(125, 0))).toThrow(
      /unsupported leaf length/
    );
    expect(() => hashLeaf(Buffer.alloc(0, 0))).toThrow(
      /unsupported leaf length/
    );
  });

  test("hashLeafV1 rejects v2-length input", () => {
    const v2 = serializeLeafV2(buildLeafV2());
    expect(() => hashLeafV1(v2)).toThrow(/expects a 90-byte/);
  });

  test("hashLeafV2 rejects v1-length input", () => {
    expect(() => hashLeafV2(Buffer.alloc(V1_LEAF_BYTES, 0))).toThrow(
      /expects a 124-byte/
    );
  });

  test("chunksV2 rejects buffer with wrong version byte", () => {
    const buf = serializeLeafV2(buildLeafV2());
    buf[0] = 0x01;
    expect(() => chunksV2(buf)).toThrow(/version byte/);
  });

  test("chunksV2 returns 4 chunks all < BN128 modulus", () => {
    const buf = serializeLeafV2(
      buildLeafV2({
        wallet: Buffer.alloc(32, 0xff),
        sourceHash: Buffer.alloc(32, 0xff)
      })
    );
    const cs = chunksV2(buf);
    expect(cs).toHaveLength(4);
    for (const c of cs) {
      expect(typeof c).toBe("bigint");
      // 31 bytes of 0xFF = 248 bits, well under the 254-bit BN128 modulus.
      expect(c < BigInt(2) ** BigInt(253)).toBe(true);
    }
  });

  test("V2_VERSION_BYTE constant is 0x02", () => {
    expect(V2_VERSION_BYTE).toBe(0x02);
  });
});
