/**
 * Upgrade SecureHealthProfile from V1 directly to V3
 * This skips V2 and combines all features in one upgrade
 */

const hre = require("hardhat");

async function main() {
  console.log("🚀 Upgrading SecureHealthProfile V1 → V3 (Direct)...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("📝 Deploying from account:", deployer.address);

  const balance = await deployer.getBalance();
  console.log(
    "💰 Account balance:",
    hre.ethers.utils.formatEther(balance),
    "ETH\n",
  );

  const PROXY_ADDRESS = "0x2A8015613623A6A8D369BcDC2bd6DD202230785a";
  console.log("📍 Proxy Address:", PROXY_ADDRESS);
  console.log("   ↳ This address will NOT change\n");

  // ============================================
  // STEP 1: Deploy V3_FromV1 Implementation
  // ============================================

  console.log(
    "📦 Step 1: Deploying SecureHealthProfileV3_FromV1 (Implementation)...",
  );
  const SecureHealthProfileV3 = await hre.ethers.getContractFactory(
    "SecureHealthProfileV3_FromV1",
  );
  const v3Implementation = await SecureHealthProfileV3.deploy();
  await v3Implementation.deployed();
  console.log("✅ V3 Implementation deployed at:", v3Implementation.address);
  console.log("");

  // ============================================
  // STEP 2: Verify Current State (V1)
  // ============================================

  console.log("🔍 Step 2: Checking current contract (V1)...");
  const SecureHealthProfileV1 = await hre.ethers.getContractFactory(
    "SecureHealthProfileV1",
  );
  const currentContract = SecureHealthProfileV1.attach(PROXY_ADDRESS);

  const currentOwner = await currentContract.owner();
  console.log("👤 Current owner:", currentOwner);

  const currentVersion = await currentContract.getVersion();
  console.log("📌 Current version:", currentVersion.toString());

  const totalProfiles = await currentContract.getTotalProfiles();
  console.log("👥 Total profiles before upgrade:", totalProfiles.toString());
  console.log("");

  // Verify deployer is owner
  if (currentOwner.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error(
      `❌ Only owner can upgrade! Owner: ${currentOwner}, Deployer: ${deployer.address}`,
    );
  }

  // Verify we're at V1
  if (currentVersion.toString() !== "1") {
    console.warn(
      `⚠️  Warning: Expected V1, found V${currentVersion}. Proceeding anyway...`,
    );
  }

  // ============================================
  // STEP 3: Perform UUPS Upgrade (V1 → V3)
  // ============================================

  console.log("⚡ Step 3: Performing UUPS upgrade (V1 → V3)...");
  console.log("   Calling upgradeTo() on proxy...");

  const upgradeableInterface = new hre.ethers.utils.Interface([
    "function upgradeTo(address newImplementation) external",
  ]);

  const upgradeData = upgradeableInterface.encodeFunctionData("upgradeTo", [
    v3Implementation.address,
  ]);

  const upgradeTx = await deployer.sendTransaction({
    to: PROXY_ADDRESS,
    data: upgradeData,
    gasLimit: 1000000,
  });
  console.log("   Transaction sent, waiting for confirmation...");
  const receipt = await upgradeTx.wait();

  console.log("✅ Upgrade transaction confirmed!");
  console.log("   Tx hash:", upgradeTx.hash);
  console.log("   Gas used:", receipt.gasUsed.toString());
  console.log("");

  // ============================================
  // STEP 4: Verify Upgrade to V3
  // ============================================

  console.log("🔍 Step 4: Verifying upgrade to V3...");

  const proxyAsV3 = await SecureHealthProfileV3.attach(PROXY_ADDRESS);

  const newVersion = await proxyAsV3.getContractVersion();
  console.log("📌 New version:", newVersion.toString());

  const profilesAfter = await proxyAsV3.getTotalProfiles();
  console.log("👥 Total profiles after upgrade:", profilesAfter.toString());

  // Verify data preservation
  if (totalProfiles.toString() !== profilesAfter.toString()) {
    throw new Error("❌ Profile count mismatch! Data may be corrupted!");
  }

  console.log("");
  console.log("=".repeat(60));
  console.log("✅ UPGRADE TO V3 COMPLETE!");
  console.log("=".repeat(60));
  console.log("");
  console.log("📋 Summary:");
  console.log("  • Proxy (永 unchanged):", PROXY_ADDRESS);
  console.log("  • V3 Implementation:", v3Implementation.address);
  console.log("  • Version: V1 → V3 (skipped V2)");
  console.log("  • Profiles preserved:", profilesAfter.toString());
  console.log("");
  console.log("🎯 New Features Available:");
  console.log("  ✅ V2: Storj off-chain storage for health events");
  console.log("  ✅ V3: Weight field in profile");
  console.log("  ✅ V3: Weight-only update (gas efficient)");
  console.log("");
  console.log("📝 Next steps:");
  console.log("  1. Update frontend ABI in contractConfig.ts");
  console.log("  2. Test createProfileWithWeight() function");
  console.log("  3. Test getProfileWithWeight() function");
  console.log("  4. Verify weight encryption/decryption works");
  console.log("  5. Migrate localStorage weights to on-chain");
  console.log("");

  // Save deployment info
  const deploymentInfo = {
    timestamp: Date.now(),
    network: hre.network.name,
    proxyAddress: PROXY_ADDRESS,
    v3ImplementationAddress: v3Implementation.address,
    upgradeTransaction: upgradeTx.hash,
    gasUsed: receipt.gasUsed.toString(),
    deployer: deployer.address,
    previousVersion: currentVersion.toString(),
    newVersion: newVersion.toString(),
    profilesPreserved: profilesAfter.toString(),
    upgradeType: "V1 → V3 (Direct, skipped V2)",
    features: {
      v2: ["Storj off-chain storage", "Content hash verification"],
      v3: ["Weight field", "Weight-only updates", "getProfileWithWeight()"],
    },
  };

  const fs = require("fs");
  const path = require("path");
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  const filename = path.join(
    deploymentsDir,
    `upgrade-v1-to-v3-direct-${Date.now()}.json`,
  );
  fs.writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));
  console.log("💾 Deployment info saved to:", filename);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
