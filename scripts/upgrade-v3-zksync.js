/**
 * Upgrade existing proxy to V3_FromV1 using zkSync-Native deployment
 *
 * This upgrades the EXISTING proxy at 0x2A8015613623A6A8D369BcDC2bd6DD202230785a
 * to use the new V3_FromV1 implementation
 */

const { Deployer } = require("@matterlabs/hardhat-zksync-deploy");
const { Wallet, Provider } = require("zksync-web3");
const hre = require("hardhat");

async function main() {
  console.log("🚀 Upgrading to V3_FromV1 with zkSync-Native UUPS...\n");
  console.log("=".repeat(60));
  console.log("");

  // Initialize zkSync wallet and provider
  const provider = new Provider("https://sepolia.era.zksync.dev");
  const wallet = new Wallet(process.env.PRIVATE_KEY, provider);
  console.log("📝 Deploying from account:", wallet.address);

  const deployer = new Deployer(hre, wallet);

  const balance = await wallet.getBalance();
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
  console.log("   Using zkSync native deployment...");

  const artifact = await deployer.loadArtifact("SecureHealthProfileV3_FromV1");
  const v3Implementation = await deployer.deploy(artifact);
  await v3Implementation.deployed();

  console.log("✅ V3 Implementation deployed at:", v3Implementation.address);
  console.log("");

  // ============================================
  // STEP 2: Check Current State
  // ============================================

  console.log("🔍 Step 2: Checking current contract state...");

  // Connect to proxy as current contract
  const v1Artifact = await deployer.loadArtifact("SecureHealthProfileV1");
  const currentContract = new hre.ethers.Contract(
    PROXY_ADDRESS,
    v1Artifact.abi,
    wallet,
  );

  const currentOwner = await currentContract.owner();
  console.log("👤 Current owner:", currentOwner);

  const currentVersion = await currentContract.getVersion();
  console.log("📌 Current version:", currentVersion.toString());

  const totalProfiles = await currentContract.getTotalProfiles();
  console.log("👥 Total profiles before upgrade:", totalProfiles.toString());
  console.log("");

  // Verify deployer is owner
  if (currentOwner.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error(
      `❌ Only owner can upgrade! Owner: ${currentOwner}, Deployer: ${wallet.address}`,
    );
  }

  // ============================================
  // STEP 3: Perform UUPS Upgrade
  // ============================================

  console.log("⚡ Step 3: Performing UUPS upgrade...");
  console.log("   Calling upgradeTo() on proxy...");

  const upgradeTx = await currentContract.upgradeTo(v3Implementation.address, {
    gasLimit: 1000000,
  });
  console.log("   Transaction sent:", upgradeTx.hash);
  console.log("   Waiting for confirmation...");

  const receipt = await upgradeTx.wait();
  console.log("✅ Upgrade transaction confirmed!");
  console.log("   Gas used:", receipt.gasUsed.toString());
  console.log("");

  // ============================================
  // STEP 4: Verify Upgrade to V3
  // ============================================

  console.log("🔍 Step 4: Verifying upgrade to V3...");

  const v3Artifact = await deployer.loadArtifact(
    "SecureHealthProfileV3_FromV1",
  );
  const proxyAsV3 = new hre.ethers.Contract(
    PROXY_ADDRESS,
    v3Artifact.abi,
    wallet,
  );

  const newVersion = await proxyAsV3.getContractVersion();
  console.log("📌 New contract version:", newVersion.toString());

  const profilesAfter = await proxyAsV3.getTotalProfiles();
  console.log("👥 Total profiles after upgrade:", profilesAfter.toString());

  // Verify data preservation
  if (totalProfiles.toString() !== profilesAfter.toString()) {
    throw new Error("❌ Profile count mismatch! Data may be corrupted!");
  }

  // Test V3 functions exist
  console.log("\n🧪 Testing V3 functions...");
  try {
    // Test getProfileWithWeight - should exist even if no weight set
    const testAddress = wallet.address;
    const [profile, weight] = await proxyAsV3.getProfileWithWeight(testAddress);
    console.log("✅ getProfileWithWeight() works");
    console.log("   Weight value:", weight || "(empty)");
  } catch (error) {
    console.log(
      "⚠️  getProfileWithWeight() test (expected if no profile):",
      error.message,
    );
  }

  console.log("");
  console.log("=".repeat(60));
  console.log("✅ UPGRADE TO V3_FromV1 COMPLETE!");
  console.log("=".repeat(60));
  console.log("");
  console.log("📋 Summary:");
  console.log("  • Proxy (永 unchanged):", PROXY_ADDRESS);
  console.log("  • V3 Implementation:", v3Implementation.address);
  console.log(
    "  • Version:",
    currentVersion.toString(),
    "→",
    newVersion.toString(),
  );
  console.log("  • Profiles preserved:", profilesAfter.toString());
  console.log("");
  console.log("🎯 New Features Available:");
  console.log("  ✅ V2: addHealthEventWithStorj() - Storj off-chain storage");
  console.log("  ✅ V3: createProfileWithWeight() - Profile with weight");
  console.log("  ✅ V3: updateWeight() - Gas-efficient weight updates");
  console.log("  ✅ V3: getProfileWithWeight() - Get profile + weight");
  console.log("");
  console.log("📝 Next steps:");
  console.log("  1. Update HealthEventService to use addHealthEventWithStorj");
  console.log("  2. Test timeline event creation");
  console.log("  3. Verify Storj integration works");
  console.log("");

  // Save deployment info
  const deploymentInfo = {
    timestamp: Date.now(),
    network: "zkSyncSepolia",
    proxyAddress: PROXY_ADDRESS,
    v3ImplementationAddress: v3Implementation.address,
    upgradeTransaction: upgradeTx.hash,
    gasUsed: receipt.gasUsed.toString(),
    deployer: wallet.address,
    previousVersion: currentVersion.toString(),
    newVersion: newVersion.toString(),
    profilesPreserved: profilesAfter.toString(),
    upgradeType: "V1/V2 → V3_FromV1",
    newFunctions: [
      "addHealthEventWithStorj(encryptedData, searchTag, storjUri, contentHash)",
      "createProfileWithWeight(...)",
      "updateProfileWithWeight(...)",
      "updateWeight(encryptedWeight)",
      "getProfileWithWeight(user)",
      "getWeight(user)",
      "getContractVersion()",
    ],
  };

  const fs = require("fs");
  const path = require("path");
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  const filename = path.join(
    deploymentsDir,
    `upgrade-to-v3-${Date.now()}.json`,
  );
  fs.writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));
  console.log("💾 Deployment info saved to:", filename);
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error during upgrade:");
    console.error(error);
    process.exit(1);
  });
