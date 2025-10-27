import { whitelistQueries, type WhitelistProof } from "@/lib/database";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// POST - Check if email is whitelisted
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Check if email is whitelisted
    const result = whitelistQueries.checkEmailWhitelistedByEmail.get(email) as
      | WhitelistProof
      | undefined;
    const isWhitelisted = result !== undefined;

    return NextResponse.json({
      success: true,
      email,
      isWhitelisted,
      emailHash: result?.email_hash || null,
      whitelistProof: result?.whitelist_proof || null,
    });
  } catch (error) {
    console.error("Failed to check email whitelist:", error);
    return NextResponse.json(
      { error: "Failed to check email whitelist" },
      { status: 500 },
    );
  }
}
