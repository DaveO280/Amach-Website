/**
 * Decode the verification data returned
 */

const { ethers } = require("ethers");

const data =
  "0x00000000000000000000000000000000000000000000000000000000000000e000000000000000000000000058147e61cc2683295c6ed00d5daeb8052b3d0c87000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000692e088c0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003635c9adc5dea0000000000000000000000000000000000000000000000000000000000000000000116f676172612e6440676d61696c2e636f6d000000000000000000000000000000";

// UserVerification struct
const types = [
  "tuple(string email, address wallet, uint256 userId, uint256 timestamp, bool isActive, bool hasReceivedTokens, uint256 tokenAllocation)",
];

const abi = new ethers.utils.AbiCoder();

try {
  const decoded = abi.decode(types, data);
  const verification = decoded[0];

  console.log("📊 User Verification Data:\n");
  console.log("   Email:", verification.email);
  console.log("   Wallet:", verification.wallet);
  console.log("   User ID:", verification.userId.toString());
  console.log(
    "   Timestamp:",
    verification.timestamp.toString(),
    `(${new Date(verification.timestamp.toNumber() * 1000).toISOString()})`,
  );
  console.log("   Is Active:", verification.isActive);
  console.log("   Has Received Tokens:", verification.hasReceivedTokens);
  console.log(
    "   Token Allocation:",
    ethers.utils.formatEther(verification.tokenAllocation),
    "AHP",
  );

  console.log("\n🔍 Analysis:");

  if (!verification.isActive) {
    console.log("   ❌ User is not active!");
  } else {
    console.log("   ✅ User is active");
  }

  if (verification.hasReceivedTokens) {
    console.log("   ❌ Tokens already claimed!");
  } else {
    console.log("   ✅ Tokens not yet claimed");
  }

  if (verification.tokenAllocation.eq(0)) {
    console.log("   ❌ No allocation available!");
  } else {
    console.log(
      "   ✅ Allocation:",
      ethers.utils.formatEther(verification.tokenAllocation),
      "AHP",
    );
  }
} catch (error) {
  console.error("Failed to decode:", error.message);
}
