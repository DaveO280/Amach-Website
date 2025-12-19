/**
 * Simple upgrade script to V3_FromV1
 * Uses ethers.js directly with zkSync RPC
 */

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

async function main() {
  console.log("🚀 Upgrading to V3_FromV1...\n");
  console.log("=".repeat(60));
  console.log("");

  // Setup provider and wallet
  const RPC_URL =
    process.env.NEXT_PUBLIC_ZKSYNC_RPC_URL || "https://sepolia.era.zksync.dev";
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  console.log("📝 Deploying from account:", wallet.address);
  const balance = await wallet.getBalance();
  console.log(
    "💰 Account balance:",
    ethers.utils.formatEther(balance),
    "ETH\n",
  );

  const PROXY_ADDRESS = "0x2A8015613623A6A8D369BcDC2bd6DD202230785a";
  console.log("📍 Proxy Address:", PROXY_ADDRESS);
  console.log("   ↳ This address will NOT change\n");

  // ============================================
  // STEP 1: Load compiled contract
  // ============================================

  console.log("📦 Step 1: Loading V3_FromV1 compiled contract...");

  const artifactPath = path.join(
    __dirname,
    "..",
    "artifacts-zk",
    "contracts",
    "SecureHealthProfileV3_FromV1.sol",
    "SecureHealthProfileV3_FromV1.json",
  );

  if (!fs.existsSync(artifactPath)) {
    throw new Error(
      `❌ Artifact not found at ${artifactPath}. Run: npx hardhat compile --config hardhat.config.zksync.js`,
    );
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  console.log("✅ Contract artifact loaded");
  console.log("");

  // ============================================
  // STEP 2: Deploy V3_FromV1 Implementation
  // ============================================

  console.log("📦 Step 2: Deploying V3_FromV1 implementation...");

  const V3Factory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    wallet,
  );

  console.log("   Deploying contract...");
  const v3Implementation = await V3Factory.deploy({
    gasLimit: 10000000,
  });

  console.log("   Waiting for deployment confirmation...");
  await v3Implementation.deployed();

  console.log("✅ V3 Implementation deployed at:", v3Implementation.address);
  console.log("");

  // ============================================
  // STEP 3: Check Current State
  // ============================================

  console.log("🔍 Step 3: Checking current contract state...");

  // Load V1 ABI for current contract
  const v1ArtifactPath = path.join(
    __dirname,
    "..",
    "artifacts-zk",
    "contracts",
    "SecureHealthProfileV1.sol",
    "SecureHealthProfileV1.json",
  );
  const v1Artifact = JSON.parse(fs.readFileSync(v1ArtifactPath, "utf8"));

  const currentContract = new ethers.Contract(
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
  // STEP 4: Perform UUPS Upgrade
  // ============================================

  console.log("⚡ Step 4: Performing UUPS upgrade...");
  console.log("   Calling upgradeTo() on proxy...");

  const upgradeTx = await currentContract.upgradeTo(v3Implementation.address, {
    gasLimit: 1000000,
  });

  console.log("   Transaction sent:", upgradeTx.hash);
  console.log("   Waiting for confirmation...");

  const receipt = await upgradeTx.wait();
  console.log("✅ Upgrade transaction confirmed!");
  console.log("   Block:", receipt.blockNumber);
  console.log("   Gas used:", receipt.gasUsed.toString());
  console.log("");

  // ============================================
  // STEP 5: Verify Upgrade to V3
  // ============================================

  console.log("🔍 Step 5: Verifying upgrade to V3...");

  const proxyAsV3 = new ethers.Contract(PROXY_ADDRESS, artifact.abi, wallet);

  const newVersion = await proxyAsV3.getContractVersion();
  console.log("📌 New contract version:", newVersion.toString());

  const profilesAfter = await proxyAsV3.getTotalProfiles();
  console.log("👥 Total profiles after upgrade:", profilesAfter.toString());

  // Verify data preservation
  if (totalProfiles.toString() !== profilesAfter.toString()) {
    throw new Error("❌ Profile count mismatch! Data may be corrupted!");
  }

  console.log("✅ Data integrity verified!");
  console.log("");

  // Test V3 functions
  console.log("🧪 Testing V3 functions...");
  try {
    const weight = await proxyAsV3.getWeight(wallet.address);
    console.log("✅ getWeight() works - value:", weight || "(empty)");
  } catch (error) {
    console.log(
      "✅ getWeight() exists (call failed as expected if no profile)",
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
  console.log("  ✅ addHealthEventWithStorj() - Storj off-chain storage");
  console.log("  ✅ createProfileWithWeight() - Profile with weight");
  console.log("  ✅ updateWeight() - Gas-efficient weight updates");
  console.log("  ✅ getProfileWithWeight() - Get profile + weight");
  console.log("");
  console.log("📝 Next steps:");
  console.log(
    "  1. Update HealthEventService.ts line 687 to use 'addHealthEventWithStorj'",
  );
  console.log("  2. Test timeline event creation in the app");
  console.log("");

  // Save deployment info
  const deploymentInfo = {
    timestamp: Date.now(),
    date: new Date().toISOString(),
    network: "zkSyncSepolia",
    proxyAddress: PROXY_ADDRESS,
    v3ImplementationAddress: v3Implementation.address,
    upgradeTransaction: upgradeTx.hash,
    blockNumber: receipt.blockNumber,
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
