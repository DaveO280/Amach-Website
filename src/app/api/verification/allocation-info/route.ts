import { NextResponse } from "next/server";

// Force Node.js runtime for ethers.js compatibility
export const runtime = "nodejs";

import { ethers } from "ethers";
import { getContractAddresses } from "@/lib/networkConfig";

// Contract configuration - uses networkConfig for automatic network switching
const getProfileVerificationContract = (): string => {
  return (
    process.env.PROFILE_VERIFICATION_CONTRACT ||
    getContractAddresses().PROFILE_VERIFICATION_CONTRACT
  );
};

const RPC_URL =
  process.env.NEXT_PUBLIC_ZKSYNC_RPC_URL ||
  process.env.ZKSYNC_RPC_URL ||
  "https://sepolia.era.zksync.dev";

// Contract ABI
const PROFILE_VERIFICATION_ABI = [
  "function getAllocationConfig() external view returns (tuple(uint256 maxAllocations, uint256 allocationPerUser, uint256 totalAllocated, bool isActive))",
  "function getTotalVerifiedUsers() external view returns (uint256)",
  "function getUserVerification(address user) external view returns (tuple(string email, address wallet, uint256 userId, uint256 timestamp, bool isActive, bool hasReceivedTokens, uint256 tokenAllocation))",
];

export async function GET(request: Request): Promise<NextResponse> {
  console.log("🔍 Allocation-info API called");
  try {
    const contractAddress = getProfileVerificationContract();
    console.log("📋 Using contract address:", contractAddress);
    console.log("🔗 Using RPC URL:", RPC_URL);

    // Create interface for encoding/decoding
    const iface = new ethers.utils.Interface(PROFILE_VERIFICATION_ABI);

    // Helper function to make RPC call directly
    const call = async (
      method: string,
      params: unknown[] = [],
    ): Promise<unknown> => {
      const response = await fetch(RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method,
          params,
        }),
      });
      const data = await response.json();
      if (data.error) {
        throw new Error(data.error.message || "RPC error");
      }
      return data.result;
    };

    console.log("✅ Direct RPC initialized");

    // Get allocation configuration
    console.log("📊 Fetching allocation config and total verified users...");

    // Encode function calls
    const getAllocationConfigData = iface.encodeFunctionData(
      "getAllocationConfig",
      [],
    );
    const getTotalVerifiedUsersData = iface.encodeFunctionData(
      "getTotalVerifiedUsers",
      [],
    );

    // Make RPC calls
    const [allocationConfigResult, totalVerifiedUsersResult] =
      await Promise.all([
        call("eth_call", [
          { to: contractAddress, data: getAllocationConfigData },
          "latest",
        ]),
        call("eth_call", [
          { to: contractAddress, data: getTotalVerifiedUsersData },
          "latest",
        ]),
      ]);

    // Decode results
    const [allocationConfig] = iface.decodeFunctionResult(
      "getAllocationConfig",
      allocationConfigResult as string,
    );
    const [totalVerifiedUsers] = iface.decodeFunctionResult(
      "getTotalVerifiedUsers",
      totalVerifiedUsersResult as string,
    );
    console.log("✅ Retrieved allocation config:", {
      maxAllocations: Number(allocationConfig.maxAllocations),
      totalAllocated: Number(allocationConfig.totalAllocated),
      isActive: allocationConfig.isActive,
    });

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

        // Encode and call getUserVerification
        const getUserVerificationData = iface.encodeFunctionData(
          "getUserVerification",
          [walletAddress],
        );
        const verificationResult = await call("eth_call", [
          { to: contractAddress, data: getUserVerificationData },
          "latest",
        ]);
        const [verification] = iface.decodeFunctionResult(
          "getUserVerification",
          verificationResult as string,
        );

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
          console.log(
            "ℹ️ User verification is not active (user not verified yet)",
          );
        }
      } catch (error) {
        // User might not be verified yet - this is expected for new wallets
        // Don't log as error, just as info
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        if (
          errorMessage.includes("not verified") ||
          errorMessage.includes("does not exist") ||
          errorMessage.includes("revert") ||
          errorMessage.includes("User is not verified")
        ) {
          console.log(
            "ℹ️ User not verified yet - this is expected for new wallets",
          );
        } else {
          console.error(
            `❌ Error getting verification for wallet ${walletAddress}:`,
            error,
          );
        }
      }
    } else {
      console.log("ℹ️ No wallet address provided");
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
    console.error("❌ Failed to get allocation info:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Return a more helpful error response
    return NextResponse.json(
      {
        error: "Failed to get allocation information",
        details: errorMessage,
        // Provide default values so the UI doesn't break
        maxAllocations: 0,
        allocationPerUser: "0",
        totalAllocated: 0,
        remainingAllocations: 0,
        isActive: false,
        totalVerifiedUsers: 0,
        userAllocation: null,
      },
      { status: 500 },
    );
  }
}
