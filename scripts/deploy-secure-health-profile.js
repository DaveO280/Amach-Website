require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Deploying Secure Health Profile Contract...\n");

  // Get the contract factory
  const SecureHealthProfile = await ethers.getContractFactory(
    "SecureHealthProfile",
  );

  // Deploy the contract
  console.log("📝 Deploying contract...");
  const secureHealthProfile = await SecureHealthProfile.deploy();
  await secureHealthProfile.deployed();

  const contractAddress = secureHealthProfile.address;
  console.log("✅ Secure Health Profile deployed to:", contractAddress);

  // Verify deployment
  console.log("\n🔍 Verifying deployment...");
  const totalProfiles = await secureHealthProfile.getTotalProfiles();
  const currentVersion = await secureHealthProfile.currentVersion();

  console.log("📊 Contract verification:");
  console.log(`   - Total Profiles: ${totalProfiles}`);
  console.log(`   - Current Version: ${currentVersion}`);
  console.log(`   - Owner: ${await secureHealthProfile.owner()}`);

  // Add the main app as an authorized protocol
  console.log("\n🔐 Setting up protocol access...");
  const mainAppAddress =
    process.env.MAIN_APP_PROTOCOL_ADDRESS ||
    "0x0000000000000000000000000000000000000000";

  if (mainAppAddress !== "0x0000000000000000000000000000000000000000") {
    await secureHealthProfile.addAuthorizedProtocol(mainAppAddress);
    console.log(`✅ Added main app as authorized protocol: ${mainAppAddress}`);
  } else {
    console.log("⚠️  No main app protocol address configured");
  }

  // Save deployment info
  const deploymentInfo = {
    contractAddress,
    network: "zksync-sepolia",
    timestamp: new Date().toISOString(),
    version: "2.0",
    features: [
      "Secure AES-256-GCM encryption",
      "On-chain encrypted data storage",
      "ZK-proof support",
      "Protocol access control",
      "Privacy-preserving verification",
    ],
    migration: {
      fromLegacy: true,
      legacyContract: process.env.HEALTH_PROFILE_CONTRACT || "0x...",
      migrationRequired: true,
    },
  };

  const fs = require("fs");
  const deploymentPath = "./deployments/secure-health-profile-v2.json";
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));

  console.log("\n📄 Deployment info saved to:", deploymentPath);

  console.log("\n🎉 Secure Health Profile deployment completed!");
  console.log("\n📋 Next Steps:");
  console.log("1. Update .env.local with new contract address:");
  console.log(`   SECURE_HEALTH_PROFILE_CONTRACT=${contractAddress}`);
  console.log("2. Run migration script for existing users");
  console.log("3. Update frontend to use new secure service");
  console.log("4. Test ZK-proof functionality");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
