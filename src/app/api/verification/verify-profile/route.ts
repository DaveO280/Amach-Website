import { NextRequest, NextResponse } from "next/server";

// Force Node.js runtime for ethers.js compatibility
export const runtime = "nodejs";

import { ethers } from "ethers";

// Contract configuration (Fresh Deployment - Oct 28 2025)
const PROFILE_VERIFICATION_CONTRACT =
  process.env.PROFILE_VERIFICATION_CONTRACT ||
  "0xfeDa5D6c52ba8a3a412c1De6747B516c42F46377";
const RPC_URL = process.env.ZKSYNC_RPC_URL || "https://sepolia.era.zksync.dev";
const PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY || "";

// Contract ABI
const PROFILE_VERIFICATION_ABI = [
  "function verifyProfile(string memory email, bytes memory signature) external",
  "function verifyProfileZKsync(string memory email) external",
  "function getUserVerification(address user) external view returns (tuple(string email, address wallet, uint256 userId, uint256 timestamp, bool isActive, bool hasReceivedTokens, uint256 tokenAllocation))",
  "function isEmailWhitelisted(string memory email) external view returns (bool)",
  "function isEmailInUse(string memory email) external view returns (bool)",
  "function isWalletInUse(address wallet) external view returns (bool)",
];

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { email, walletAddress, signature } = await request.json();

    if (!email || !walletAddress || !signature) {
      return NextResponse.json(
        { error: "Email, wallet address, and signature are required" },
        { status: 400 },
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 },
      );
    }

    // Validate wallet address
    if (!ethers.utils.isAddress(walletAddress)) {
      return NextResponse.json(
        { error: "Invalid wallet address" },
        { status: 400 },
      );
    }

    // Initialize provider, signer, and contract with explicit network config
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL, {
      name: "zksync-sepolia",
      chainId: 300,
    });
    const signer = new ethers.Wallet(PRIVATE_KEY, provider);
    const contract = new ethers.Contract(
      PROFILE_VERIFICATION_CONTRACT,
      PROFILE_VERIFICATION_ABI,
      signer,
    );

    // Pre-verification checks
    const [isWhitelisted, isEmailInUse, isWalletInUse] = await Promise.all([
      contract.isEmailWhitelisted(email),
      contract.isEmailInUse(email),
      contract.isWalletInUse(walletAddress),
    ]);

    if (!isWhitelisted) {
      return NextResponse.json(
        { error: "Email is not whitelisted" },
        { status: 400 },
      );
    }

    if (isEmailInUse) {
      return NextResponse.json(
        { error: "Email is already in use" },
        { status: 400 },
      );
    }

    if (isWalletInUse) {
      return NextResponse.json(
        { error: "Wallet is already in use" },
        { status: 400 },
      );
    }

    // Verify signature (this would be done client-side in a real implementation)
    // For now, we'll simulate the verification
    // const messageHash = ethers.solidityPackedKeccak256(
    //   ['string', 'address'],
    //   [email, walletAddress]
    // );
    // const ethSignedMessageHash = ethers.solidityPackedKeccak256(
    //   ['string', 'bytes32'],
    //   ['\x19Ethereum Signed Message:\n32', messageHash]
    // );

    // In a real implementation, you would verify the signature here
    // const recoveredAddress = ethers.recoverAddress(ethSignedMessageHash, signature);
    // if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
    //   return NextResponse.json(
    //     { error: 'Invalid signature' },
    //     { status: 400 }
    //   );
    // }

    // Call the verification contract
    const tx = await contract.verifyProfile(email, signature);
    await tx.wait();

    // Get the verification data
    const verification = await contract.getUserVerification(walletAddress);

    // Track the verification in the admin dashboard
    try {
      const adminDashboardUrl =
        process.env.ADMIN_DASHBOARD_URL || "http://localhost:3001";
      await fetch(`${adminDashboardUrl}/api/tracking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          action: "profile_verified",
          walletAddress,
          source: "main-app-verification-api",
          proofDetails: `Profile verified on-chain via verification API`,
        }),
      });
      console.log("📊 Profile verification tracked successfully");
    } catch (trackingError) {
      console.warn(
        "⚠️ Failed to track verification (non-critical):",
        trackingError,
      );
    }

    return NextResponse.json({
      success: true,
      transactionHash: tx.hash,
      verification: {
        email: verification.email,
        wallet: verification.wallet,
        userId: Number(verification.userId),
        timestamp: new Date(
          Number(verification.timestamp) * 1000,
        ).toISOString(),
        isActive: verification.isActive,
        hasReceivedTokens: verification.hasReceivedTokens,
        tokenAllocation: ethers.utils.formatEther(verification.tokenAllocation),
      },
    });
  } catch (error) {
    console.error("Failed to verify profile:", error);

    // Handle specific contract errors
    if (error instanceof Error && error.message) {
      if (error.message.includes("Email not whitelisted")) {
        return NextResponse.json(
          { error: "Email is not whitelisted" },
          { status: 400 },
        );
      }
      if (error.message.includes("Email already in use")) {
        return NextResponse.json(
          { error: "Email is already in use" },
          { status: 400 },
        );
      }
      if (error.message.includes("Wallet already in use")) {
        return NextResponse.json(
          { error: "Wallet is already in use" },
          { status: 400 },
        );
      }
      if (error.message.includes("Invalid signature")) {
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 400 },
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to verify profile" },
      { status: 500 },
    );
  }
}
