import { NextRequest, NextResponse } from "next/server";
import { verifyCoverage } from "@/zk/devZkCoverageService";

export const runtime = "nodejs";
export const maxDuration = 120;

type Body = {
  proof: unknown;
  publicSignals: string[];
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (
      process.env.NODE_ENV === "production" &&
      process.env.ALLOW_DEV_ZK_ENDPOINTS !== "true"
    ) {
      return NextResponse.json(
        { error: "Dev ZK endpoint disabled in production" },
        { status: 403 },
      );
    }

    const body = (await request.json()) as Body;
    if (!body.proof || !Array.isArray(body.publicSignals)) {
      return NextResponse.json(
        { error: "proof and publicSignals are required" },
        { status: 400 },
      );
    }
    const verified = await verifyCoverage(body.proof, body.publicSignals);
    return NextResponse.json({ verified }, { status: 200 });
  } catch (error) {
    console.error("[ZK] /api/proofs/coverage/verify error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to verify proof",
      },
      { status: 500 },
    );
  }
}
