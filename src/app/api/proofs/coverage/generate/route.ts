import { NextRequest, NextResponse } from "next/server";
import type { WalletEncryptionKey } from "@/utils/walletEncryption";
import { generateCoverage } from "@/zk/devZkCoverageService";

export const runtime = "nodejs";
export const maxDuration = 180;

type Body = {
  walletAddress: string;
  startDayId: number;
  endDayId: number;
  minDays: number;
  encryptionKey: WalletEncryptionKey;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as Body;
    if (!body.walletAddress || !body.encryptionKey) {
      return NextResponse.json(
        { error: "walletAddress and encryptionKey are required" },
        { status: 400 },
      );
    }

    const result = await generateCoverage(
      body.walletAddress,
      body.encryptionKey,
      body.startDayId,
      body.endDayId,
      body.minDays,
    );
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("[ZK] /api/proofs/coverage/generate error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate coverage proof",
      },
      { status: 500 },
    );
  }
}
