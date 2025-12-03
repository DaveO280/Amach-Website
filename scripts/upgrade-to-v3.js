/**
 * Upgrade SecureHealthProfile from V2 to V3 (Adds Weight Field)
 * UUPS Upgrade - No new proxy needed, just deploy new implementation
 */

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 Upgrading SecureHealthProfile to V3 (Adding Weight)...\n");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("📝 Deploying from account:", deployer.address);

  // Check balance
  const balance = await deployer.getBalance();
  console.log(
    "💰 Account balance:",
    ethers.utils.formatEther(balance),
    "ETH\n",
  );

  if (balance.eq(0)) {
    throw new Error("❌ Deployer account has no balance!");
  }

  // ============================================
  // CONFIGURATION
  // ============================================

  // Current proxy address (永 stays the same!)
  const PROXY_ADDRESS = "0x2A8015613623A6A8D369BcDC2bd6DD202230785a";

  console.log("📍 Current Proxy Address:", PROXY_ADDRESS);
  console.log("   ↳ This address will NOT change\n");

  // ============================================
  // STEP 1: Deploy V3 Implementation
  // ============================================

  console.log("📦 Step 1: Deploying SecureHealthProfileV3 (Implementation)...");

  const SecureHealthProfileV3 = await ethers.getContractFactory(
    "SecureHealthProfileV3",
  );
  const v3Implementation = await SecureHealthProfileV3.deploy();
  await v3Implementation.deployed();

  console.log("✅ V3 Implementation deployed at:", v3Implementation.address);
  console.log("");

  // ============================================
  // STEP 2: Connect to Proxy and Verify Current Version
  // ============================================

  console.log("🔍 Step 2: Checking current contract version...");

  // Try V2 first, fallback to V1
  let currentContract;
  try {
    const SecureHealthProfileV2 = await ethers.getContractFactory(
      "SecureHealthProfileV2",
    );
    currentContract = SecureHealthProfileV2.attach(PROXY_ADDRESS);
  } catch (e) {
    console.log("   V2 not found, trying V1...");
    const SecureHealthProfileV1 = await ethers.getContractFactory(
      "SecureHealthProfileV1",
    );
    currentContract = SecureHealthProfileV1.attach(PROXY_ADDRESS);
  }

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

  // ============================================
  // STEP 3: Perform UUPS Upgrade
  // ============================================

  console.log("⚡ Step 3: Performing UUPS upgrade...");
  console.log("   Calling upgradeTo() on proxy...");

  // Get UUPSUpgradeable interface
  const upgradeableInterface = new ethers.utils.Interface([
    "function upgradeTo(address newImplementation) external",
  ]);

  // Create transaction data
  const upgradeData = upgradeableInterface.encodeFunctionData("upgradeTo", [
    v3Implementation.address,
  ]);

  // Send transaction with manual gas limit
  const upgradeTx = await deployer.sendTransaction({
    to: PROXY_ADDRESS,
    data: upgradeData,
    gasLimit: 1000000, // Manual gas limit
  });
  console.log("   Transaction sent, waiting for confirmation...");
  await upgradeTx.wait();

  console.log("✅ Upgrade transaction confirmed!");
  console.log("   Tx hash:", upgradeTx.hash);
  console.log("");

  // ============================================
  // STEP 4: Verify Upgrade
  // ============================================

  console.log("🔍 Step 4: Verifying upgrade...");

  // Connect to proxy as V3
  const proxyAsV3 = await SecureHealthProfileV3.attach(PROXY_ADDRESS);

  const newVersion = await proxyAsV3.getContractVersion();
  console.log("📌 New version:", newVersion.toString());

  const profilesAfter = await proxyAsV3.getTotalProfiles();
  console.log("👥 Total profiles after upgrade:", profilesAfter.toString());

  // Verify data preservation
  if (!profilesAfter.eq(totalProfiles)) {
    throw new Error("❌ Profile data NOT preserved during upgrade!");
  }

  console.log("✅ Data preserved - upgrade successful!");
  console.log("");

  // ============================================
  // STEP 5: Test V3 Functions
  // ============================================

  console.log("🧪 Step 5: Testing V3 functions...");

  // Test that new functions exist
  try {
    const testWeight = await proxyAsV3.getWeight(deployer.address);
    console.log("✅ getWeight() function available");
    console.log("   Current weight:", testWeight || "(empty - not set yet)");
  } catch (error) {
    console.error("❌ V3 functions not available:", error.message);
    throw error;
  }

  console.log("");

  // ============================================
  // STEP 6: Save Upgrade Info
  // ============================================

  console.log("💾 Step 6: Saving upgrade info...");

  const upgradeInfo = {
    network: "zksync-sepolia",
    upgradedAt: new Date().toISOString(),
    upgrader: deployer.address,
    upgrade: {
      from: "V2",
      to: "V3",
      proxyAddress: PROXY_ADDRESS,
      note: "Proxy address unchanged -永 permanent",
    },
    implementations: {
      v3: {
        address: v3Implementation.address,
        deployedAt: new Date().toISOString(),
        features: [
          "✨ NEW: encryptedWeight field in profile",
          "✨ NEW: createProfileWithWeight()",
          "✨ NEW: updateProfileWithWeight()",
          "✨ NEW: updateWeight() - gas-efficient weight-only update",
          "✨ NEW: getProfileWithWeight()",
          "✨ NEW: getWeight()",
          "✅ All V2 functions preserved",
          "✅ All existing profile data preserved",
        ],
      },
    },
    verification: {
      dataPreserved: profilesAfter.eq(totalProfiles),
      profilesBefore: totalProfiles.toString(),
      profilesAfter: profilesAfter.toString(),
    },
    frontendChanges: {
      note: "Update all createProfile/updateProfile calls to use V3 functions",
      files: [
        "src/hooks/usePrivyWalletService.ts",
        "src/components/HealthProfileManager.tsx",
        "src/components/WalletSetupWizard.tsx",
      ],
    },
  };

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const timestamp = Date.now();
  const filename = `upgrade-to-v3-${timestamp}.json`;
  const filepath = path.join(deploymentsDir, filename);

  fs.writeFileSync(filepath, JSON.stringify(upgradeInfo, null, 2));
  console.log("✅ Upgrade info saved to:", filename);

  console.log("");

  // ============================================
  // STEP 7: Frontend Integration Instructions
  // ============================================

  console.log("🎯 Step 7: Frontend Integration");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log("✅ NO contract address changes needed!");
  console.log("   Proxy address stays:", PROXY_ADDRESS);
  console.log("");
  console.log("📝 Update frontend code to use V3 functions:");
  console.log("");
  console.log("   OLD: createProfile(birthDate, sex, height, email, ...)");
  console.log(
    "   NEW: createProfileWithWeight(birthDate, sex, height, WEIGHT, email, ...)",
  );
  console.log("");
  console.log("   OLD: updateProfile(birthDate, sex, height, email, ...)");
  console.log(
    "   NEW: updateProfileWithWeight(birthDate, sex, height, WEIGHT, email, ...)",
  );
  console.log("");
  console.log("   NEW: updateWeight(encryptedWeight) // Quick weight update");
  console.log("   NEW: getProfileWithWeight(userAddress)");
  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  // ============================================
  // UPGRADE COMPLETE
  // ============================================

  console.log("✅ UPGRADE TO V3 COMPLETE!");
  console.log("");
  console.log("📋 Summary:");
  console.log("  • Proxy (永 unchanged):", PROXY_ADDRESS);
  console.log("  • V3 Implementation:", v3Implementation.address);
  console.log("  • Version:", newVersion.toString());
  console.log("  • Profiles preserved:", profilesAfter.toString());
  console.log("  • Network: ZKsync Sepolia Testnet");
  console.log("");
  console.log("🔄 Next Steps:");
  console.log(
    "  1. Update frontend to use V3 functions (createProfileWithWeight, etc.)",
  );
  console.log("  2. Test profile creation with weight");
  console.log("  3. Test weight-only updates (updateWeight)");
  console.log("  4. Migrate localStorage weights to on-chain");
  console.log("");
  console.log("🎉 V3 ready - weight field now on-chain!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Upgrade failed:", error);
    process.exit(1);
  });
