/**
 * Redeploy ProfileVerification Contract using Hardhat
 *
 * This script redeploys a fresh ProfileVerification contract with no existing registrations.
 * After deployment, you'll need to update the contract address in:
 * - src/lib/networkConfig.ts
 * - All API routes will automatically pick up the new address from there
 */

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n🚀 ProfileVerification Contract Redeployment");
  console.log("============================================\n");

  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log("📝 Deploying contracts with account:", deployer.address);

  const balance = await deployer.provider.getBalance(deployer.address);
  console.log(
    "💰 Account balance:",
    ethers.utils.formatEther(balance),
    "ETH\n",
  );

  if (balance.lt(ethers.utils.parseEther("0.01"))) {
    console.error(
      "❌ Insufficient balance for deployment (need at least 0.01 ETH)",
    );
    process.exit(1);
  }

  // Deploy ProfileVerification contract
  console.log("📤 Deploying ProfileVerification contract...");
  const ProfileVerification = await ethers.getContractFactory(
    "ProfileVerification",
  );
  const profileVerification = await ProfileVerification.deploy();
  await profileVerification.deployed();

  console.log("✅ ProfileVerification deployed successfully!");
  console.log(`📍 Contract address: ${profileVerification.address}\n`);

  // Verify deployment
  console.log("🔍 Verifying deployment...");
  const owner = await profileVerification.owner();
  const allocationConfig = await profileVerification.getAllocationConfig();
  const totalVerifiedUsers = await profileVerification.getTotalVerifiedUsers();

  console.log(`   Owner: ${owner}`);
  console.log(
    `   Max Allocations: ${allocationConfig.maxAllocations.toString()}`,
  );
  console.log(
    `   Allocation Per User: ${ethers.utils.formatEther(allocationConfig.allocationPerUser)} AHP`,
  );
  console.log(
    `   Total Allocated: ${allocationConfig.totalAllocated.toString()}`,
  );
  console.log(`   Total Verified Users: ${totalVerifiedUsers.toString()}`);
  console.log(`   Is Active: ${allocationConfig.isActive}\n`);

  // Get transaction hash
  const deployTx = profileVerification.deployTransaction;
  const receipt = await deployer.provider.getTransactionReceipt(deployTx.hash);

  // Save deployment info
  const deploymentInfo = {
    network: (await deployer.provider.getNetwork()).name,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    transactionHash: deployTx.hash,
    blockNumber: receipt.blockNumber,
    contracts: {
      profileVerification: {
        address: profileVerification.address,
        features: [
          "Email whitelist management",
          "Token allocation (1000 AHP per user)",
          "Profile verification",
          "ZKsync SSO integration",
        ],
      },
    },
    configuration: {
      maxAllocations: 5000,
      allocationPerUser: "1000 AHP",
      totalAllocated: 0,
      totalVerifiedUsers: 0,
    },
  };

  const timestamp = Date.now();
  const deploymentPath = path.join(
    __dirname,
    `../deployments/profile-verification-${timestamp}.json`,
  );
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(
    `💾 Deployment info saved to: deployments/profile-verification-${timestamp}.json\n`,
  );

  // Instructions for updating the codebase
  console.log("📝 NEXT STEPS:");
  console.log("=============");
  console.log("\n1. Update the contract address in src/lib/networkConfig.ts:");
  console.log(
    `   OLD: PROFILE_VERIFICATION_CONTRACT: "0xA2D3b1b8080895C5bE335d8352D867e4b6e51ab3"`,
  );
  console.log(
    `   NEW: PROFILE_VERIFICATION_CONTRACT: "${profileVerification.address}"`,
  );
  console.log("\n2. Restart your development server");
  console.log(
    "\n3. (Optional) Set the health token contract address if needed:",
  );
  console.log(
    `   npx hardhat run scripts/set-health-token.js --network zksyncSepolia ${profileVerification.address} <HEALTH_TOKEN_ADDRESS>`,
  );
  console.log("\n4. Your email will now be available for registration!\n");

  console.log("🔗 View on zkSync Explorer:");
  console.log(
    `   https://sepolia.explorer.zksync.io/address/${profileVerification.address}\n`,
  );

  // Show quick update command
  console.log("💡 Quick update command:");
  console.log(
    `   node scripts/update-contract-address.js ${profileVerification.address}`,
  );
  console.log("   (This will automatically update networkConfig.ts)\n");

  return {
    address: profileVerification.address,
    transactionHash: deployTx.hash,
  };
}

// Execute deployment
main()
  .then((result) => {
    console.log("\n✅ Redeployment completed successfully!");
    console.log(`📍 New contract address: ${result.address}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Deployment failed:", error);
    process.exit(1);
  });
