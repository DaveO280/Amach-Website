import { NextRequest, NextResponse } from "next/server";
import type { WalletEncryptionKey } from "@/utils/walletEncryption";
import {
  createGenesis,
  type GenesisLeafInput,
} from "@/zk/devZkCoverageService";

export const runtime = "nodejs";
export const maxDuration = 120;

type Body = {
  walletAddress: string;
  leaves: GenesisLeafInput[];
  encryptionKey: WalletEncryptionKey;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as Body;
    if (
      !body.walletAddress ||
      !body.encryptionKey ||
      !Array.isArray(body.leaves)
    ) {
      return NextResponse.json(
        { error: "walletAddress, leaves, and encryptionKey are required" },
        { status: 400 },
      );
    }

    const result = await createGenesis(
      body.walletAddress,
      body.encryptionKey,
      body.leaves,
    );
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("[ZK] /api/merkle/genesis error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate genesis root",
      },
      { status: 500 },
    );
  }
}
