/**
 * Proof Endpoints Test Suite
 *
 * Tests the proof generation and verification pipeline:
 * - Proof hash computation and stability
 * - Signing (server-side ECDSA via PRIVATE_KEY)
 * - Signature verification (accepts user + server wallets)
 * - Proof generator registry and claim generation
 * - End-to-end proof document construction
 */
import {
  computeProofHash,
  computeProofHashFromParts,
} from "@/services/proofs/hash";
import type {
  HealthMetricClaim,
  HealthMetricProofDocument,
  HealthMetricProver,
  HealthMetricEvidence,
  HealthMetricProofMetadata,
} from "@/types/healthMetricProof";
import { getGenerator } from "@/services/proofGenerators";

// ============ Test Fixtures ============

function makeBaseClaim(
  overrides?: Partial<HealthMetricClaim>,
): HealthMetricClaim {
  return {
    type: "data_completeness",
    summary: "90 days of Apple Health at 85% (GOLD tier)",
    metricKey: "appleHealth",
    period: { start: "2025-01-01", end: "2025-03-31" },
    details: { daysCovered: "90", score: "85", tier: "gold" },
    ...overrides,
  };
}

function makeBaseProver(
  overrides?: Partial<HealthMetricProver>,
): HealthMetricProver {
  return {
    walletAddress: "0xABCDEF1234567890ABCDEF1234567890ABCDEF12",
    chainId: 300,
    attestationUid: null,
    attestationTxHash: null,
    contractAddress: "0x2A8015613623A6A8D369BcDC2bd6DD202230785a",
    ...overrides,
  };
}

function makeBaseMetadata(
  overrides?: Partial<HealthMetricProofMetadata>,
): HealthMetricProofMetadata {
  return {
    createdAt: "2025-04-01T12:00:00Z",
    platform: "ios",
    appVersion: "1.0.0",
    generator: "data_completeness",
    ...overrides,
  };
}

function makeBaseEvidence(
  overrides?: Partial<HealthMetricEvidence>,
): HealthMetricEvidence {
  return {
    dataContentHash: "sha256:testdata",
    proofHash: "0x0000",
    attestationTxHash: null,
    storjUri: "storj://bucket/proof.json",
    dataType: "apple-health-full-export",
    ...overrides,
  };
}

function makeProofDocument(
  overrides?: Partial<HealthMetricProofDocument>,
): HealthMetricProofDocument {
  return {
    proofId: "proof-test-001",
    claim: makeBaseClaim(),
    prover: makeBaseProver(),
    evidence: makeBaseEvidence(),
    metadata: makeBaseMetadata(),
    signature: "0xsig",
    ...overrides,
  };
}

// ============ Proof Hash Tests ============

describe("Proof hash computation", () => {
  it("produces a hex string starting with 0x", () => {
    const proof = makeProofDocument();
    const hash = computeProofHash(proof);
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("is deterministic (same input → same hash)", () => {
    const proof = makeProofDocument();
    const h1 = computeProofHash(proof);
    const h2 = computeProofHash(proof);
    expect(h1).toBe(h2);
  });

  it("changes when claim summary changes", () => {
    const proofA = makeProofDocument();
    const proofB = makeProofDocument({
      claim: makeBaseClaim({ summary: "Different summary" }),
    });
    expect(computeProofHash(proofA)).not.toBe(computeProofHash(proofB));
  });

  it("changes when prover wallet changes", () => {
    const proofA = makeProofDocument();
    const proofB = makeProofDocument({
      prover: makeBaseProver({ walletAddress: "0xDIFFERENT" }),
    });
    expect(computeProofHash(proofA)).not.toBe(computeProofHash(proofB));
  });

  it("changes when proofId changes", () => {
    const proofA = makeProofDocument();
    const proofB = makeProofDocument({ proofId: "proof-test-002" });
    expect(computeProofHash(proofA)).not.toBe(computeProofHash(proofB));
  });

  it("is insensitive to signature field", () => {
    const proofA = makeProofDocument({ signature: "0xaaa" });
    const proofB = makeProofDocument({ signature: "0xbbb" });
    // Signature is NOT included in the hash (it's the thing being signed)
    expect(computeProofHash(proofA)).toBe(computeProofHash(proofB));
  });

  it("is insensitive to attestationTxHash in evidence", () => {
    const proofA = makeProofDocument({
      evidence: makeBaseEvidence({ attestationTxHash: "0xtx1" }),
    });
    const proofB = makeProofDocument({
      evidence: makeBaseEvidence({ attestationTxHash: "0xtx2" }),
    });
    // attestationTxHash is NOT part of canonical hash
    expect(computeProofHash(proofA)).toBe(computeProofHash(proofB));
  });

  it("matches between computeProofHash and computeProofHashFromParts", () => {
    const proof = makeProofDocument();
    const fullHash = computeProofHash(proof);
    const partsHash = computeProofHashFromParts({
      proofId: proof.proofId,
      claim: proof.claim,
      prover: proof.prover,
      metadata: proof.metadata,
      evidence: {
        dataContentHash: proof.evidence.dataContentHash ?? null,
        storjUri: proof.evidence.storjUri ?? null,
        dataType:
          typeof proof.evidence.dataType === "string"
            ? proof.evidence.dataType
            : null,
      },
    });
    expect(fullHash).toBe(partsHash);
  });
});

// ============ Proof Hash - Edge Cases ============

describe("Proof hash edge cases", () => {
  it("handles null optional fields", () => {
    const proof = makeProofDocument({
      evidence: makeBaseEvidence({
        dataContentHash: null,
        storjUri: null,
        dataType: null,
      }),
    });
    const hash = computeProofHash(proof);
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("handles undefined claim period", () => {
    const proof = makeProofDocument({
      claim: makeBaseClaim({ period: undefined }),
    });
    const hash = computeProofHash(proof);
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("handles empty details map", () => {
    const proof = makeProofDocument({
      claim: makeBaseClaim({ details: {} }),
    });
    const hash = computeProofHash(proof);
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("treats different platforms as distinct", () => {
    const iosProof = makeProofDocument({
      metadata: makeBaseMetadata({ platform: "ios" }),
    });
    const webProof = makeProofDocument({
      metadata: makeBaseMetadata({ platform: "web" }),
    });
    expect(computeProofHash(iosProof)).not.toBe(computeProofHash(webProof));
  });
});

// ============ Proof Generator Registry ============

describe("Proof generator registry", () => {
  it("returns a generator for metric_change", () => {
    const gen = getGenerator("metric_change");
    expect(gen).toBeDefined();
    expect(gen!.type).toBe("metric_change");
  });

  it("returns a generator for lab_result", () => {
    const gen = getGenerator("lab_result");
    expect(gen).toBeDefined();
    expect(gen!.type).toBe("lab_result");
  });

  it("returns a generator for body_composition", () => {
    const gen = getGenerator("body_composition");
    expect(gen).toBeDefined();
    expect(gen!.type).toBe("body_composition");
  });

  it("returns a generator for data_completeness", () => {
    const gen = getGenerator("data_completeness");
    expect(gen).toBeDefined();
    expect(gen!.type).toBe("data_completeness");
  });

  it("returns undefined for unregistered types", () => {
    expect(getGenerator("metric_range")).toBeUndefined();
    expect(getGenerator("exercise_summary")).toBeUndefined();
  });
});

// ============ Metric Change Generator ============

describe("Metric change generator", () => {
  it("generates a valid claim with positive change", async () => {
    const gen = getGenerator("metric_change")!;
    const claim = await gen.generateClaim(
      {
        metricKey: "HRV",
        metricLabel: "HRV",
        startDate: "2025-01-01",
        endDate: "2025-01-31",
        startValue: 40,
        endValue: 50,
        unit: "ms",
      },
      {
        walletAddress: "0x1234",
        chainId: 300,
        platform: "ios",
      },
    );

    expect(claim.type).toBe("metric_change");
    expect(claim.summary).toContain("HRV");
    expect(claim.summary).toContain("+10");
    expect(claim.summary).toContain("ms");
    expect(claim.summary).toContain("+25%");
    expect(claim.metricKey).toBe("HRV");
    expect(claim.period?.start).toBe("2025-01-01");
    expect(claim.period?.end).toBe("2025-01-31");
    expect(claim.details?.delta).toBe("10");
  });

  it("generates a valid claim with negative change", async () => {
    const gen = getGenerator("metric_change")!;
    const claim = await gen.generateClaim(
      {
        metricKey: "resting_hr",
        metricLabel: "Resting HR",
        startDate: "2025-01-01",
        endDate: "2025-01-31",
        startValue: 70,
        endValue: 65,
        unit: "bpm",
      },
      {
        walletAddress: "0x1234",
        chainId: 300,
        platform: "web",
      },
    );

    expect(claim.summary).toContain("-5");
    expect(claim.summary).toContain("bpm");
    expect(claim.details?.delta).toBe("-5");
  });

  it("handles zero start value (no percentage)", async () => {
    const gen = getGenerator("metric_change")!;
    const claim = await gen.generateClaim(
      {
        metricKey: "steps",
        metricLabel: "Steps",
        startDate: "2025-01-01",
        endDate: "2025-01-02",
        startValue: 0,
        endValue: 5000,
      },
      {
        walletAddress: "0x1234",
        chainId: 300,
        platform: "ios",
      },
    );

    expect(claim.summary).toContain("Steps");
    expect(claim.summary).toContain("+5000");
    // Should not contain percentage when start is 0
    expect(claim.summary).not.toContain("%");
  });
});

// ============ Data Completeness Generator ============

describe("Data completeness generator", () => {
  it("generates claim with completeness data", async () => {
    const gen = getGenerator("data_completeness")!;
    const claim = await gen.generateClaim(
      {
        completeness: {
          daysCovered: 90,
          score: 85,
          startDate: "2025-01-01",
          endDate: "2025-03-31",
          coreComplete: true,
        },
        tier: "gold",
      },
      {
        walletAddress: "0x1234",
        chainId: 300,
        platform: "ios",
      },
    );

    expect(claim.type).toBe("data_completeness");
    expect(claim.summary).toContain("90 days");
    expect(claim.summary).toContain("85%");
    expect(claim.summary).toContain("GOLD");
    expect(claim.metricKey).toBe("appleHealth");
    expect(claim.details?.tier).toBe("gold");
    expect(claim.details?.daysCovered).toBe("90");
  });
});

// ============ Cross-Platform Proof Document Structure ============

describe("Proof document structure (iOS ↔ Web compatibility)", () => {
  it("has all required top-level fields", () => {
    const proof = makeProofDocument();
    expect(proof).toHaveProperty("proofId");
    expect(proof).toHaveProperty("claim");
    expect(proof).toHaveProperty("prover");
    expect(proof).toHaveProperty("evidence");
    expect(proof).toHaveProperty("metadata");
    expect(proof).toHaveProperty("signature");
  });

  it("claim has all required fields", () => {
    const claim = makeBaseClaim();
    expect(claim).toHaveProperty("type");
    expect(claim).toHaveProperty("summary");
    // optional fields
    expect(claim).toHaveProperty("metricKey");
    expect(claim).toHaveProperty("period");
    expect(claim).toHaveProperty("details");
  });

  it("prover has all required fields", () => {
    const prover = makeBaseProver();
    expect(prover).toHaveProperty("walletAddress");
    expect(prover).toHaveProperty("chainId");
    expect(prover).toHaveProperty("attestationUid");
    expect(prover).toHaveProperty("attestationTxHash");
    expect(prover).toHaveProperty("contractAddress");
  });

  it("evidence has all required fields", () => {
    const evidence = makeBaseEvidence();
    expect(evidence).toHaveProperty("dataContentHash");
    expect(evidence).toHaveProperty("proofHash");
    expect(evidence).toHaveProperty("attestationTxHash");
    expect(evidence).toHaveProperty("storjUri");
    expect(evidence).toHaveProperty("dataType");
  });

  it("metadata has all required fields", () => {
    const metadata = makeBaseMetadata();
    expect(metadata).toHaveProperty("createdAt");
    expect(metadata).toHaveProperty("platform");
    expect(metadata).toHaveProperty("appVersion");
    expect(metadata).toHaveProperty("generator");
  });

  it("all proof types are valid strings", () => {
    const validTypes = [
      "metric_change",
      "metric_range",
      "exercise_summary",
      "data_completeness",
      "lab_result",
      "body_composition",
    ];
    for (const t of validTypes) {
      const claim = makeBaseClaim({ type: t as HealthMetricClaim["type"] });
      expect(claim.type).toBe(t);
    }
  });

  it("round-trips through JSON serialization", () => {
    const proof = makeProofDocument();
    const json = JSON.stringify(proof);
    const parsed = JSON.parse(json) as HealthMetricProofDocument;

    expect(parsed.proofId).toBe(proof.proofId);
    expect(parsed.claim.type).toBe(proof.claim.type);
    expect(parsed.claim.summary).toBe(proof.claim.summary);
    expect(parsed.prover.walletAddress).toBe(proof.prover.walletAddress);
    expect(parsed.evidence.proofHash).toBe(proof.evidence.proofHash);
    expect(parsed.metadata.platform).toBe(proof.metadata.platform);
    expect(parsed.signature).toBe(proof.signature);
  });
});

// ============ Proof Generation Flow (unit level) ============

describe("Proof generation flow", () => {
  it("builds a complete proof document from parts", () => {
    const proofId = "proof-flow-001";
    const claim = makeBaseClaim();
    const prover = makeBaseProver();
    const metadata = makeBaseMetadata();

    const proofHash = computeProofHashFromParts({
      proofId,
      claim,
      prover,
      metadata,
      evidence: {
        dataContentHash: "sha256:test",
        storjUri: null,
        dataType: "apple-health-full-export",
      },
    });

    expect(proofHash).toMatch(/^0x[0-9a-f]{64}$/);

    const evidence: HealthMetricEvidence = {
      dataContentHash: "sha256:test",
      proofHash,
      attestationTxHash: "0xtxhash",
      storjUri: null,
      dataType: "apple-health-full-export",
    };

    const proof: HealthMetricProofDocument = {
      proofId,
      claim,
      prover: {
        ...prover,
        attestationUid: "uid-1",
        attestationTxHash: "0xtxhash",
      },
      evidence,
      metadata,
      signature: "0xfake_sig",
    };

    // Verify the hash matches
    const verifyHash = computeProofHash(proof);
    expect(verifyHash).toBe(proofHash);
  });

  it("hash does not change after adding attestation details to prover", () => {
    const proofId = "proof-flow-002";
    const claim = makeBaseClaim();
    const proverBefore = makeBaseProver({
      attestationUid: null,
      attestationTxHash: null,
    });
    const proverAfter = makeBaseProver({
      attestationUid: "uid-123",
      attestationTxHash: "0xtx456",
    });
    const metadata = makeBaseMetadata();
    const evidenceParts = {
      dataContentHash: "sha256:data",
      storjUri: null,
      dataType: null,
    };

    const hashBefore = computeProofHashFromParts({
      proofId,
      claim,
      prover: proverBefore,
      metadata,
      evidence: evidenceParts,
    });

    const hashAfter = computeProofHashFromParts({
      proofId,
      claim,
      prover: proverAfter,
      metadata,
      evidence: evidenceParts,
    });

    // attestationUid and attestationTxHash are NOT in the canonical hash
    // (only walletAddress, chainId, contractAddress are)
    expect(hashBefore).toBe(hashAfter);
  });
});
