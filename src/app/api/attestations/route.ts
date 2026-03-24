/**
 * Attestations API
 *
 * Reads on-chain attestations from the SecureHealthProfile V4 contract.
 *
 * POST /api/attestations
 * Body (list):   { userAddress: string }
 * Body (create): { userAddress, action, storjUri, dataType, ... }
 *
 * Creating attestations is handled client-side (iOS/web submits the tx
 * directly from the user's Privy wallet). When the body contains an
 * `action` field the route acknowledges the request without duplicating
 * the on-chain write.
 */

import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, getAddress, type Address } from "viem";
import { getContractAddresses, getActiveChain } from "@/lib/networkConfig";

export const runtime = "nodejs";

const RPC_URL =
  process.env.NEXT_PUBLIC_ZKSYNC_RPC_URL ||
  process.env.ZKSYNC_RPC_URL ||
  "https://sepolia.era.zksync.dev";

const attestationReadAbi = [
  {
    inputs: [{ name: "user", type: "address" }],
    name: "getUserAttestations",
    outputs: [
      {
        components: [
          { name: "contentHash", type: "bytes32" },
          { name: "dataType", type: "uint8" },
          { name: "startDate", type: "uint40" },
          { name: "endDate", type: "uint40" },
          { name: "completenessScore", type: "uint16" },
          { name: "recordCount", type: "uint16" },
          { name: "coreComplete", type: "bool" },
          { name: "timestamp", type: "uint40" },
        ],
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

function isEthAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr.trim());
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const rawAddress: string | undefined = body?.userAddress;

    if (!rawAddress || typeof rawAddress !== "string") {
      return NextResponse.json(
        { attestations: [], error: "userAddress is required" },
        { status: 400 },
      );
    }

    const trimmed = rawAddress.trim().startsWith("0x")
      ? rawAddress.trim()
      : `0x${rawAddress.trim()}`;

    if (!isEthAddress(trimmed)) {
      return NextResponse.json(
        { attestations: [], error: "Invalid address" },
        { status: 400 },
      );
    }

    // If body contains an `action` field this is a create-attestation request.
    // On-chain writes are handled client-side; acknowledge without duplicating.
    if (body.action) {
      return NextResponse.json({
        success: true,
        attestation: {
          txHash: "0x",
          attestationUID: null,
          blockNumber: null,
        },
        error: null,
      });
    }

    // List attestations — read directly from the contract
    const contracts = getContractAddresses();
    const publicClient = createPublicClient({
      chain: getActiveChain(),
      transport: http(RPC_URL),
    });

    const address = getAddress(trimmed) as Address;
    const contractAddress = contracts.SECURE_HEALTH_PROFILE_CONTRACT as Address;

    const raw = await publicClient.readContract({
      address: contractAddress,
      abi: attestationReadAbi,
      functionName: "getUserAttestations",
      args: [address],
    });

    const attestations = (
      raw as readonly {
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
      dataType: Number(a.dataType),
      startDate: Number(a.startDate),
      endDate: Number(a.endDate),
      completenessScore: Number(a.completenessScore),
      recordCount: Number(a.recordCount),
      coreComplete: Boolean(a.coreComplete),
      timestamp: Number(a.timestamp),
    }));

    return NextResponse.json({ attestations });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    if (
      message.includes("call revert") ||
      message.includes("execution reverted")
    ) {
      return NextResponse.json({ attestations: [] });
    }

    console.error("[attestations] Error:", err);
    return NextResponse.json(
      { attestations: [], error: message },
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
