import {
  adminQueries,
  hashEmail,
  whitelistQueries,
  type WhitelistProof,
} from "@/lib/database";
import { ZKProofGenerator } from "@/lib/zk-proofs";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// POST - Add email to whitelist
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { email, addedBy = "admin@amachhealth.com" } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const emailHash = hashEmail(email);

    // Check if email is already whitelisted
    const existing = whitelistQueries.checkEmailWhitelisted.get(emailHash) as
      | WhitelistProof
      | undefined;
    if (existing) {
      return NextResponse.json(
        { error: "Email is already whitelisted" },
        { status: 400 },
      );
    }

    // Generate ZK-proof for whitelist membership
    const whitelistProof = await ZKProofGenerator.generateEmailOwnershipProof(
      email,
      "whitelisted",
    );

    // Add to whitelist
    whitelistQueries.addEmail.run(
      email,
      emailHash,
      whitelistProof.ownershipProof,
      addedBy,
    );

    // Log admin action
    adminQueries.logAction.run(
      addedBy,
      "email_added",
      emailHash,
      `Added ${email} to whitelist`,
    );

    return NextResponse.json({
      success: true,
      email,
      emailHash,
      whitelistProof: whitelistProof.ownershipProof,
      message: "Email added to whitelist successfully",
    });
  } catch (error) {
    console.error("Failed to add email to whitelist:", error);
    return NextResponse.json(
      { error: "Failed to add email to whitelist" },
      { status: 500 },
    );
  }
}
