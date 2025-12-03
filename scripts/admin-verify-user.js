/**
 * Admin verification - manually verify a user from the deployer wallet
 * This is a workaround for Privy embedded wallet issues with zkSync
 *
 * Run with: node scripts/admin-verify-user.js <user-wallet> <email>
 */

const { ethers } = require("ethers");
require("dotenv").config({ path: ".env.local" });

const PROFILE_VERIFICATION_CONTRACT =
  "0xC9950703cE4eD704d2a0B075F7FAC3d968940f57";
const RPC_URL = "https://sepolia.era.zksync.dev";

// Admin verification function - bypasses normal checks
const ABI = [
  "function userVerifications(address) external view returns (tuple(string email, address wallet, uint256 userId, uint256 timestamp, bool isActive, bool hasReceivedTokens, uint256 tokenAllocation))",
  "function walletToEmail(address) external view returns (string)",
  "function emailToWallet(string) external view returns (address)",
  "function nextUserId() external view returns (uint256)",
  "function getAllocationConfig() external view returns (tuple(uint256 maxAllocations, uint256 allocationPerUser, uint256 totalAllocated, bool isActive))",
  // We'll need to call this as owner to bypass checks
  "function owner() external view returns (address)",
];

async function main() {
  const userWallet =
    process.argv[2] || "0x58147e61cc2683295c6eD00D5daeB8052B3D0c87";
  const userEmail = process.argv[3] || "ogara.d@gmail.com";

  console.log("🔐 Admin User Verification");
  console.log("=".repeat(50));
  console.log("\n📋 Details:");
  console.log("   Contract:", PROFILE_VERIFICATION_CONTRACT);
  console.log("   User wallet:", userWallet);
  console.log("   Email:", userEmail);

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("PRIVATE_KEY not found in .env.local");
  }

  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(
    PROFILE_VERIFICATION_CONTRACT,
    ABI,
    signer,
  );

  console.log("\n👤 Admin wallet:", signer.address);

  // Check if already verified
  console.log("\n🔍 Checking current status...");
  try {
    const existingEmail = await contract.walletToEmail(userWallet);
    if (existingEmail && existingEmail.length > 0) {
      console.log("⚠️  User already verified with email:", existingEmail);

      const verification = await contract.userVerifications(userWallet);
      console.log("\n📊 Existing verification:");
      console.log("   Email:", verification.email);
      console.log("   User ID:", verification.userId.toString());
      console.log("   Active:", verification.isActive);
      console.log("   Has tokens:", verification.hasReceivedTokens);
      console.log(
        "   Allocation:",
        ethers.utils.formatEther(verification.tokenAllocation),
        "AHP",
      );

      return;
    }
  } catch (err) {
    // Not verified yet, continue
  }

  // Check if email is in use
  const emailWallet = await contract.emailToWallet(userEmail);
  if (emailWallet !== ethers.constants.AddressZero) {
    console.log("❌ Email already in use by wallet:", emailWallet);
    return;
  }

  console.log("\n⚠️  WORKAROUND:");
  console.log(
    "   Since Privy embedded wallets have issues with zkSync transactions,",
  );
  console.log(
    "   we need to add the verification directly via admin database.",
  );
  console.log("");
  console.log("   Run this command:");
  console.log("");
  console.log(
    `   node scripts/add-verified-user.js ${userWallet} ${userEmail}`,
  );
  console.log("");
  console.log(
    "   This will add the user to the shared database, which the contract",
  );
  console.log("   can query for verification status.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  });
