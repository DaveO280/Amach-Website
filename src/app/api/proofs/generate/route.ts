import { NextRequest, NextResponse } from "next/server";
import type {
  HealthMetricClaim,
  HealthMetricProofDocument,
  HealthMetricEvidence,
  HealthMetricProofMetadata,
  HealthMetricProver,
} from "@/types/healthMetricProof";
import type { HealthMetricProofType } from "@/types/healthMetricProof";
import { getGenerator } from "@/services/proofGenerators";
import { computeProofHashFromParts } from "@/services/proofs/hash";
import { createAttestation } from "@/services/attestations";
import { signProofHash } from "@/services/signing";
import crypto from "crypto";

export const runtime = "nodejs";

type Body = {
  claim: HealthMetricClaim;
  walletAddress: string;
  chainId?: number;
  platform?: "web" | "ios";
  appVersion?: string;
  evidence?: {
    dataContentHash?: string;
    storjUri?: string;
    dataType?: string;
  };
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as Body;

    if (!body.walletAddress) {
      return NextResponse.json(
        { error: "walletAddress is required" },
        { status: 400 },
      );
    }
    if (!body.claim?.type) {
      return NextResponse.json(
        { error: "claim.type is required" },
        { status: 400 },
      );
    }

    const platform = body.platform ?? "web";
    const chainId = body.chainId ?? 280;

    let claim: HealthMetricClaim = body.claim;

    // If summary is missing or empty, try to enrich via generator
    if (!claim.summary || !claim.summary.trim()) {
      const generator = getGenerator(claim.type as HealthMetricProofType);
      if (!generator) {
        return NextResponse.json(
          {
            error: `No generator for type ${claim.type} and no summary provided`,
          },
          { status: 400 },
        );
      }
      claim = await generator.generateClaim(claim.details ?? {}, {
        walletAddress: body.walletAddress,
        chainId,
        platform,
        appVersion: body.appVersion,
      });
    }

    const prover: HealthMetricProver = {
      walletAddress: body.walletAddress,
      chainId,
      attestationUid: null,
      attestationTxHash: null,
      contractAddress: process.env.V4_ATTESTER_CONTRACT ?? null,
    };

    const metadata: HealthMetricProofMetadata = {
      createdAt: new Date().toISOString(),
      platform,
      appVersion: body.appVersion,
      generator: claim.type,
    };

    const provisionalEvidence: Omit<HealthMetricEvidence, "proofHash"> = {
      dataContentHash: body.evidence?.dataContentHash ?? null,
      attestationTxHash: null,
      storjUri: body.evidence?.storjUri ?? null,
      dataType: body.evidence?.dataType ?? claim.details?.dataType ?? null,
    };

    const proofId = crypto.randomUUID();

    const proofHash = computeProofHashFromParts({
      proofId,
      claim,
      prover,
      metadata,
      evidence: {
        dataContentHash: provisionalEvidence.dataContentHash ?? null,
        storjUri: provisionalEvidence.storjUri ?? null,
        dataType:
          typeof provisionalEvidence.dataType === "string"
            ? provisionalEvidence.dataType
            : provisionalEvidence.dataType != null
              ? String(provisionalEvidence.dataType)
              : null,
      },
    });

    const attestation = await createAttestation({
      walletAddress: body.walletAddress,
      contentHash: proofHash,
      dataType: claim.type,
      metadata: {
        platform,
        metricKey: claim.metricKey ?? "",
        proofType: claim.type,
      },
    });

    const signature = await signProofHash({
      walletAddress: body.walletAddress,
      proofHash,
    });

    const evidence: HealthMetricEvidence = {
      ...provisionalEvidence,
      proofHash,
      attestationTxHash: attestation.txHash ?? null,
    };

    const proof: HealthMetricProofDocument = {
      proofId,
      claim,
      prover: {
        ...prover,
        attestationUid: attestation.attestationUID ?? null,
        attestationTxHash: attestation.txHash ?? null,
      },
      evidence,
      metadata,
      signature,
    };

    return NextResponse.json(proof, { status: 200 });
  } catch (error) {
    console.error("[Proofs] generate error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to generate proof",
      },
      { status: 500 },
    );
  }
}
