/**
 * Fund the ProfileVerification contract with health tokens
 * so users can claim their allocations
 */

const { ethers } = require("ethers");
require("dotenv").config({ path: ".env.local" });

const PROFILE_VERIFICATION_CONTRACT =
  "0xC9950703cE4eD704d2a0B075F7FAC3d968940f57";
const HEALTH_TOKEN_CONTRACT = "0x057df807987f284b55ba6A9ab89d089fd8398B99";
const RPC_URL = "https://sepolia.era.zksync.dev";

// Amount to fund: enough for 5000 users * 1000 AHP each = 5,000,000 AHP
const FUNDING_AMOUNT = "5000000"; // 5 million AHP

const TOKEN_ABI = [
  "function balanceOf(address) external view returns (uint256)",
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function owner() external view returns (address)",
];

async function main() {
  console.log("💰 Funding ProfileVerification contract with AHP tokens...\n");

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("PRIVATE_KEY not found in .env.local");
  }

  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(privateKey, provider);
  const tokenContract = new ethers.Contract(
    HEALTH_TOKEN_CONTRACT,
    TOKEN_ABI,
    signer,
  );

  console.log("📋 Details:");
  console.log("   Your wallet:", signer.address);
  console.log("   Health token:", HEALTH_TOKEN_CONTRACT);
  console.log("   Verification contract:", PROFILE_VERIFICATION_CONTRACT);
  console.log("   Funding amount:", FUNDING_AMOUNT, "AHP");

  // Check your balance
  console.log("\n💳 Checking your token balance...");
  const yourBalance = await tokenContract.balanceOf(signer.address);
  console.log("   Your balance:", ethers.utils.formatEther(yourBalance), "AHP");

  const fundingAmountWei = ethers.utils.parseEther(FUNDING_AMOUNT);

  if (yourBalance.lt(fundingAmountWei)) {
    console.log("\n❌ ERROR: You don't have enough tokens!");
    console.log("   Required:", FUNDING_AMOUNT, "AHP");
    console.log("   You have:", ethers.utils.formatEther(yourBalance), "AHP");
    return;
  }

  // Check current contract balance
  const currentBalance = await tokenContract.balanceOf(
    PROFILE_VERIFICATION_CONTRACT,
  );
  console.log(
    "\n📊 Current contract balance:",
    ethers.utils.formatEther(currentBalance),
    "AHP",
  );

  // Transfer tokens
  console.log("\n🔄 Transferring", FUNDING_AMOUNT, "AHP to contract...");
  const tx = await tokenContract.transfer(
    PROFILE_VERIFICATION_CONTRACT,
    fundingAmountWei,
    {
      gasLimit: 500000,
    },
  );
  console.log("   Transaction hash:", tx.hash);

  console.log("⏳ Waiting for confirmation...");
  const receipt = await tx.wait();
  console.log("✅ Transaction confirmed in block:", receipt.blockNumber);

  // Verify new balance
  const newBalance = await tokenContract.balanceOf(
    PROFILE_VERIFICATION_CONTRACT,
  );
  console.log(
    "\n💰 New contract balance:",
    ethers.utils.formatEther(newBalance),
    "AHP",
  );

  console.log("\n✅ Contract funded successfully!");
  console.log("   Users can now claim their token allocations!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  });
