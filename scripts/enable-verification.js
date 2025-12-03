/**
 * Enable verification on the ProfileVerification contract
 * Run with: node scripts/enable-verification.js
 */

const { ethers } = require("ethers");
require("dotenv").config({ path: ".env.local" });

const PROFILE_VERIFICATION_CONTRACT =
  "0xC9950703cE4eD704d2a0B075F7FAC3d968940f57";
const RPC_URL = "https://sepolia.era.zksync.dev";

const ABI = [
  "function verificationEnabled() external view returns (bool)",
  "function setVerificationEnabled(bool enabled) external",
  "function owner() external view returns (address)",
];

async function main() {
  console.log("🔧 Enabling verification on ProfileVerification contract...\n");

  // Get private key from environment
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("PRIVATE_KEY not found in .env.local");
  }

  // Connect to zkSync Sepolia
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(
    PROFILE_VERIFICATION_CONTRACT,
    ABI,
    wallet,
  );

  console.log("📋 Contract:", PROFILE_VERIFICATION_CONTRACT);
  console.log("👤 Wallet:", wallet.address);

  // Check current status
  console.log("\n📊 Checking current status...");
  const isEnabled = await contract.verificationEnabled();
  const owner = await contract.owner();

  console.log("   Verification enabled:", isEnabled);
  console.log("   Contract owner:", owner);
  console.log("   Your address:", wallet.address);

  if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
    console.error("\n❌ ERROR: You are not the contract owner!");
    console.error("   Owner:", owner);
    console.error("   Your address:", wallet.address);
    process.exit(1);
  }

  if (isEnabled) {
    console.log("\n✅ Verification is already enabled!");
    return;
  }

  // Enable verification
  console.log("\n🔄 Enabling verification...");
  const tx = await contract.setVerificationEnabled(true);
  console.log("   Transaction hash:", tx.hash);

  console.log("⏳ Waiting for confirmation...");
  const receipt = await tx.wait();
  console.log("✅ Transaction confirmed in block:", receipt.blockNumber);

  // Verify it worked
  const newStatus = await contract.verificationEnabled();
  console.log("\n📊 New status:");
  console.log("   Verification enabled:", newStatus);

  console.log("\n✅ Verification has been enabled successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  });
