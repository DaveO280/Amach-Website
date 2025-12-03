/**
 * Check ProfileVerification contract configuration
 */

const { ethers } = require("ethers");

const PROFILE_VERIFICATION_CONTRACT =
  "0xC9950703cE4eD704d2a0B075F7FAC3d968940f57";
const RPC_URL = "https://sepolia.era.zksync.dev";

const ABI = [
  "function verificationEnabled() external view returns (bool)",
  "function healthToken() external view returns (address)",
  "function getAllocationConfig() external view returns (tuple(uint256 maxAllocations, uint256 allocationPerUser, uint256 totalAllocated, bool isActive))",
];

async function main() {
  console.log("🔍 Checking ProfileVerification contract configuration...\n");

  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(
    PROFILE_VERIFICATION_CONTRACT,
    ABI,
    provider,
  );

  const verificationEnabled = await contract.verificationEnabled();
  const healthToken = await contract.healthToken();
  const allocationConfig = await contract.getAllocationConfig();

  console.log("📋 Configuration:");
  console.log("   Verification enabled:", verificationEnabled);
  console.log("   Health token address:", healthToken);
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
  console.log("   Is active:", allocationConfig.isActive);

  if (healthToken === ethers.constants.AddressZero) {
    console.log("\n⚠️  WARNING: Health token address is not set (0x0000...)");
    console.log("   This might cause issues with token claims!");
  }

  console.log("\n✅ Configuration check complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });
