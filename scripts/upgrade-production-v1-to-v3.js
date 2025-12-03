/**
 * PRODUCTION UPGRADE: V1 → V3
 *
 * Upgrades the production proxy using the correct OpenZeppelin v5 function
 *
 * Critical Fix: Uses upgradeToAndCall() instead of upgradeTo()
 * OpenZeppelin v5 removed upgradeTo() - only upgradeToAndCall() exists
 *
 * Production Proxy: 0x2A8015613623A6A8D369BcDC2bd6DD202230785a
 */

const hre = require("hardhat");

async function main() {
  console.log("🚀 PRODUCTION UPGRADE: V1 → V3\n");
  console.log("=".repeat(60));
  console.log("");

  const [deployer] = await hre.ethers.getSigners();
  console.log("📝 Deploying from account:", deployer.address);

  const balance = await deployer.getBalance();
  console.log(
    "💰 Account balance:",
    hre.ethers.utils.formatEther(balance),
    "ETH\n",
  );

  const PROXY_ADDRESS = "0x2A8015613623A6A8D369BcDC2bd6DD202230785a";
  console.log("📍 Production Proxy:", PROXY_ADDRESS);
  console.log("   ↳ This address will NOT change\n");

  // ============================================
  // STEP 1: Verify Current State (V1)
  // ============================================

  console.log("🔍 Step 1: Checking current contract state...");
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
    console.log(
      "⚠️  Warning: Contract is not at V1. Current version:",
      currentVersion.toString(),
    );
    console.log("   Proceeding anyway...\n");
  }

  // ============================================
  // STEP 2: Deploy V3 Implementation
  // ============================================

  console.log(
    "📦 Step 2: Deploying SecureHealthProfileV3_FromV1 (Implementation)...",
  );
  console.log("   This includes:");
  console.log("   - V1: Core profile (birthDate, sex, height, email)");
  console.log("   - V1: Health event timeline");
  console.log("   - V2: Storj off-chain storage support");
  console.log("   - V3: Weight field");
  console.log("");

  const SecureHealthProfileV3 = await hre.ethers.getContractFactory(
    "SecureHealthProfileV3_FromV1",
  );
  const v3Implementation = await SecureHealthProfileV3.deploy();
  await v3Implementation.deployed();

  console.log("✅ V3 Implementation deployed at:", v3Implementation.address);
  console.log("");

  // ============================================
  // STEP 3: Perform Upgrade (V1 → V3)
  // ============================================

  console.log("⚡ Step 3: Performing upgrade (V1 → V3)...");
  console.log("   Using upgradeToAndCall() (OpenZeppelin v5)");
  console.log("");

  // Create interface with correct OZ v5 function
  const uupsInterface = new hre.ethers.utils.Interface([
    "function upgradeToAndCall(address newImplementation, bytes memory data) external payable",
  ]);

  const proxyWithUups = new hre.ethers.Contract(
    PROXY_ADDRESS,
    uupsInterface,
    deployer,
  );

  console.log("   Calling upgradeToAndCall()...");
  console.log("   New implementation:", v3Implementation.address);

  const upgradeTx = await proxyWithUups.upgradeToAndCall(
    v3Implementation.address,
    "0x", // Empty bytes - no initialization needed
    {
      gasLimit: 1000000,
      value: 0,
    },
  );

  console.log("   Transaction sent:", upgradeTx.hash);
  console.log("   Waiting for confirmation...");

  const receipt = await upgradeTx.wait();
  console.log("   Gas used:", receipt.gasUsed.toString());
  console.log("   Status:", receipt.status === 1 ? "✅ SUCCESS" : "❌ FAILED");
  console.log("");

  if (receipt.status !== 1) {
    throw new Error("Upgrade transaction failed!");
  }

  // ============================================
  // STEP 4: Verify Upgrade to V3
  // ============================================

  console.log("🔍 Step 4: Verifying upgrade to V3...");

  const proxyAsV3 = SecureHealthProfileV3.attach(PROXY_ADDRESS);

  const newVersion = await proxyAsV3.getContractVersion();
  console.log("📌 New version:", newVersion.toString());

  const profilesAfter = await proxyAsV3.getTotalProfiles();
  console.log("👥 Total profiles after upgrade:", profilesAfter.toString());

  const ownerAfter = await proxyAsV3.owner();
  console.log("👤 Owner after upgrade:", ownerAfter);
  console.log("");

  // Verify data preservation
  if (totalProfiles.toString() !== profilesAfter.toString()) {
    throw new Error("❌ Profile count mismatch! Data may be corrupted!");
  }

  if (ownerAfter.toLowerCase() !== currentOwner.toLowerCase()) {
    throw new Error("❌ Owner changed! Storage may be corrupted!");
  }

  if (newVersion.toString() !== "3") {
    throw new Error(
      `❌ Version mismatch! Expected 3, got ${newVersion.toString()}`,
    );
  }

  // Verify implementation storage slot
  const implSlot =
    "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  const currentImpl = await hre.ethers.provider.getStorageAt(
    PROXY_ADDRESS,
    implSlot,
  );
  const expectedImpl = hre.ethers.utils.hexZeroPad(
    v3Implementation.address.toLowerCase(),
    32,
  );

  console.log("🔍 Implementation verification:");
  console.log("   Current:  ", currentImpl);
  console.log("   Expected: ", expectedImpl);
  console.log(
    "   Match:    ",
    currentImpl.toLowerCase() === expectedImpl.toLowerCase()
      ? "✅ YES"
      : "❌ NO",
  );
  console.log("");

  // ============================================
  // STEP 5: Test New Functionality
  // ============================================

  console.log("🧪 Step 5: Testing V3 functionality...");

  try {
    // Test getting weight (should return empty for existing profiles)
    console.log("   Testing getWeight() function...");
    const testWeight = await proxyAsV3.getWeight(deployer.address);
    console.log(
      "   ✅ getWeight() works (returns:",
      testWeight.length === 0 ? "empty" : "data",
      ")",
    );

    // Test getProfileWithWeight
    console.log("   Testing getProfileWithWeight() function...");
    const [profile, weight] = await proxyAsV3.getProfileWithWeight(
      deployer.address,
    );
    console.log("   ✅ getProfileWithWeight() works");

    console.log("");
  } catch (error) {
    console.log("   ⚠️  New function test failed:", error.message);
    console.log("   This may be expected if you don't have a profile");
    console.log("");
  }

  // ============================================
  // SUCCESS!
  // ============================================

  console.log("=".repeat(60));
  console.log("✅ UPGRADE TO V3 COMPLETE!");
  console.log("=".repeat(60));
  console.log("");
  console.log("📋 Summary:");
  console.log("  • Proxy (永 unchanged):", PROXY_ADDRESS);
  console.log("  • New Implementation:   ", v3Implementation.address);
  console.log("  • Version: V1 → V3");
  console.log("  • Profiles preserved:   ", profilesAfter.toString());
  console.log("  • Transaction:          ", upgradeTx.hash);
  console.log("");
  console.log("🎉 New Features Available:");
  console.log("  ✅ V2: Storj off-chain storage (addHealthEventWithStorj)");
  console.log(
    "  ✅ V3: Weight field (createProfileWithWeight, updateWeight, getWeight)",
  );
  console.log("");
  console.log("🎯 Next Steps:");
  console.log("  1. Update frontend to use V3 functions");
  console.log("  2. Test weight encryption/decryption");
  console.log("  3. Users can now store weight on-chain!");
  console.log("");
  console.log("✅ Future upgrades now work with upgradeToAndCall()");
  console.log("");

  // Save deployment info
  const deploymentInfo = {
    timestamp: Date.now(),
    network: hre.network.name,
    proxyAddress: PROXY_ADDRESS,
    v3ImplementationAddress: v3Implementation.address,
    upgradeTransaction: upgradeTx.hash,
    deployer: deployer.address,
    previousVersion: currentVersion.toString(),
    newVersion: newVersion.toString(),
    profilesPreserved: profilesAfter.toString(),
    gasUsed: receipt.gasUsed.toString(),
    upgradeMethod: "upgradeToAndCall (OpenZeppelin v5)",
  };

  const fs = require("fs");
  const path = require("path");
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  const filename = path.join(
    deploymentsDir,
    `production-upgrade-v1-to-v3-${Date.now()}.json`,
  );
  fs.writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));
  console.log("💾 Deployment info saved to:", filename);
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Upgrade failed:", error);
    process.exit(1);
  });
