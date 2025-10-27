const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 Deploying Amach Health Profile Verification System...");

  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log("📝 Deploying contracts with account:", deployer.address);
  console.log(
    "💰 Account balance:",
    ethers.utils.formatEther(
      await deployer.provider.getBalance(deployer.address),
    ),
    "ETH",
  );

  // Deploy HealthToken (AHP) contract
  console.log("\n📄 Deploying HealthToken (AHP)...");
  const HealthToken = await ethers.getContractFactory("HealthToken");
  const healthToken = await HealthToken.deploy();
  await healthToken.deployed();
  const healthTokenAddress = healthToken.address;
  console.log("✅ HealthToken deployed to:", healthTokenAddress);

  // Deploy MainnetMigration contract
  console.log("\n🔄 Deploying MainnetMigration...");
  const MainnetMigration = await ethers.getContractFactory("MainnetMigration");
  const mainnetMigration = await MainnetMigration.deploy();
  await mainnetMigration.deployed();
  const mainnetMigrationAddress = mainnetMigration.address;
  console.log("✅ MainnetMigration deployed to:", mainnetMigrationAddress);

  // Deploy ProfileVerification contract
  console.log("\n🔐 Deploying ProfileVerification...");
  const ProfileVerification = await ethers.getContractFactory(
    "ProfileVerification",
  );
  const profileVerification = await ProfileVerification.deploy();
  await profileVerification.deployed();
  const profileVerificationAddress = profileVerification.address;
  console.log(
    "✅ ProfileVerification deployed to:",
    profileVerificationAddress,
  );

  // Set up contract relationships
  console.log("\n🔗 Setting up contract relationships...");

  // Set mainnet migration contract in profile verification
  await profileVerification.setMainnetMigrationContract(
    mainnetMigrationAddress,
  );
  console.log("✅ Linked ProfileVerification to MainnetMigration");

  // Add some test emails to whitelist (replace with actual emails for production)
  const testEmails = [
    "admin@amachhealth.com",
    "test@amachhealth.com",
    "user1@example.com",
    "user2@example.com",
    "user3@example.com",
  ];

  console.log("\n📧 Adding test emails to whitelist...");
  for (const email of testEmails) {
    await profileVerification.addEmailToWhitelist(email);
    console.log(`✅ Added ${email} to whitelist`);
  }

  // Verify contract configurations
  console.log("\n🔍 Verifying contract configurations...");

  const allocationConfig = await profileVerification.getAllocationConfig();
  console.log("📊 Allocation Config:");
  console.log(`   Max Allocations: ${allocationConfig.maxAllocations}`);
  console.log(
    `   Allocation Per User: ${ethers.utils.formatEther(allocationConfig.allocationPerUser)} AHP`,
  );
  console.log(`   Total Allocated: ${allocationConfig.totalAllocated}`);
  console.log(`   Is Active: ${allocationConfig.isActive}`);

  const migrationStats = await mainnetMigration.getMigrationStats();
  console.log("🔄 Migration Stats:");
  console.log(`   Total Allocations: ${migrationStats.totalAllocations}`);
  console.log(`   Total Migrated: ${migrationStats.totalMigrated}`);
  console.log(`   Remaining Migrations: ${migrationStats.remainingMigrations}`);
  console.log(
    `   Migration Deadline: ${new Date(Number(migrationStats.migrationDeadline) * 1000).toISOString()}`,
  );

  // Save deployment information
  const deploymentInfo = {
    network: await deployer.provider.getNetwork(),
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      HealthToken: {
        address: healthTokenAddress,
        name: "Amach Health Protocol",
        symbol: "AHP",
      },
      MainnetMigration: {
        address: mainnetMigrationAddress,
      },
      ProfileVerification: {
        address: profileVerificationAddress,
      },
    },
    configuration: {
      maxAllocations: Number(allocationConfig.maxAllocations),
      allocationPerUser: ethers.utils.formatEther(
        allocationConfig.allocationPerUser,
      ),
      whitelistedEmails: testEmails,
    },
    verification: {
      emailWhitelistCount: testEmails.length,
      verificationEnabled: await profileVerification.verificationEnabled(),
      totalVerifiedUsers: Number(
        await profileVerification.getTotalVerifiedUsers(),
      ),
    },
  };

  // Create deployments directory if it doesn't exist
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  // Save deployment info
  const deploymentFile = path.join(
    deploymentsDir,
    `verification-system-${Date.now()}.json`,
  );
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\n💾 Deployment info saved to: ${deploymentFile}`);

  // Create environment variables file
  const envContent = `
# Amach Health Profile Verification System
# Generated on ${new Date().toISOString()}

# Contract Addresses
HEALTH_TOKEN_CONTRACT=${healthTokenAddress}
MAINNET_MIGRATION_CONTRACT=${mainnetMigrationAddress}
PROFILE_VERIFICATION_CONTRACT=${profileVerificationAddress}

# Network Configuration
ZKSYNC_RPC_URL=${process.env.ZKSYNC_RPC_URL || "https://sepolia.era.zksync.dev"}
ZKSYNC_CHAIN_ID=${process.env.ZKSYNC_CHAIN_ID || "300"}

# Admin Configuration (replace with your actual private key)
ADMIN_PRIVATE_KEY=${process.env.ADMIN_PRIVATE_KEY || "YOUR_PRIVATE_KEY_HERE"}

# Token Configuration
TOKEN_SYMBOL=AHP
TOKEN_NAME=Amach Health Protocol
MAX_ALLOCATIONS=${allocationConfig.maxAllocations}
ALLOCATION_PER_USER=${ethers.utils.formatEther(allocationConfig.allocationPerUser)}
`;

  const envFile = path.join(__dirname, "..", ".env.verification");
  fs.writeFileSync(envFile, envContent);
  console.log(`🔧 Environment file created: ${envFile}`);

  console.log("\n🎉 Deployment completed successfully!");
  console.log("\n📋 Next Steps:");
  console.log("1. Update your .env file with the contract addresses");
  console.log("2. Add actual whitelisted email addresses");
  console.log("3. Test the verification flow");
  console.log("4. Prepare for mainnet migration when ready");

  console.log("\n🔗 Contract Addresses:");
  console.log(`   HealthToken (AHP): ${healthTokenAddress}`);
  console.log(`   MainnetMigration: ${mainnetMigrationAddress}`);
  console.log(`   ProfileVerification: ${profileVerificationAddress}`);

  return deploymentInfo;
}

// Execute deployment
main()
  .then((deploymentInfo) => {
    console.log("\n✅ Verification system deployed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Deployment failed:", error);
    process.exit(1);
  });
