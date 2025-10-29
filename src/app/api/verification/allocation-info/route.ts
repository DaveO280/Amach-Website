import { NextResponse } from "next/server";

// Force Node.js runtime for ethers.js compatibility
export const runtime = "nodejs";

import { ethers } from "ethers";

// Contract configuration (Fresh Deployment - Oct 28 2025)
const PROFILE_VERIFICATION_CONTRACT =
  process.env.PROFILE_VERIFICATION_CONTRACT ||
  "0xA2D3b1b8080895C5bE335d8352D867e4b6e51ab3";
const RPC_URL = process.env.ZKSYNC_RPC_URL || "https://sepolia.era.zksync.dev";

// Contract ABI
const PROFILE_VERIFICATION_ABI = [
  "function getAllocationConfig() external view returns (tuple(uint256 maxAllocations, uint256 allocationPerUser, uint256 totalAllocated, bool isActive))",
  "function getTotalVerifiedUsers() external view returns (uint256)",
  "function getUserVerification(address user) external view returns (tuple(string email, address wallet, uint256 userId, uint256 timestamp, bool isActive, bool hasReceivedTokens, uint256 tokenAllocation))",
];

export async function GET(request: Request): Promise<NextResponse> {
  console.log("🔍 Allocation-info API called");
  try {
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
    console.log("🔗 Provider and contract initialized");

    // Get allocation configuration
    const [allocationConfig, totalVerifiedUsers] = await Promise.all([
      contract.getAllocationConfig(),
      contract.getTotalVerifiedUsers(),
    ]);

    // Check if a specific wallet address is provided
    const url = new URL(request.url);
    const walletAddress = url.searchParams.get("wallet");
    console.log("🔍 Requested wallet address:", walletAddress);

    let userAllocation = null;
    if (walletAddress) {
      try {
        console.log(
          "📋 Calling getUserVerification for wallet:",
          walletAddress,
        );
        const verification = await contract.getUserVerification(walletAddress);
        console.log("📋 Verification result:", {
          email: verification.email,
          isActive: verification.isActive,
          hasReceivedTokens: verification.hasReceivedTokens,
          tokenAllocation: ethers.utils.formatEther(
            verification.tokenAllocation,
          ),
        });

        if (verification.isActive) {
          userAllocation = {
            wallet: walletAddress,
            email: verification.email,
            allocationAmount: ethers.utils.formatEther(
              verification.tokenAllocation,
            ),
            hasClaimed: verification.hasReceivedTokens,
            isVerified: verification.isActive,
            userId: Number(verification.userId),
            timestamp: Number(verification.timestamp),
          };
          console.log("✅ Created userAllocation:", userAllocation);
        } else {
          console.log("❌ User verification is not active");
        }
      } catch (error) {
        console.error(
          `❌ Error getting verification for wallet ${walletAddress}:`,
          error,
        );
      }
    } else {
      console.log("❌ No wallet address provided");
    }

    return NextResponse.json({
      maxAllocations: Number(allocationConfig.maxAllocations),
      allocationPerUser: ethers.utils.formatEther(
        allocationConfig.allocationPerUser,
      ),
      totalAllocated: Number(allocationConfig.totalAllocated),
      remainingAllocations:
        Number(allocationConfig.maxAllocations) -
        Number(allocationConfig.totalAllocated),
      isActive: allocationConfig.isActive,
      totalVerifiedUsers: Number(totalVerifiedUsers),
      userAllocation: userAllocation,
    });
  } catch (error) {
    console.error("Failed to get allocation info:", error);
    return NextResponse.json(
      { error: "Failed to get allocation information" },
      { status: 500 },
    );
  }
}
