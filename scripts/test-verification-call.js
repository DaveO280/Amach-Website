/**
 * Test calling verifyProfileZKsync to see actual revert reason
 * This uses the deployer wallet, so it will verify the deployer, not the user
 * But it will show us if the contract function works at all
 */

const { ethers } = require("ethers");
require("dotenv").config({ path: ".env.local" });

const PROFILE_VERIFICATION_CONTRACT =
  "0xC9950703cE4eD704d2a0B075F7FAC3d968940f57";
const RPC_URL = "https://sepolia.era.zksync.dev";

const ABI = [
  "function verifyProfileZKsync(string memory email) external",
  "function isEmailInUse(string memory email) external view returns (bool)",
  "function isWalletInUse(address wallet) external view returns (bool)",
  "function verificationEnabled() external view returns (bool)",
];

async function main() {
  // Use a test email that's different from the real one
  const testEmail = `test-${Date.now()}@example.com`;

  console.log("🧪 Testing verifyProfileZKsync function...\n");

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("PRIVATE_KEY not found in .env.local");
  }

  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(
    PROFILE_VERIFICATION_CONTRACT,
    ABI,
    provider,
  );

  console.log("📋 Contract:", PROFILE_VERIFICATION_CONTRACT);
  console.log("👤 Deployer wallet:", signer.address);
  console.log("📧 Test email:", testEmail);

  // Check preconditions
  console.log("\n🔍 Checking preconditions...");
  const verificationEnabled = await contract.verificationEnabled();
  const emailInUse = await contract.isEmailInUse(testEmail);
  const walletInUse = await contract.isWalletInUse(signer.address);

  console.log("   Verification enabled:", verificationEnabled);
  console.log("   Email in use:", emailInUse);
  console.log("   Wallet in use:", walletInUse);

  if (!verificationEnabled) {
    console.log("\n❌ Verification is disabled!");
    return;
  }

  if (emailInUse) {
    console.log("\n⚠️ Email already in use!");
  }

  if (walletInUse) {
    console.log("\n⚠️ Wallet already in use!");
    console.log("   This is expected if you've verified before.");
    console.log(
      "   The script will still try to call the function to see the revert.",
    );
  }

  // Try to estimate gas first (this will show revert reason if it fails)
  console.log("\n🔄 Estimating gas for transaction...");
  try {
    const contractWithSigner = contract.connect(signer);
    const gasEstimate =
      await contractWithSigner.estimateGas.verifyProfileZKsync(testEmail);
    console.log("   Estimated gas:", gasEstimate.toString());
    console.log("\n✅ Gas estimation succeeded - transaction should work!");

    console.log(
      "\n   If Privy wallet can't send this transaction, the issue is with:",
    );
    console.log("   1. Privy's transaction simulation/validation");
    console.log("   2. Account Abstraction wallet compatibility with contract");
    console.log("   3. Privy's RPC endpoint returning different data");
  } catch (error) {
    console.log("\n❌ Gas estimation failed!");
    console.log("   Error:", error.message);

    // Try to extract revert reason
    if (error.error && error.error.message) {
      console.log("   Revert reason:", error.error.message);
    }

    if (error.reason) {
      console.log("   Reason:", error.reason);
    }

    console.log("\n📊 This is the actual error that would occur on-chain.");
    console.log("   Privy might be seeing this same error during simulation.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  });
