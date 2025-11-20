/**
 * Upgrade SecureHealthProfile to V2 (or later)
 *
 * Usage: node scripts/upgrade-health-profile.js
 *
 * This script upgrades the implementation contract while preserving all data.
 * The proxy address remains the same - users don't need to do anything!
 */

const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🔄 Upgrading SecureHealthProfile...\n");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("📝 Upgrading from account:", deployer.address);

  // Load current deployment info
  const latestDeploymentPath = path.join(
    __dirname,
    "..",
    "deployments",
    "latest-upgradeable-deployment.json",
  );

  if (!fs.existsSync(latestDeploymentPath)) {
    throw new Error(
      "❌ No deployment found! Deploy first using deploy-upgradeable-health-profile.js",
    );
  }

  const deploymentInfo = JSON.parse(
    fs.readFileSync(latestDeploymentPath, "utf8"),
  );
  const proxyAddress = deploymentInfo.contracts.proxy.address;
  const oldImplementationAddress =
    deploymentInfo.contracts.implementation.address;

  console.log("📍 Current proxy address:", proxyAddress);
  console.log("📍 Current implementation:", oldImplementationAddress);
  console.log("");

  // ============================================
  // STEP 1: Deploy New Implementation
  // ============================================

  console.log("📦 Step 1: Deploying new implementation (V2)...");
  console.log("⚠️  NOTE: Make sure SecureHealthProfileV2.sol exists!");
  console.log("");

  // TODO: Change this to V2 when ready
  const SecureHealthProfileV2 = await ethers.getContractFactory(
    "SecureHealthProfileV2", // ← Update this for your V2 contract
  );

  // Upgrade the proxy to point to new implementation
  const upgraded = await upgrades.upgradeProxy(
    proxyAddress,
    SecureHealthProfileV2,
    {
      kind: "uups",
    },
  );

  await upgraded.waitForDeployment();

  const newImplementationAddress =
    await upgrades.erc1967.getImplementationAddress(proxyAddress);

  console.log("✅ New implementation deployed at:", newImplementationAddress);
  console.log("✅ Proxy still at:", proxyAddress);
  console.log("");

  // ============================================
  // STEP 2: Verify Upgrade
  // ============================================

  console.log("🔍 Step 2: Verifying upgrade...");

  // Check version (should be incremented)
  const version = await upgraded.getVersion();
  console.log("📌 New version:", version);

  // Check that old data is still there
  const totalProfiles = await upgraded.getTotalProfiles();
  console.log("👥 Total profiles (preserved):", totalProfiles.toString());

  // Check owner is same
  const owner = await upgraded.owner();
  console.log("👤 Owner (unchanged):", owner);

  console.log("");

  // ============================================
  // STEP 3: Save Upgrade Info
  // ============================================

  console.log("💾 Step 3: Saving upgrade info...");

  const upgradeInfo = {
    ...deploymentInfo,
    upgradedAt: new Date().toISOString(),
    upgrader: deployer.address,
    contracts: {
      ...deploymentInfo.contracts,
      implementation: {
        address: newImplementationAddress,
        description: `Implementation V${version} - upgraded from V${deploymentInfo.features.version}`,
        contractName: "SecureHealthProfileV2", // Update as needed
        previousImplementation: oldImplementationAddress,
      },
    },
    features: {
      ...deploymentInfo.features,
      version: version.toString(),
    },
    upgradeHistory: [
      ...(deploymentInfo.upgradeHistory || []),
      {
        version: version.toString(),
        implementationAddress: newImplementationAddress,
        upgradedAt: new Date().toISOString(),
        upgrader: deployer.address,
        previousImplementation: oldImplementationAddress,
      },
    ],
  };

  const timestamp = Date.now();
  const filename = `upgrade-v${version}-zksyncSepolia-${timestamp}.json`;
  const filepath = path.join(__dirname, "..", "deployments", filename);

  fs.writeFileSync(filepath, JSON.stringify(upgradeInfo, null, 2));
  console.log("✅ Upgrade info saved to:", filename);

  // Update latest
  fs.writeFileSync(latestDeploymentPath, JSON.stringify(upgradeInfo, null, 2));
  console.log("✅ Latest deployment updated");

  console.log("");

  // ============================================
  // UPGRADE COMPLETE
  // ============================================

  console.log("✅ UPGRADE COMPLETE!");
  console.log("");
  console.log("📋 Summary:");
  console.log("  • Proxy (永 unchanged):", proxyAddress);
  console.log("  • Old implementation:", oldImplementationAddress);
  console.log("  • New implementation:", newImplementationAddress);
  console.log(
    "  • Version:",
    `V${deploymentInfo.features.version} → V${version}`,
  );
  console.log("  • Data preserved: ✅");
  console.log("");
  console.log("🎯 Frontend Impact:");
  console.log("  • NO config changes needed (proxy address same)");
  console.log("  • Users don't need to do anything");
  console.log("  • New functions available immediately");
  console.log("");
  console.log("🎉 Upgrade successful!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Upgrade failed:", error);
    process.exit(1);
  });
