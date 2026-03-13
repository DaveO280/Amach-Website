import type { HealthMetricProofDocument } from "@/types/healthMetricProof";
import crypto from "crypto";

export function computeProofHashFromParts(
  parts: Pick<
    HealthMetricProofDocument,
    "proofId" | "claim" | "prover" | "metadata"
  > & {
    evidence?: {
      dataContentHash?: string | null;
      storjUri?: string | null;
      dataType?: string | null;
    };
  },
): string {
  const canonical = JSON.stringify({
    proofId: parts.proofId,
    claim: parts.claim,
    prover: {
      walletAddress: parts.prover.walletAddress,
      chainId: parts.prover.chainId,
      contractAddress: parts.prover.contractAddress ?? null,
    },
    metadata: parts.metadata,
    evidence: {
      dataContentHash: parts.evidence?.dataContentHash ?? null,
      storjUri: parts.evidence?.storjUri ?? null,
      dataType: parts.evidence?.dataType ?? null,
    },
  });

  return "0x" + crypto.createHash("sha256").update(canonical).digest("hex");
}

export function computeProofHash(proof: HealthMetricProofDocument): string {
  return computeProofHashFromParts({
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
          : proof.evidence.dataType != null
            ? String(proof.evidence.dataType)
            : null,
    },
  });
}
