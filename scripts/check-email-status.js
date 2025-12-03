/**
 * Check Email Status Script
 *
 * This script checks the current state of an email in the ProfileVerification contract
 */

const { ethers } = require("ethers");
require("dotenv").config();

const PROFILE_VERIFICATION_CONTRACT =
  "0xA2D3b1b8080895C5bE335d8352D867e4b6e51ab3";
const RPC_URL = process.env.ZKSYNC_RPC_URL || "https://sepolia.era.zksync.dev";

const ABI = [
  "function isEmailInUse(string email) external view returns (bool)",
  "function emailToWallet(string) external view returns (address)",
  "function getUserVerification(address user) external view returns (tuple(string email, address wallet, uint256 userId, uint256 timestamp, bool isActive, bool hasReceivedTokens, uint256 tokenAllocation))",
];

async function checkEmailStatus() {
  const email = "ogara.d@gmail.com";

  console.log("\n🔍 Checking Email Status");
  console.log("========================");
  console.log(`Email: ${email}`);
  console.log(`Contract: ${PROFILE_VERIFICATION_CONTRACT}`);
  console.log(`Network: zkSync Sepolia\n`);

  try {
    const network = { name: "zksync-sepolia", chainId: 300 };
    const provider = new ethers.providers.StaticJsonRpcProvider(
      RPC_URL,
      network,
    );
    const contract = new ethers.Contract(
      PROFILE_VERIFICATION_CONTRACT,
      ABI,
      provider,
    );

    // Check if email is in use
    const isInUse = await contract.isEmailInUse(email);
    console.log(`📋 isEmailInUse: ${isInUse}`);

    // Get wallet mapped to email
    const walletAddress = await contract.emailToWallet(email);
    console.log(`📋 emailToWallet: ${walletAddress}`);

    if (walletAddress !== ethers.constants.AddressZero) {
      console.log("\n🔍 Getting verification details...");
      const verification = await contract.getUserVerification(walletAddress);
      console.log(`   Email: ${verification.email}`);
      console.log(`   Wallet: ${verification.wallet}`);
      console.log(`   User ID: ${verification.userId.toString()}`);
      console.log(`   Is Active: ${verification.isActive}`);
      console.log(
        `   Token Allocation: ${ethers.utils.formatEther(verification.tokenAllocation)} AHP`,
      );
      console.log(`   Has Received Tokens: ${verification.hasReceivedTokens}`);

      if (isInUse || verification.isActive) {
        console.log("\n❌ Email is registered and active!");
        console.log(`\n✅ To clear this registration, run:`);
        console.log(
          `   node scripts/clear-user-registration.js ${walletAddress}`,
        );
      } else {
        console.log("\n✅ Email registration exists but is deactivated.");
        console.log(
          "However, the mapping still exists. You may need to clear it:",
        );
        console.log(
          `   node scripts/clear-user-registration.js ${walletAddress}`,
        );
      }
    } else {
      console.log(
        "\n✅ Email is NOT registered! You can proceed with wallet creation.",
      );
    }
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  }
}

checkEmailStatus();
