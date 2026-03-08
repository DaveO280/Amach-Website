/**
 * Profile Read API
 *
 * Returns the backend-resolved on-chain health profile (birth date, sex, height, weight)
 * for the given wallet. Uses the same key derivation as the web app (PBKDF2 from
 * wallet address) to decrypt on-chain profile data. iOS and other clients send
 * userAddress; encryptionKey in the body is for future use and is not used for
 * profile decryption (profile uses wallet-derived key).
 *
 * POST /api/profile/read
 * Body: { userAddress: string, encryptionKey?: object }
 */

import { NextRequest, NextResponse } from "next/server";
import { getContractAddresses, getActiveChain } from "@/lib/networkConfig";
import { secureHealthProfileAbi } from "@/lib/contractConfig";
import { decryptHealthData } from "@/utils/secureHealthEncryption";
import type { OnChainEncryptedProfile } from "@/utils/secureHealthEncryption";

export const runtime = "nodejs";

const RPC_URL =
  process.env.NEXT_PUBLIC_ZKSYNC_RPC_URL ||
  process.env.ZKSYNC_RPC_URL ||
  "https://sepolia.era.zksync.dev";

/** Normalize address to 0x-prefixed for contract call */
function normalizeAddress(addr: string): `0x${string}` {
  const a = addr.trim();
  return a.startsWith("0x")
    ? (a as `0x${string}`)
    : (`0x${a}` as `0x${string}`);
}

/** Simple eth address check */
function isEthAddress(addr: string): boolean {
  return (
    /^0x[a-fA-F0-9]{40}$/.test(addr.trim()) ||
    /^[a-fA-F0-9]{40}$/.test(addr.trim())
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const userAddress = body?.userAddress;

    if (!userAddress || typeof userAddress !== "string") {
      return NextResponse.json(
        {
          success: false,
          profile: null,
          metadata: null,
          error: "userAddress is required",
        },
        { status: 400 },
      );
    }

    if (!isEthAddress(userAddress)) {
      return NextResponse.json(
        {
          success: false,
          profile: null,
          metadata: null,
          error: "Invalid user address",
        },
        { status: 400 },
      );
    }

    const { createPublicClient, http } = await import("viem");
    const contracts = getContractAddresses();
    const publicClient = createPublicClient({
      chain: getActiveChain(),
      transport: http(RPC_URL),
    });

    const address = normalizeAddress(userAddress);

    const profileResponse = (await publicClient.readContract({
      address: contracts.SECURE_HEALTH_PROFILE_CONTRACT as `0x${string}`,
      abi: secureHealthProfileAbi,
      functionName: "getProfileWithWeight",
      args: [address],
    })) as [
      {
        encryptedBirthDate: string;
        encryptedSex: string;
        encryptedHeight: string;
        encryptedEmail: string;
        dataHash: `0x${string}`;
        timestamp: bigint;
        isActive: boolean;
        version: number;
        nonce: string;
      },
      string,
    ];

    const [encryptedProfile, encryptedWeight] = profileResponse;

    if (!encryptedProfile?.isActive) {
      return NextResponse.json({
        success: true,
        profile: null,
        metadata: { hasProfile: false, isActive: false, version: null },
        error: null,
      });
    }

    const onChainProfile: OnChainEncryptedProfile = {
      encryptedBirthDate: encryptedProfile.encryptedBirthDate,
      encryptedSex: encryptedProfile.encryptedSex,
      encryptedHeight: encryptedProfile.encryptedHeight,
      encryptedWeight: encryptedWeight ?? "",
      encryptedEmail: encryptedProfile.encryptedEmail,
      dataHash: encryptedProfile.dataHash,
      timestamp: Number(encryptedProfile.timestamp),
      version: encryptedProfile.version ?? 1,
      nonce: encryptedProfile.nonce ?? "",
    };

    const decrypted = await decryptHealthData(
      onChainProfile,
      userAddress,
      undefined,
    );

    const timestampMs =
      Number(encryptedProfile.timestamp) > 1e12
        ? Number(encryptedProfile.timestamp)
        : Number(encryptedProfile.timestamp) * 1000;

    return NextResponse.json({
      success: true,
      profile: {
        birthDate: decrypted.birthDate || null,
        sex: decrypted.sex || null,
        height: decrypted.height ?? null,
        weight: decrypted.weight ?? null,
        source: "on-chain",
        updatedAt: timestampMs / 1000,
        version: encryptedProfile.version ?? 1,
        isActive: encryptedProfile.isActive,
      },
      metadata: {
        hasProfile: true,
        isActive: encryptedProfile.isActive,
        version: encryptedProfile.version ?? 1,
      },
      error: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    if (
      message.includes("Profile does not exist") ||
      message.includes("call revert") ||
      message.includes("execution reverted")
    ) {
      return NextResponse.json({
        success: true,
        profile: null,
        metadata: { hasProfile: false, isActive: false, version: null },
        error: null,
      });
    }

    console.error("[profile/read] Error:", err);
    return NextResponse.json(
      {
        success: false,
        profile: null,
        metadata: null,
        error: message,
      },
      { status: 500 },
    );
  }
}

export async function OPTIONS(): Promise<NextResponse> {
  return NextResponse.json(
    {},
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    },
  );
}
