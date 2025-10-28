const hre = require("hardhat");

async function main() {
  console.log("🚀 Deploying Hashed Email Verification System...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("📝 Deploying with account:", deployer.address);

  // Get balance
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(
    "💰 Account balance:",
    hre.ethers.utils.formatEther(balance),
    "ETH\n",
  );

  // 1. Deploy HealthToken
  console.log("1️⃣ Deploying HealthToken...");
  const HealthToken = await hre.ethers.getContractFactory("HealthToken");
  const healthToken = await HealthToken.deploy();
  await healthToken.deployed();
  const healthTokenAddress = healthToken.address;
  console.log("✅ HealthToken deployed to:", healthTokenAddress);

  // 2. Deploy ProfileVerification (with hashed emails)
  console.log("\n2️⃣ Deploying ProfileVerification (Hashed Emails)...");
  const ProfileVerification = await hre.ethers.getContractFactory(
    "ProfileVerification",
  );
  const profileVerification = await ProfileVerification.deploy();
  await profileVerification.deployed();
  const profileVerificationAddress = profileVerification.address;
  console.log(
    "✅ ProfileVerification deployed to:",
    profileVerificationAddress,
  );

  // 3. Deploy SecureHealthProfile
  console.log("\n3️⃣ Deploying SecureHealthProfile...");
  const SecureHealthProfile = await hre.ethers.getContractFactory(
    "SecureHealthProfile",
  );
  const secureHealthProfile = await SecureHealthProfile.deploy();
  await secureHealthProfile.deployed();
  const secureHealthProfileAddress = secureHealthProfile.address;
  console.log(
    "✅ SecureHealthProfile deployed to:",
    secureHealthProfileAddress,
  );

  // 4. Configure contracts
  console.log("\n4️⃣ Configuring contracts...");

  // Set health token in ProfileVerification
  await profileVerification.setHealthToken(healthTokenAddress);
  console.log("✅ Health token set in ProfileVerification");

  // Grant protocol access to ProfileVerification
  await secureHealthProfile.addAuthorizedProtocol(profileVerificationAddress);
  console.log("✅ Protocol access granted to ProfileVerification");

  // Transfer tokens to ProfileVerification for allocations (5,000 users * 1000 tokens)
  const allocationAmount = hre.ethers.utils.parseEther("5000000"); // 5M tokens
  await healthToken.transfer(profileVerificationAddress, allocationAmount);
  console.log("✅ Tokens transferred for allocations");

  // 5. Save deployment info
  const deployment = {
    network: hre.network.name,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      healthToken: healthTokenAddress,
      profileVerification: profileVerificationAddress,
      secureHealthProfile: secureHealthProfileAddress,
    },
    features: {
      hashedEmails: true,
      emailPrivacy: "Hash-based whitelist (keccak256)",
      allocationConfig: {
        maxAllocations: 5000,
        allocationPerUser: "1000 AHP",
        totalAllocated: "5,000,000 AHP",
      },
    },
  };

  const fs = require("fs");
  const deploymentPath = `./deployments/hashed-verification-${hre.network.name}-${Date.now()}.json`;
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
  console.log(`\n📄 Deployment info saved to: ${deploymentPath}`);

  // 6. Print summary
  console.log("\n" + "=".repeat(60));
  console.log("🎉 DEPLOYMENT COMPLETE!");
  console.log("=".repeat(60));
  console.log("\n📋 CONTRACT ADDRESSES:");
  console.log("   HealthToken:           ", healthTokenAddress);
  console.log("   ProfileVerification:   ", profileVerificationAddress);
  console.log("   SecureHealthProfile:   ", secureHealthProfileAddress);
  console.log("\n🔐 PRIVACY FEATURES:");
  console.log("   ✅ Hashed email whitelist (keccak256)");
  console.log("   ✅ On-chain privacy for email addresses");
  console.log("   ✅ Admin can see emails, blockchain stores only hashes");
  console.log("\n📝 NEXT STEPS:");
  console.log("   1. Update src/lib/zksync-sso-config.ts with new addresses");
  console.log("   2. Update admin-app to use new contract");
  console.log("   3. Add initial emails to whitelist");
  console.log("   4. Test email verification flow");
  console.log("=".repeat(60) + "\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
