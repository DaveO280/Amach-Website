import type { Address } from "viem";
import type { OnChainAttestation } from "@/storage/AttestationService";
import { HealthDataType } from "@/types/healthDataAttestation";

export async function createAttestation(_params: {
  walletAddress: string;
  contentHash: string;
  dataType: string;
  metadata?: Record<string, string>;
}) {
  // NOTE: This helper expects that AttestationService wiring is provided
  // by the caller's environment. For now we short-circuit with a simple
  // content-hash-only attestation using default clients passed externally.
  const contractAddress = process.env
    .NEXT_PUBLIC_ATTESTATION_CONTRACT as Address;

  if (!contractAddress) {
    throw new Error("NEXT_PUBLIC_ATTESTATION_CONTRACT is not configured");
  }

  // In this codebase AttestationService is normally constructed in
  // client code with the correct viem clients. To keep the API route
  // side-effect-free on environments without wallet context, we return
  // a stub result and let the frontend drive real attestations.
  const dummy: { txHash: string; attestationUID?: string } = {
    txHash: "0x",
    attestationUID: undefined,
  };

  // Map proof type -> HealthDataType where applicable; default to APPLE_HEALTH
  // (kept for future wiring – currently unused in stubbed implementation)
  void HealthDataType.APPLE_HEALTH;

  return {
    txHash: dummy.txHash,
    attestationUID: dummy.attestationUID,
  };
}

export async function getAttestationsForAddress(
  walletAddress: string,
): Promise<OnChainAttestation[]> {
  // For now, return empty array from API environment; full on-chain
  // verification remains the responsibility of the on-chain explorer
  // or a dedicated verification service.
  void walletAddress;
  return [];
}
