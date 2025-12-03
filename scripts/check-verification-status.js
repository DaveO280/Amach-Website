/**
 * Check verification status for a wallet
 * Run with: node scripts/check-verification-status.js <wallet-address>
 */

const { ethers } = require("ethers");

const PROFILE_VERIFICATION_CONTRACT =
  "0xC9950703cE4eD704d2a0B075F7FAC3d968940f57";
const RPC_URL = "https://sepolia.era.zksync.dev";

const ABI = [
  "function getUserVerification(address user) external view returns (tuple(string email, address wallet, uint256 userId, uint256 timestamp, bool isActive, bool hasReceivedTokens, uint256 tokenAllocation))",
  "function isUserVerified(address user) external view returns (bool)",
  "function isEmailInUse(string memory email) external view returns (bool)",
  "function isWalletInUse(address wallet) external view returns (bool)",
];

async function main() {
  const walletAddress =
    process.argv[2] || "0x58147e61cc2683295c6eD00D5daeB8052B3D0c87";
  const email = process.argv[3] || "ogara.d@gmail.com";

  console.log("🔍 Checking verification status...\n");
  console.log("📋 Contract:", PROFILE_VERIFICATION_CONTRACT);
  console.log("👤 Wallet:", walletAddress);
  console.log("📧 Email:", email);

  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(
    PROFILE_VERIFICATION_CONTRACT,
    ABI,
    provider,
  );

  // Check wallet status
  console.log("\n📊 Checking wallet status...");
  try {
    const isWalletInUse = await contract.isWalletInUse(walletAddress);
    console.log("   Wallet in use:", isWalletInUse);

    const isVerified = await contract.isUserVerified(walletAddress);
    console.log("   Is verified:", isVerified);

    if (isVerified || isWalletInUse) {
      const verification = await contract.getUserVerification(walletAddress);
      console.log("\n📋 Verification details:");
      console.log("   Email:", verification.email);
      console.log("   User ID:", verification.userId.toString());
      console.log(
        "   Timestamp:",
        new Date(verification.timestamp.toNumber() * 1000).toLocaleString(),
      );
      console.log("   Is active:", verification.isActive);
      console.log("   Has received tokens:", verification.hasReceivedTokens);
      console.log(
        "   Token allocation:",
        ethers.utils.formatEther(verification.tokenAllocation),
        "AHP",
      );
    }
  } catch (error) {
    console.log("   Error checking wallet:", error.message);
  }

  // Check email status
  console.log("\n📧 Checking email status...");
  try {
    const isEmailInUse = await contract.isEmailInUse(email);
    console.log("   Email in use:", isEmailInUse);
  } catch (error) {
    console.log("   Error checking email:", error.message);
  }

  console.log("\n✅ Status check complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });
