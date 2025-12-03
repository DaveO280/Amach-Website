/**
 * Upgrade SecureHealthProfile from V1 to V2
 * V2 adds Storj off-chain storage support for health events
 */

const hre = require("hardhat");

async function main() {
  console.log("🚀 Upgrading SecureHealthProfile V1 → V2...\n");

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
  // STEP 1: Deploy V2 Implementation
  // ============================================

  console.log("📦 Step 1: Deploying SecureHealthProfileV2 (Implementation)...");
  const SecureHealthProfileV2 = await hre.ethers.getContractFactory(
    "SecureHealthProfileV2",
  );
  const v2Implementation = await SecureHealthProfileV2.deploy();
  await v2Implementation.deployed();
  console.log("✅ V2 Implementation deployed at:", v2Implementation.address);
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
  console.log("�� Current version:", currentVersion.toString());

  const totalProfiles = await currentContract.getTotalProfiles();
  console.log("👥 Total profiles before upgrade:", totalProfiles.toString());
  console.log("");

  // Verify deployer is owner
  if (currentOwner.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error(
      `❌ Only owner can upgrade! Owner: ${currentOwner}, Deployer: ${deployer.address}`,
    );
  }

  // ============================================
  // STEP 3: Perform UUPS Upgrade (V1 → V2)
  // ============================================

  console.log("⚡ Step 3: Performing UUPS upgrade (V1 → V2)...");
  console.log("   Calling upgradeTo() on proxy...");

  const upgradeableInterface = new hre.ethers.utils.Interface([
    "function upgradeTo(address newImplementation) external",
  ]);

  const upgradeData = upgradeableInterface.encodeFunctionData("upgradeTo", [
    v2Implementation.address,
  ]);

  const upgradeTx = await deployer.sendTransaction({
    to: PROXY_ADDRESS,
    data: upgradeData,
    gasLimit: 1000000,
  });
  console.log("   Transaction sent, waiting for confirmation...");
  await upgradeTx.wait();

  console.log("✅ Upgrade transaction confirmed!");
  console.log("   Tx hash:", upgradeTx.hash);
  console.log("");

  // ============================================
  // STEP 4: Verify Upgrade to V2
  // ============================================

  console.log("🔍 Step 4: Verifying upgrade to V2...");

  const proxyAsV2 = await SecureHealthProfileV2.attach(PROXY_ADDRESS);

  const newVersion = await proxyAsV2.getVersion();
  console.log("📌 New version:", newVersion.toString());

  const profilesAfter = await proxyAsV2.getTotalProfiles();
  console.log("👥 Total profiles after upgrade:", profilesAfter.toString());

  // Verify data preservation
  if (totalProfiles.toString() !== profilesAfter.toString()) {
    throw new Error("❌ Profile count mismatch! Data may be corrupted!");
  }

  console.log("");
  console.log("=".repeat(60));
  console.log("✅ UPGRADE TO V2 COMPLETE!");
  console.log("=".repeat(60));
  console.log("");
  console.log("📋 Summary:");
  console.log("  • Proxy (永 unchanged):", PROXY_ADDRESS);
  console.log("  • V2 Implementation:", v2Implementation.address);
  console.log("  • Version: V1 → V2");
  console.log("  • Profiles preserved:", profilesAfter.toString());
  console.log("");
  console.log("🎯 Next step: Run upgrade-v2-to-v3.js");
  console.log("");

  // Save deployment info
  const deploymentInfo = {
    timestamp: Date.now(),
    network: hre.network.name,
    proxyAddress: PROXY_ADDRESS,
    v2ImplementationAddress: v2Implementation.address,
    upgradeTransaction: upgradeTx.hash,
    deployer: deployer.address,
    previousVersion: currentVersion.toString(),
    newVersion: newVersion.toString(),
    profilesPreserved: profilesAfter.toString(),
  };

  const fs = require("fs");
  const path = require("path");
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  const filename = path.join(
    deploymentsDir,
    `upgrade-v1-to-v2-${Date.now()}.json`,
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
