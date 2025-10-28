import {
  adminQueries,
  hashEmail,
  whitelistQueries,
  type WhitelistProof,
} from "@/lib/database";
import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/apiAuth";

export const runtime = "nodejs";

// POST - Remove email from whitelist
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Validate API key
  const authError = validateApiKey(request);
  if (authError) return authError;

  try {
    const { email, adminEmail = "admin@amachhealth.com" } =
      await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const emailHash = hashEmail(email);

    // Check if email is whitelisted
    const existing = whitelistQueries.checkEmailWhitelisted.get(emailHash) as
      | WhitelistProof
      | undefined;
    if (!existing) {
      return NextResponse.json(
        { error: "Email is not whitelisted" },
        { status: 400 },
      );
    }

    // Remove from whitelist
    whitelistQueries.removeEmail.run(email, emailHash);

    // Log admin action
    adminQueries.logAction.run(
      adminEmail,
      "email_removed",
      emailHash,
      `Removed ${email} from whitelist`,
    );

    return NextResponse.json({
      success: true,
      email,
      emailHash,
      message: "Email removed from whitelist successfully",
    });
  } catch (error) {
    console.error("Failed to remove email from whitelist:", error);
    return NextResponse.json(
      { error: "Failed to remove email from whitelist" },
      { status: 500 },
    );
  }
}
