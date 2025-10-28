import { NextRequest, NextResponse } from "next/server";

// Force Node.js runtime for ethers.js compatibility
export const runtime = "nodejs";

import { ethers } from "ethers";

// Contract configuration (Fresh Deployment - Oct 28 2025)
const PROFILE_VERIFICATION_CONTRACT =
  process.env.PROFILE_VERIFICATION_CONTRACT ||
  "0x07CB4d29fB08F7817914ADAFAc53E2857461bE7C";
const RPC_URL = process.env.ZKSYNC_RPC_URL || "https://sepolia.era.zksync.dev";

// Contract ABI
const PROFILE_VERIFICATION_ABI = [
  "function getUserVerification(address user) external view returns (tuple(string email, address wallet, uint256 userId, uint256 timestamp, bool isActive, bool hasReceivedTokens, uint256 tokenAllocation))",
  "function isEmailInUse(string memory email) external view returns (bool)",
  "function emailToWallet(string memory email) external view returns (address)",
];

export async function POST(request: NextRequest): Promise<NextResponse> {
  let email: string = "";

  try {
    const requestData = await request.json();
    email = requestData.email;

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Initialize provider and contract with explicit network config
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL, {
      name: "zksync-sepolia",
      chainId: 300,
    });
    const contract = new ethers.Contract(
      PROFILE_VERIFICATION_CONTRACT,
      PROFILE_VERIFICATION_ABI,
      provider,
    );

    // Check if email is in use and get wallet address
    const [isInUse, walletAddress] = await Promise.all([
      contract.isEmailInUse(email),
      contract.emailToWallet(email),
    ]);

    // If email is not in use, user is not verified
    if (!isInUse || walletAddress === ethers.constants.AddressZero) {
      return NextResponse.json({
        isVerified: false,
        email,
        userId: null,
        tokenAllocation: null,
        hasReceivedTokens: false,
        verificationDate: null,
      });
    }

    // Get verification data using wallet address
    const verificationData = await contract.getUserVerification(walletAddress);

    // User is verified, return verification data
    return NextResponse.json({
      isVerified: true,
      email: verificationData.email,
      userId: Number(verificationData.userId),
      tokenAllocation: ethers.utils.formatEther(
        verificationData.tokenAllocation,
      ),
      hasReceivedTokens: verificationData.hasReceivedTokens,
      verificationDate: new Date(
        Number(verificationData.timestamp) * 1000,
      ).toISOString(),
    });
  } catch (error) {
    console.error("Failed to check verification status:", error);

    // If it's a contract error (user not found), return not verified
    if (
      error instanceof Error &&
      (error.message.includes("User not found") ||
        error.message.includes("call revert"))
    ) {
      return NextResponse.json({
        isVerified: false,
        email: email,
        userId: null,
        tokenAllocation: null,
        hasReceivedTokens: false,
        verificationDate: null,
      });
    }

    return NextResponse.json(
      { error: "Failed to check verification status" },
      { status: 500 },
    );
  }
}
