import {
  adminQueries,
  hashEmail,
  whitelistQueries,
  type WhitelistProof,
} from "@/lib/database";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// POST - Update email status
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const {
      email,
      status,
      adminEmail = "admin@amachhealth.com",
    } = await request.json();

    if (!email || !status) {
      return NextResponse.json(
        { error: "Email and status are required" },
        { status: 400 },
      );
    }

    if (!["active", "inactive", "suspended"].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Use "active", "inactive", or "suspended"' },
        { status: 400 },
      );
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

    // Update status (using the remove/add pattern since schema doesn't have direct status updates)
    if (status === "inactive" || status === "suspended") {
      whitelistQueries.removeEmail.run(email, emailHash);
    } else if (status === "active") {
      // Re-add with active status
      const whitelistProof = `whitelist_proof_${emailHash}`;
      whitelistQueries.addEmail.run(
        email,
        emailHash,
        whitelistProof,
        adminEmail,
      );
    }

    // Log admin action
    adminQueries.logAction.run(
      adminEmail,
      "email_status_updated",
      emailHash,
      `Updated ${email} status to ${status}`,
    );

    return NextResponse.json({
      success: true,
      email,
      emailHash,
      status,
      message: `Email status updated to ${status} successfully`,
    });
  } catch (error) {
    console.error("Failed to update email status:", error);
    return NextResponse.json(
      { error: "Failed to update email status" },
      { status: 500 },
    );
  }
}
