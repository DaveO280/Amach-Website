import { validateApiKey } from "@/lib/apiAuth";
import {
  adminQueries,
  hashEmail,
  whitelistQueries,
  type WhitelistProof,
} from "@/lib/database";
import { ZKProofGenerator } from "@/lib/zk-proofs";
import { ethers } from "ethers";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Contract addresses (should match main app)
const PROFILE_VERIFICATION_CONTRACT =
  "0xfeDa5D6c52ba8a3a412c1De6747B516c42F46377";

// ProfileVerification ABI (only the functions we need)
const PROFILE_VERIFICATION_ABI = [
  {
    inputs: [{ name: "email", type: "string" }],
    name: "addEmailToWhitelist",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "email", type: "string" }],
    name: "isEmailWhitelisted",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
];

// POST - Add email to whitelist (database + blockchain)
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Validate API key
  const authError = validateApiKey(request);
  if (authError) return authError;

  try {
    const { email, addedBy = "admin@amachhealth.com" } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const emailHash = hashEmail(email);

    // Check if email is already whitelisted in database
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

    // Add to local database first (for admin dashboard tracking)
    whitelistQueries.addEmail.run(
      email,
      emailHash,
      whitelistProof.ownershipProof,
      addedBy,
    );

    console.log("✅ Added email to local database:", email);

    // Now add to blockchain
    try {
      console.log("🔗 Adding email to blockchain...");

      // Initialize blockchain connection
      const rpcUrl =
        process.env.ZKSYNC_RPC_URL || "https://sepolia.era.zksync.dev";
      const privateKey = process.env.ADMIN_PRIVATE_KEY;

      if (!privateKey) {
        console.error(
          "❌ ADMIN_PRIVATE_KEY not set - skipping blockchain write",
        );
        console.log(
          "⚠️ Email added to database only. Please add to blockchain manually.",
        );

        return NextResponse.json({
          success: true,
          email,
          emailHash,
          whitelistProof: whitelistProof.ownershipProof,
          message:
            "Email added to database. Blockchain write skipped (no ADMIN_PRIVATE_KEY).",
          blockchainAdded: false,
        });
      }

      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const wallet = new ethers.Wallet(privateKey, provider);
      const contract = new ethers.Contract(
        PROFILE_VERIFICATION_CONTRACT,
        PROFILE_VERIFICATION_ABI,
        wallet,
      );

      // Add email to blockchain (contract will hash it internally)
      const tx = await contract.addEmailToWhitelist(email);
      console.log("📤 Transaction sent:", tx.hash);

      const receipt = await tx.wait();
      console.log("✅ Email added to blockchain:", receipt.hash);

      // Log admin action
      adminQueries.logAction.run(
        addedBy,
        "email_added",
        emailHash,
        `Added ${email} to whitelist (DB + Blockchain)`,
      );

      return NextResponse.json({
        success: true,
        email,
        emailHash,
        whitelistProof: whitelistProof.ownershipProof,
        message:
          "Email added to whitelist successfully (database + blockchain)",
        blockchainTxHash: receipt.hash,
        blockchainAdded: true,
      });
    } catch (blockchainError) {
      console.error("❌ Failed to add email to blockchain:", blockchainError);

      // Log admin action (with blockchain failure note)
      adminQueries.logAction.run(
        addedBy,
        "email_added",
        emailHash,
        `Added ${email} to whitelist (DB only - blockchain failed)`,
      );

      return NextResponse.json({
        success: true,
        email,
        emailHash,
        whitelistProof: whitelistProof.ownershipProof,
        message:
          "Email added to database, but blockchain write failed. Please retry blockchain sync.",
        blockchainAdded: false,
        blockchainError:
          blockchainError instanceof Error
            ? blockchainError.message
            : "Unknown error",
      });
    }
  } catch (error) {
    console.error("Failed to add email to whitelist:", error);
    return NextResponse.json(
      { error: "Failed to add email to whitelist" },
      { status: 500 },
    );
  }
}
