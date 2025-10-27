import {
  adminQueries,
  hashEmail,
  whitelistQueries,
  type WhitelistProof,
} from "@/lib/database";
import { ZKProofGenerator } from "@/lib/zk-proofs";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// GET - List all whitelisted emails (privacy-preserving)
export async function GET(): Promise<NextResponse> {
  try {
    type WhitelistItem = {
      email: string;
      email_hash: string;
      whitelist_proof: string;
      added_by: string;
      added_at: string;
      status: string;
    };
    const whitelistedEmails =
      whitelistQueries.getWhitelistedEmails.all() as WhitelistItem[];

    // Return emails for admin viewing, but hash is available for privacy tracking
    const adminViewList = whitelistedEmails.map((item: WhitelistItem) => ({
      email: item.email, // Show actual email in admin dashboard
      emailHash: item.email_hash, // Include hash for reference
      whitelistProof: item.whitelist_proof,
      addedBy: item.added_by,
      addedAt: item.added_at,
      status: item.status,
    }));

    return NextResponse.json({
      success: true,
      count: adminViewList.length,
      whitelist: adminViewList,
    });
  } catch (error) {
    console.error("Failed to get whitelist:", error);
    return NextResponse.json(
      { error: "Failed to fetch whitelist" },
      { status: 500 },
    );
  }
}

// POST - Add or remove emails from whitelist
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { email, action, adminEmail } = await request.json();

    if (!email || !action || !adminEmail) {
      return NextResponse.json(
        { error: "Email, action, and admin email are required" },
        { status: 400 },
      );
    }

    const emailHash = hashEmail(email);

    if (action === "add") {
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

      // Add to whitelist (store both email and hash)
      whitelistQueries.addEmail.run(
        email,
        emailHash,
        whitelistProof.ownershipProof,
        adminEmail,
      );

      // Log admin action
      adminQueries.logAction.run(
        adminEmail,
        "email_added",
        emailHash,
        `Added ${email} to whitelist`,
      );

      return NextResponse.json({
        success: true,
        emailHash,
        whitelistProof: whitelistProof.ownershipProof,
        message: "Email added to whitelist successfully",
      });
    } else if (action === "remove") {
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

      // Remove from whitelist (using both email and hash for safety)
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
        emailHash,
        message: "Email removed from whitelist successfully",
      });
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "add" or "remove"' },
        { status: 400 },
      );
    }
  } catch (error) {
    console.error("Failed to modify whitelist:", error);
    return NextResponse.json(
      { error: "Failed to modify whitelist" },
      { status: 500 },
    );
  }
}

// PUT - Bulk operations
export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const { emails, action, adminEmail } = await request.json();

    if (!emails || !Array.isArray(emails) || !action || !adminEmail) {
      return NextResponse.json(
        { error: "Emails array, action, and admin email are required" },
        { status: 400 },
      );
    }

    const results = [];
    const errors = [];

    for (const email of emails) {
      try {
        const emailHash = hashEmail(email);

        if (action === "add") {
          const existing = whitelistQueries.checkEmailWhitelisted.get(
            emailHash,
          ) as WhitelistProof | undefined;
          if (!existing) {
            const whitelistProof =
              await ZKProofGenerator.generateEmailOwnershipProof(
                email,
                "whitelisted",
              );
            whitelistQueries.addEmail.run(
              email,
              emailHash,
              whitelistProof.ownershipProof,
              adminEmail,
            );
            adminQueries.logAction.run(
              adminEmail,
              "email_added",
              emailHash,
              `Bulk added ${email}`,
            );
            results.push({ email, emailHash, success: true });
          } else {
            results.push({
              email,
              emailHash,
              success: false,
              error: "Already whitelisted",
            });
          }
        } else if (action === "remove") {
          const existing = whitelistQueries.checkEmailWhitelisted.get(
            emailHash,
          ) as WhitelistProof | undefined;
          if (existing) {
            whitelistQueries.removeEmail.run(email, emailHash);
            adminQueries.logAction.run(
              adminEmail,
              "email_removed",
              emailHash,
              `Bulk removed ${email}`,
            );
            results.push({ email, emailHash, success: true });
          } else {
            results.push({
              email,
              emailHash,
              success: false,
              error: "Not whitelisted",
            });
          }
        }
      } catch (error) {
        errors.push({
          email,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      success: true,
      total: emails.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length + errors.length,
      results,
      errors,
    });
  } catch (error) {
    console.error("Failed to perform bulk operation:", error);
    return NextResponse.json(
      { error: "Failed to perform bulk operation" },
      { status: 500 },
    );
  }
}
