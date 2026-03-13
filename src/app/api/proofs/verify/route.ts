import { NextRequest, NextResponse } from "next/server";
import type {
  HealthMetricProofDocument,
  HealthMetricProofVerificationResult,
} from "@/types/healthMetricProof";
import { computeProofHash } from "@/services/proofs/hash";
import { getAttestationsForAddress } from "@/services/attestations";
import { verifySignature } from "@/services/signing";

export const runtime = "nodejs";

type Body = {
  proof?: HealthMetricProofDocument;
  proofHash?: string;
  prover?: string;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as Body;

    if (!body.proof && !(body.proofHash && body.prover)) {
      return NextResponse.json(
        {
          error: "Provide either full proof or proofHash + prover",
        },
        { status: 400 },
      );
    }

    if (!body.proof) {
      return NextResponse.json(
        {
          error:
            "Server does not yet hydrate proof JSON from hash; pass full proof.",
        },
        { status: 400 },
      );
    }

    const proof = body.proof;

    const recomputedHash = computeProofHash(proof);
    if (recomputedHash !== proof.evidence.proofHash) {
      const result: HealthMetricProofVerificationResult = {
        isValid: false,
        reason: "Proof hash does not match content",
        proof,
      };
      return NextResponse.json(result, { status: 200 });
    }

    const sigOk = await verifySignature({
      walletAddress: proof.prover.walletAddress,
      messageHash: proof.evidence.proofHash,
      signature: proof.signature,
    });

    if (!sigOk) {
      const result: HealthMetricProofVerificationResult = {
        isValid: false,
        reason: "Invalid signature for prover wallet",
        proof,
      };
      return NextResponse.json(result, { status: 200 });
    }

    const attestations = await getAttestationsForAddress(
      proof.prover.walletAddress,
    );

    const matching = attestations.find((a) => {
      return (
        a.contentHash.toLowerCase() === proof.evidence.proofHash.toLowerCase()
      );
    });

    if (!matching) {
      const result: HealthMetricProofVerificationResult = {
        isValid: false,
        reason: "No matching on-chain attestation found for this proof hash",
        proof,
      };
      return NextResponse.json(result, { status: 200 });
    }

    const result: HealthMetricProofVerificationResult = {
      isValid: true,
      reason: null,
      proof,
    };
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("[Proofs] verify error:", error);
    const result: HealthMetricProofVerificationResult = {
      isValid: false,
      reason: error instanceof Error ? error.message : "Verification failed",
      proof: null,
    };
    return NextResponse.json(result, { status: 500 });
  }
}
