/**
 * Cross-platform v2 hash vectors.
 *
 * Canonical source:
 *   /Users/dave/AmachHealth-iOS/.../zk/scripts/__tests__/v2_test_vectors.js
 *
 * The Swift implementation (AmachLeafV2Tests.swift) and the JS implementation
 * (hash_leaf.js) both assert against these same vectors as part of Layer 0
 * cross-platform consistency. Layer 1's TypeScript port must produce
 * identical hashes from identical bytes — that's what __tests__/leaf.test.ts
 * verifies.
 *
 * If you regenerate the vectors on the iOS side, paste the new values here
 * verbatim. Do NOT hand-edit them.
 */
export interface CrossPlatformVector {
  name: string;
  serializedHex: string;
  expectedHashDec: string;
  expectedHashHex: string;
}

export const V2_TEST_VECTORS: CrossPlatformVector[] = [
  {
    name: "zeros_envelope_only",
    serializedHex:
      "02000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    expectedHashDec:
      "21403313304358454773736113173224357181333998349366063546584328596398062212339",
    expectedHashHex:
      "2f51d8958941fa0cc3270a88530f9f2bfba69c0216dd0356e601ddbd195894f3"
  },
  {
    name: "default_mid_range",
    serializedHex:
      "02000100abababababababababababababababababababababababababababababababab0000002afed400002134000088b8003c019c023001c20203000f03ff01a91e78073a189c004b005f00f00014000000000000000000000000cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    expectedHashDec:
      "18725532646486479229680827961653568949006776413866252906274597062145598179461",
    expectedHashHex:
      "296646a0ac262dc6ed90285374db686c7c56ba70ec467baacedd6f77407e4885"
  },
  {
    name: "all_max",
    serializedHex:
      "02000100ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff000000000000000000000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    expectedHashDec:
      "19441507671370079456103933714237196639544633520774316607225291899358709095750",
    expectedHashHex:
      "2afb80de5534134ee3aedd1bbcf538b4e56969ef6ff7341cf11e4d80ba491d46"
  },
  {
    name: "elite_athlete",
    serializedHex:
      "020001001111111111111111111111111111111111111111111111111111111111111111000001c7fe200000379d00016954005f035601a401e00202000f03ff02641cb6049c1950006e006900f50014000000000000000000000000aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899",
    expectedHashDec:
      "15052283446839198498298181032097060147164703321831257498670942882713705063055",
    expectedHashHex:
      "21474a5f6dd725de3cee969f2374561f723c58780f08150da005f5244337228f"
  },
  {
    name: "sedentary_minimal",
    serializedHex:
      "0200010000000000000000000000000000000000000000000000000000000000000000ab000000640000000004b0000011940000000002d001680001000000210000200800000000001e0032010400140000000000000000000000001111111111111111111111111111111111111111111111111111111111111111",
    expectedHashDec:
      "21511032248427965295405135826877810908705843958975997094206497487671307315323",
    expectedHashHex:
      "2f8ed0133c2be56e159f3969a5d7a664397cc0ac9ec093a1c59940a446a0a87b"
  }
];
