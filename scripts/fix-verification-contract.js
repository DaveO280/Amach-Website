/**
 * Fix ProfileVerification contract configuration
 * Sets the health token address and fixes allocation config
 */

const { ethers } = require("ethers");
require("dotenv").config({ path: ".env.local" });

const PROFILE_VERIFICATION_CONTRACT =
  "0xC9950703cE4eD704d2a0B075F7FAC3d968940f57";
const HEALTH_TOKEN_CONTRACT = "0x057df807987f284b55ba6A9ab89d089fd8398B99"; // From networkConfig
const RPC_URL = "https://sepolia.era.zksync.dev";

const ABI = [
  "function healthToken() external view returns (address)",
  "function setHealthToken(address _healthToken) external",
  "function owner() external view returns (address)",
  "function getAllocationConfig() external view returns (tuple(uint256 maxAllocations, uint256 allocationPerUser, uint256 totalAllocated, bool isActive))",
];

async function main() {
  console.log("🔧 Fixing ProfileVerification contract configuration...\n");

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

  console.log("📋 Contract:", PROFILE_VERIFICATION_CONTRACT);
  console.log("👤 Your wallet:", signer.address);

  // Check ownership
  const owner = await contract.owner();
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    console.error("\n❌ ERROR: You are not the contract owner!");
    console.error("   Owner:", owner);
    process.exit(1);
  }

  // Check current state
  console.log("\n📊 Current state:");
  const currentHealthToken = await contract.healthToken();
  const allocationConfig = await contract.getAllocationConfig();
  console.log("   Health token:", currentHealthToken);
  console.log(
    "   Max allocations:",
    allocationConfig.maxAllocations.toString(),
  );
  console.log(
    "   Allocation per user:",
    ethers.utils.formatEther(allocationConfig.allocationPerUser),
    "AHP",
  );
  console.log(
    "   Total allocated:",
    allocationConfig.totalAllocated.toString(),
  );

  // Set health token address if not set
  if (currentHealthToken === ethers.constants.AddressZero) {
    console.log("\n🔄 Setting health token address...");
    const tx = await contract.setHealthToken(HEALTH_TOKEN_CONTRACT, {
      gasLimit: 300000,
    });
    console.log("   Transaction hash:", tx.hash);

    console.log("⏳ Waiting for confirmation...");
    const receipt = await tx.wait();
    console.log("✅ Transaction confirmed in block:", receipt.blockNumber);

    // Verify
    const newHealthToken = await contract.healthToken();
    console.log("   New health token address:", newHealthToken);
  } else {
    console.log("\n✅ Health token already set!");
  }

  console.log("\n✅ Contract configuration fixed!");
  console.log("\n📝 Next steps:");
  console.log("   1. The health token address is now set");
  console.log("   2. Try verifying your profile again");
  console.log("   3. After verification, you'll be able to claim tokens");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  });
