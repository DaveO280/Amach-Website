import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { OnChainAttestation } from "@/storage/AttestationService";
import { attestationAbi } from "@/storage/AttestationService";
import { getActiveChain } from "@/lib/networkConfig";
import { SECURE_HEALTH_PROFILE_CONTRACT } from "@/lib/contractConfig";

/**
 * Get the attestation contract address from environment or fallback to the
 * main health profile contract (V4 adds attestation to the same proxy).
 */
function getAttestationContract(): Address {
  const envAddr =
    process.env.V4_ATTESTER_CONTRACT ??
    process.env.NEXT_PUBLIC_ATTESTATION_CONTRACT;
  if (envAddr) return envAddr as Address;
  return SECURE_HEALTH_PROFILE_CONTRACT as Address;
}

/**
 * Build a public client for on-chain reads.
 */
function buildPublicClient() {
  const rpcUrl =
    process.env.NEXT_PUBLIC_ZKSYNC_RPC_URL ?? "https://sepolia.era.zksync.dev";
  return createPublicClient({
    chain: getActiveChain(),
    transport: http(rpcUrl),
  });
}

/**
 * Build a wallet client from PRIVATE_KEY for server-side writes.
 */
function buildWalletClient() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) return null;

  const formattedKey = (
    privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`
  ) as `0x${string}`;
  const account = privateKeyToAccount(formattedKey);
  const rpcUrl =
    process.env.NEXT_PUBLIC_ZKSYNC_RPC_URL ?? "https://sepolia.era.zksync.dev";

  return createWalletClient({
    account,
    chain: getActiveChain(),
    transport: http(rpcUrl),
  });
}

/**
 * Create an on-chain attestation for a proof hash.
 *
 * Uses the server wallet (PRIVATE_KEY) to submit the attestation transaction.
 * Falls back to a stub if PRIVATE_KEY is not configured (dev environment).
 */
export async function createAttestation(params: {
  walletAddress: string;
  contentHash: string;
  dataType: string;
  metadata?: Record<string, string>;
}): Promise<{ txHash: string; attestationUID?: string }> {
  const contractAddress = getAttestationContract();
  const walletClient = buildWalletClient();

  // If no server wallet, return a stub but log a warning
  if (!walletClient) {
    console.warn(
      "[Attestations] PRIVATE_KEY not configured — returning stub attestation. " +
        "Set PRIVATE_KEY in .env.local for real on-chain attestations.",
    );
    return { txHash: "0x", attestationUID: undefined };
  }

  const publicClient = buildPublicClient();

  // Ensure the server wallet has a profile (required by contract)
  try {
    const hasProfile = await publicClient.readContract({
      address: contractAddress,
      abi: attestationAbi,
      functionName: "hasProfile",
      args: [walletClient.account.address],
    });

    if (!hasProfile) {
      console.warn(
        "[Attestations] Server wallet does not have a profile on contract. " +
          "Returning stub. Create a profile for the server wallet to enable on-chain attestations.",
      );
      return { txHash: "0x", attestationUID: undefined };
    }
  } catch (profileError) {
    // hasProfile may not exist on older contract versions
    console.warn("[Attestations] Could not check hasProfile:", profileError);
  }

  // Format the content hash as bytes32
  const contentHashBytes = (
    params.contentHash.startsWith("0x")
      ? params.contentHash
      : `0x${params.contentHash}`
  ) as `0x${string}`;

  // Map proof type string to HealthDataType enum (uint8)
  // 0=DEXA, 1=Bloodwork, 2=AppleHealth, 3=CGM
  const dataTypeMap: Record<string, number> = {
    body_composition: 0,
    lab_result: 1,
    metric_change: 2,
    data_completeness: 2,
    metric_range: 2,
    exercise_summary: 2,
  };
  const dataTypeNum = dataTypeMap[params.dataType] ?? 2;

  const now = Math.floor(Date.now() / 1000);

  try {
    const { request } = await publicClient.simulateContract({
      address: contractAddress,
      abi: attestationAbi,
      functionName: "createAttestation",
      args: [
        contentHashBytes,
        dataTypeNum,
        now - 1, // startDate (1 second before now)
        now, // endDate
        100, // completenessScore (basis points: 1%)
        1, // recordCount
        false, // coreComplete
      ],
      account: walletClient.account,
    });

    const txHash = await walletClient.writeContract(request);

    // Wait for confirmation
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    console.log(
      `[Attestations] On-chain attestation created: ${txHash} for ${params.walletAddress}`,
    );

    return { txHash, attestationUID: contentHashBytes };
  } catch (error) {
    console.error(
      "[Attestations] Failed to create on-chain attestation:",
      error,
    );
    // Return stub on failure so proof generation can still complete
    // (attestation is supplementary, not required for proof validity)
    return { txHash: "0x", attestationUID: undefined };
  }
}

/**
 * Read all on-chain attestations for a wallet address.
 * Uses the V4 getUserAttestations view function.
 */
export async function getAttestationsForAddress(
  walletAddress: string,
): Promise<OnChainAttestation[]> {
  const contractAddress = getAttestationContract();
  const publicClient = buildPublicClient();

  try {
    const attestations = await publicClient.readContract({
      address: contractAddress,
      abi: attestationAbi,
      functionName: "getUserAttestations",
      args: [walletAddress as Address],
    });

    return (
      attestations as readonly {
        contentHash: string;
        dataType: number;
        startDate: number;
        endDate: number;
        completenessScore: number;
        recordCount: number;
        coreComplete: boolean;
        timestamp: number;
      }[]
    ).map((a) => ({
      contentHash: a.contentHash,
      dataType: a.dataType,
      startDate: a.startDate,
      endDate: a.endDate,
      completenessScore: a.completenessScore / 100,
      recordCount: a.recordCount,
      coreComplete: a.coreComplete,
      timestamp: a.timestamp,
    }));
  } catch (error) {
    console.error(
      "[Attestations] Failed to read attestations for",
      walletAddress,
      error,
    );
    return [];
  }
}

/**
 * Verify a specific attestation by content hash for a user.
 */
export async function verifyAttestationOnChain(
  walletAddress: string,
  contentHash: string,
): Promise<{ exists: boolean; attestation?: OnChainAttestation }> {
  const contractAddress = getAttestationContract();
  const publicClient = buildPublicClient();

  const contentHashBytes = (
    contentHash.startsWith("0x") ? contentHash : `0x${contentHash}`
  ) as `0x${string}`;

  try {
    const [exists, attestation] = await publicClient.readContract({
      address: contractAddress,
      abi: attestationAbi,
      functionName: "verifyAttestation",
      args: [walletAddress as Address, contentHashBytes],
    });

    if (!exists) return { exists: false };

    return {
      exists: true,
      attestation: {
        contentHash: (attestation as { contentHash: string }).contentHash,
        dataType: (attestation as { dataType: number }).dataType,
        startDate: (attestation as { startDate: number }).startDate,
        endDate: (attestation as { endDate: number }).endDate,
        completenessScore:
          (attestation as { completenessScore: number }).completenessScore /
          100,
        recordCount: (attestation as { recordCount: number }).recordCount,
        coreComplete: (attestation as { coreComplete: boolean }).coreComplete,
        timestamp: (attestation as { timestamp: number }).timestamp,
      },
    };
  } catch (error) {
    console.error("[Attestations] verifyAttestation error:", error);
    return { exists: false };
  }
}
