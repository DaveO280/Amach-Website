import { NextRequest, NextResponse } from "next/server";

// Force Node.js runtime for ethers.js compatibility
export const runtime = "nodejs";

import { ethers } from "ethers";

// Contract configuration (Fresh Deployment - January 2025 - Final)
const PROFILE_VERIFICATION_CONTRACT =
  process.env.PROFILE_VERIFICATION_CONTRACT ||
  "0x87B69bDBa7e9E15E7e8e3337D76c62A2b6A78356";
const RPC_URL = process.env.ZKSYNC_RPC_URL || "https://sepolia.era.zksync.dev";
// const PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY || ''; // Not used in this file

// Contract ABI (simplified)
const PROFILE_VERIFICATION_ABI = [
  "function getTotalVerifiedUsers() external view returns (uint256)",
  "function getAllocationConfig() external view returns (tuple(uint256 totalAllocated, uint256 maxAllocations, uint256 allocationPerUser, bool isActive))",
  "function verificationEnabled() external view returns (bool)",
];

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Check admin authentication (implement your auth logic here)
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    // Get verification stats
    const [totalVerifiedUsers, allocationConfig, isVerificationActive] =
      await Promise.all([
        contract.getTotalVerifiedUsers(),
        contract.getAllocationConfig(),
        contract.verificationEnabled(),
      ]);

    const stats = {
      totalVerifiedUsers: Number(totalVerifiedUsers),
      totalAllocations: Number(allocationConfig.totalAllocated),
      remainingAllocations:
        Number(allocationConfig.maxAllocations) -
        Number(allocationConfig.totalAllocated),
      maxAllocations: Number(allocationConfig.maxAllocations),
      allocationPerUser: ethers.utils.formatEther(
        allocationConfig.allocationPerUser,
      ),
      isVerificationActive: isVerificationActive,
      allocationActive: allocationConfig.isActive,
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error("Failed to get verification stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch verification stats" },
      { status: 500 },
    );
  }
}
