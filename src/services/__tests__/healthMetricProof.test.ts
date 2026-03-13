import {
  computeProofHash,
  computeProofHashFromParts,
} from "@/services/proofs/hash";
import type {
  HealthMetricClaim,
  HealthMetricProofDocument,
} from "@/types/healthMetricProof";

describe("HealthMetricProof hashing", () => {
  const baseClaim: HealthMetricClaim = {
    type: "data_completeness",
    summary:
      "I have 90 days of Apple Health data at 85% completeness (GOLD tier) between 2025-01-01 and 2025-03-31",
    metricKey: "appleHealth",
    period: {
      start: "2025-01-01",
      end: "2025-03-31",
    },
    details: {
      daysCovered: "90",
      score: "85",
      tier: "gold",
    },
  };

  const baseProver = {
    walletAddress: "0x1234",
    chainId: 280,
    attestationUid: null,
    attestationTxHash: null,
    contractAddress: "0xcontract",
  };

  const baseMetadata = {
    createdAt: "2025-04-01T12:00:00Z",
    platform: "web" as const,
    appVersion: "1.0.0",
    generator: "data_completeness",
  };

  it("produces stable hash for identical documents", () => {
    const draft1: HealthMetricProofDocument = {
      proofId: "proof-1",
      claim: baseClaim,
      prover: baseProver,
      evidence: {
        dataContentHash: "sha256:data",
        proofHash: "0x",
        attestationTxHash: null,
        storjUri: "storj://bucket/proof.json",
        dataType: "apple-health-full-export",
      },
      metadata: baseMetadata,
      signature: "0xsig",
    };

    const draft2: HealthMetricProofDocument = {
      ...draft1,
      evidence: {
        ...draft1.evidence,
      },
    };

    const h1 = computeProofHash(draft1);
    const h2 = computeProofHash(draft2);

    expect(h1).toBe(h2);
    expect(h1.startsWith("0x")).toBe(true);
    expect(h1.length).toBeGreaterThan(10);
  });

  it("changes hash when claim summary changes", () => {
    const proofA: HealthMetricProofDocument = {
      proofId: "proof-1",
      claim: baseClaim,
      prover: baseProver,
      evidence: {
        dataContentHash: "sha256:data",
        proofHash: "0x",
        attestationTxHash: null,
        storjUri: "storj://bucket/proof.json",
        dataType: "apple-health-full-export",
      },
      metadata: baseMetadata,
      signature: "0xsig",
    };

    const proofB: HealthMetricProofDocument = {
      ...proofA,
      claim: {
        ...baseClaim,
        summary:
          "I have 60 days of Apple Health data at 70% completeness (SILVER tier) between 2025-02-01 and 2025-03-31",
      },
    };

    const hA = computeProofHash(proofA);
    const hB = computeProofHash(proofB);

    expect(hA).not.toBe(hB);
  });

  it("matches hash between full document and parts helper", () => {
    const proof: HealthMetricProofDocument = {
      proofId: "proof-1",
      claim: baseClaim,
      prover: baseProver,
      evidence: {
        dataContentHash: "sha256:data",
        proofHash: "0x",
        attestationTxHash: null,
        storjUri: "storj://bucket/proof.json",
        dataType: "apple-health-full-export",
      },
      metadata: baseMetadata,
      signature: "0xsig",
    };

    const hDoc = computeProofHash(proof);
    const hParts = computeProofHashFromParts({
      proofId: proof.proofId,
      claim: proof.claim,
      prover: proof.prover,
      metadata: proof.metadata,
      evidence: {
        dataContentHash: "sha256:data",
        storjUri: "storj://bucket/proof.json",
        dataType: "apple-health-full-export",
      },
    });

    expect(hDoc).toBe(hParts);
  });
});
