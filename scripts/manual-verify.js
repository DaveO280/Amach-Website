/**
 * Manually verify a user's profile
 * Run with: node scripts/manual-verify.js <wallet-address> <email>
 */

const { ethers } = require("ethers");
require("dotenv").config({ path: ".env.local" });

const PROFILE_VERIFICATION_CONTRACT =
  "0xC9950703cE4eD704d2a0B075F7FAC3d968940f57";
const RPC_URL = "https://sepolia.era.zksync.dev";

const ABI = [
  "function verifyProfileZKsync(string memory email) external",
  "function getUserVerification(address user) external view returns (tuple(string email, address wallet, uint256 userId, uint256 timestamp, bool isActive, bool hasReceivedTokens, uint256 tokenAllocation))",
];

async function main() {
  // Get parameters
  const walletAddress =
    process.argv[2] || "0x58147e61cc2683295c6eD00D5daeB8052B3D0c87";
  const email = process.argv[3] || "ogara.d@gmail.com";

  console.log("🔐 Manual profile verification...\n");
  console.log("📋 Contract:", PROFILE_VERIFICATION_CONTRACT);
  console.log("👤 Target wallet:", walletAddress);
  console.log("📧 Email:", email);

  // IMPORTANT: This will verify using YOUR deployer wallet as msg.sender
  // NOT the target wallet. Only use this for testing!
  console.log(
    "\n⚠️  WARNING: This will verify YOUR wallet (the one with PRIVATE_KEY), not the target wallet!",
  );
  console.log(
    "    This is only for testing the contract. Use the app for real verification.\n",
  );

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

  console.log("🔄 Your wallet:", signer.address);
  console.log("\n🔄 Sending verification transaction...");

  try {
    const tx = await contract.verifyProfileZKsync(email, {
      gasLimit: 500000, // Higher gas limit
    });
    console.log("   Transaction hash:", tx.hash);

    console.log("⏳ Waiting for confirmation...");
    const receipt = await tx.wait();
    console.log("✅ Transaction confirmed in block:", receipt.blockNumber);

    // Check the verification
    console.log("\n📊 Checking verification...");
    const verification = await contract.getUserVerification(signer.address);
    console.log("   Email:", verification.email);
    console.log("   Is active:", verification.isActive);
    console.log(
      "   Token allocation:",
      ethers.utils.formatEther(verification.tokenAllocation),
      "AHP",
    );

    console.log("\n✅ Verification successful!");
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    if (error.error) {
      console.error("   Details:", error.error);
    }
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Failed:", error);
    process.exit(1);
  });
