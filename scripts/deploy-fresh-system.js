require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
  console.log(
    "🚀 Deploying Fresh AmachHealth System with Secure Architecture...\n",
  );

  const [deployer] = await ethers.getSigners();
  console.log("📝 Deploying contracts with account:", deployer.address);
  console.log(
    "💰 Account balance:",
    ethers.utils.formatEther(await deployer.getBalance()),
    "ETH\n",
  );

  // 1. Deploy HealthToken (AHP)
  console.log("🪙 Deploying HealthToken (AHP)...");
  const HealthToken = await ethers.getContractFactory("HealthToken");
  const healthToken = await HealthToken.deploy();
  await healthToken.deployed();
  console.log("✅ HealthToken deployed to:", healthToken.address);

  // 2. Deploy SecureHealthProfile
  console.log("\n🔒 Deploying SecureHealthProfile...");
  const SecureHealthProfile = await ethers.getContractFactory(
    "SecureHealthProfile",
  );
  const secureHealthProfile = await SecureHealthProfile.deploy();
  await secureHealthProfile.deployed();
  console.log(
    "✅ SecureHealthProfile deployed to:",
    secureHealthProfile.address,
  );

  // 3. Deploy ProfileVerification with token integration
  console.log("\n🔐 Deploying ProfileVerification...");
  const ProfileVerification = await ethers.getContractFactory(
    "ProfileVerification",
  );
  const profileVerification = await ProfileVerification.deploy();
  await profileVerification.deployed();
  console.log(
    "✅ ProfileVerification deployed to:",
    profileVerification.address,
  );

  // 4. Configure the system
  console.log("\n⚙️ Configuring system...");

  // Set health token in profile verification contract
  await profileVerification.setHealthToken(healthToken.address);
  console.log("✅ Health token configured in ProfileVerification");

  // Add main app as authorized protocol for secure health profile
  const mainAppAddress =
    process.env.MAIN_APP_PROTOCOL_ADDRESS || deployer.address;
  await secureHealthProfile.addAuthorizedProtocol(mainAppAddress);
  console.log("✅ Main app added as authorized protocol:", mainAppAddress);

  // Transfer tokens to profile verification contract for distribution
  const distributionAmount = ethers.utils.parseEther("10000000"); // 10M tokens for distribution
  await healthToken.transfer(profileVerification.address, distributionAmount);
  console.log(
    "✅ Transferred",
    ethers.utils.formatEther(distributionAmount),
    "AHP tokens for distribution",
  );

  // 5. Skip initial email whitelisting - complete fresh start
  console.log("\n📧 Skipping initial email whitelisting (clean slate)");
  const initialEmails = []; // Empty for fresh start

  // 6. Verify deployments
  console.log("\n🔍 Verifying deployments...");

  const healthTokenBalance = await healthToken.balanceOf(
    profileVerification.address,
  );
  const totalProfiles = await secureHealthProfile.getTotalProfiles();
  const currentVersion = await secureHealthProfile.currentVersion();

  console.log("📊 System Status:");
  console.log(
    `   - HealthToken Balance (Contract): ${ethers.utils.formatEther(healthTokenBalance)} AHP`,
  );
  console.log(`   - Total Profiles: ${totalProfiles}`);
  console.log(`   - Secure Profile Version: ${currentVersion}`);
  console.log(`   - Whitelisted Emails: ${initialEmails.length}`);

  // 7. Save deployment info
  const deploymentInfo = {
    network: "zksync-sepolia",
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      healthToken: {
        address: healthToken.address,
        name: "AmachHealth Protocol",
        symbol: "AHP",
        totalSupply: "500000000",
        distributionAmount: "10000000",
      },
      secureHealthProfile: {
        address: secureHealthProfile.address,
        version: "2.0",
        features: [
          "AES-256-GCM encryption",
          "On-chain encrypted data storage",
          "ZK-proof support",
          "Protocol access control",
        ],
      },
      profileVerification: {
        address: profileVerification.address,
        features: [
          "Email whitelist management",
          "Token allocation",
          "Profile verification",
          "ZKsync SSO integration",
        ],
      },
    },
    configuration: {
      authorizedProtocols: [mainAppAddress],
      initialWhitelistedEmails: initialEmails,
      tokenAllocationAmount: "1000", // 1000 AHP per user
      distributionTokens: ethers.utils.formatEther(distributionAmount),
    },
    environment: {
      rpcUrl: process.env.ZKSYNC_RPC_URL || "https://sepolia.era.zksync.dev",
      chainId: 300,
    },
  };

  const fs = require("fs");
  const deploymentPath = "./deployments/fresh-system-deployment.json";
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));

  console.log("\n📄 Deployment info saved to:", deploymentPath);

  // 8. Generate environment file template
  const envTemplate = `# Fresh AmachHealth System Deployment
# Generated on ${new Date().toISOString()}

# Contract Addresses
HEALTH_TOKEN_CONTRACT=${healthToken.address}
SECURE_HEALTH_PROFILE_CONTRACT=${secureHealthProfile.address}
PROFILE_VERIFICATION_CONTRACT=${profileVerification.address}

# Network Configuration
ZKSYNC_RPC_URL=https://sepolia.era.zksync.dev
ZKSYNC_CHAIN_ID=300

# Protocol Configuration
MAIN_APP_PROTOCOL_ADDRESS=${mainAppAddress}
TOKEN_ALLOCATION_AMOUNT=1000
DISTRIBUTION_AMOUNT=500000

# Security Configuration
ENCRYPTION_VERSION=2.0
ZK_PROOF_ENABLED=true
PROTOCOL_ACCESS_ENABLED=true

# Token Configuration
TOKEN_SYMBOL=AHP
TOKEN_NAME=AmachHealth Protocol
TOTAL_SUPPLY=1000000
`;

  const envPath = "./.env.fresh-deployment";
  fs.writeFileSync(envPath, envTemplate);
  console.log("📄 Environment template saved to:", envPath);

  console.log("\n🎉 Fresh AmachHealth System deployed successfully!");
  console.log("\n📋 Next Steps:");
  console.log("1. Update your .env.local with the new contract addresses");
  console.log("2. Update frontend components to use new secure architecture");
  console.log("3. Test the complete verification flow");
  console.log("4. Test ZK-proof functionality");
  console.log("5. Verify token allocation and claiming works");

  console.log("\n🔗 Contract Addresses:");
  console.log(`   HealthToken (AHP): ${healthToken.address}`);
  console.log(`   SecureHealthProfile: ${secureHealthProfile.address}`);
  console.log(`   ProfileVerification: ${profileVerification.address}`);

  console.log("\n🧪 Test Commands:");
  console.log("   node scripts/test-fresh-system.js");
  console.log("   node scripts/test-encryption.js");
  console.log("   node scripts/test-zk-proofs.js");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
