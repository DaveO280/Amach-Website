const { ethers } = require("hardhat");

async function main() {
  console.log("🔍 Checking allocation configuration...");

  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log("📝 Using account:", deployer.address);

  // Contract addresses
  const PROFILE_VERIFICATION_ADDRESS =
    "0x2C35eBf2085e5d1224Fb170A1594E314Dea6B759";

  // Get contract instance
  const profileVerification = await ethers.getContractAt(
    "ProfileVerification",
    PROFILE_VERIFICATION_ADDRESS,
  );

  // Check allocation config
  console.log("\n📊 Allocation Configuration:");
  const config = await profileVerification.getAllocationConfig();
  console.log("Max Allocations:", config.maxAllocations.toString());
  console.log(
    "Allocation Per User:",
    ethers.utils.formatEther(config.allocationPerUser),
    "AHP",
  );
  console.log("Total Allocated:", config.totalAllocated.toString());
  console.log("Is Active:", config.isActive);

  // Check health token address
  console.log("\n🪙 Health Token Address:");
  const tokenAddress = await profileVerification.healthToken();
  console.log("Token Address:", tokenAddress);

  // Check token balance of ProfileVerification contract
  if (tokenAddress !== "0x0000000000000000000000000000000000000000") {
    const healthToken = await ethers.getContractAt("IERC20", tokenAddress);
    const balance = await healthToken.balanceOf(PROFILE_VERIFICATION_ADDRESS);
    console.log(
      "Contract Token Balance:",
      ethers.utils.formatEther(balance),
      "AHP",
    );
  }

  // Check total verified users
  const totalUsers = await profileVerification.getTotalVerifiedUsers();
  console.log("\n👥 Total Verified Users:", totalUsers.toString());

  console.log("\n✅ Allocation configuration check completed!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
