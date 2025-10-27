import { NextRequest, NextResponse } from "next/server";

// Force Node.js runtime for ethers.js compatibility
export const runtime = "nodejs";

import { ethers } from "ethers";

// Contract configuration
const PROFILE_VERIFICATION_CONTRACT =
  process.env.PROFILE_VERIFICATION_CONTRACT ||
  "0x87B69bDBa7e9E15E7e8e3337D76c62A2b6A78356";
const RPC_URL = process.env.ZKSYNC_RPC_URL || "https://sepolia.era.zksync.dev";
const PRIVATE_KEY = process.env.PRIVATE_KEY || ""; // Use the deployer private key

// Contract ABI
const PROFILE_VERIFICATION_ABI = [
  "function addEmailToWhitelist(string memory email) external",
  "function isEmailWhitelisted(string memory email) external view returns (bool)",
];

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 },
      );
    }

    console.log(`📧 Adding email to whitelist: ${email}`);

    // Initialize provider and signer
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL, {
      name: "zksync-sepolia",
      chainId: 300,
    });

    if (!PRIVATE_KEY) {
      return NextResponse.json(
        { error: "Private key not configured" },
        { status: 500 },
      );
    }

    const signer = new ethers.Wallet(PRIVATE_KEY, provider);
    const contract = new ethers.Contract(
      PROFILE_VERIFICATION_CONTRACT,
      PROFILE_VERIFICATION_ABI,
      signer,
    );

    // Check if email is already whitelisted
    const isAlreadyWhitelisted = await contract.isEmailWhitelisted(email);
    if (isAlreadyWhitelisted) {
      return NextResponse.json({
        success: true,
        message: "Email is already whitelisted",
        email,
        isWhitelisted: true,
      });
    }

    // Add email to whitelist
    console.log("📝 Calling addEmailToWhitelist...");
    const tx = await contract.addEmailToWhitelist(email);
    console.log("⏳ Waiting for transaction...");
    await tx.wait();
    console.log("✅ Transaction confirmed");

    return NextResponse.json({
      success: true,
      message: "Email added to whitelist successfully",
      email,
      transactionHash: tx.hash,
      isWhitelisted: true,
    });
  } catch (error) {
    console.error("❌ Failed to add email to whitelist:", error);
    return NextResponse.json(
      {
        error: "Failed to add email to whitelist",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
