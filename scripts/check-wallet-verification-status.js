const { ethers } = require("ethers");
require("dotenv").config();

async function checkWalletStatus() {
  const RPC_URL =
    process.env.ZKSYNC_RPC_URL || "https://sepolia.era.zksync.dev";
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL, {
    name: "zksync-sepolia",
    chainId: 300,
  });

  const contract = new ethers.Contract(
    "0x2C35eBf2085e5d1224Fb170A1594E314Dea6B759",
    [
      "function getUserVerification(address user) external view returns (tuple(string email, address wallet, uint256 userId, uint256 timestamp, bool isActive, bool hasReceivedTokens, uint256 tokenAllocation))",
      "function isEmailWhitelisted(string memory email) external view returns (bool)",
      "function isEmailInUse(string memory email) external view returns (bool)",
      "function isWalletInUse(address wallet) external view returns (bool)",
    ],
    provider,
  );

  const wallet = "0xF3750F0a1F6E9e06a1887d7b9f3E638F8fA64759";
  const email = "tbh81_99@yahoo.com";

  console.log("🔍 Checking wallet and email status...\n");

  try {
    // Check wallet verification
    const verification = await contract.getUserVerification(wallet);
    console.log("📋 Wallet verification status:");
    console.log("   Email:", verification.email || "(empty)");
    console.log("   Wallet:", verification.wallet);
    console.log("   Is Active:", verification.isActive);
    console.log("   Has Received Tokens:", verification.hasReceivedTokens);
    console.log(
      "   Token Allocation:",
      ethers.utils.formatEther(verification.tokenAllocation),
    );

    // Check if email is whitelisted
    const isWhitelisted = await contract.isEmailWhitelisted(email);
    console.log(`\n📧 Email ${email} whitelisted:`, isWhitelisted);

    // Check if email is in use
    const isEmailInUse = await contract.isEmailInUse(email);
    console.log(`📧 Email ${email} in use:`, isEmailInUse);

    // Check if wallet is in use
    const isWalletInUse = await contract.isWalletInUse(wallet);
    console.log(`💰 Wallet ${wallet} in use:`, isWalletInUse);
  } catch (error) {
    console.log("❌ Error:", error.message);
  }
}

checkWalletStatus();
