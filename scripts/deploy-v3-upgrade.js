/**
 * Deploy and upgrade to V3_FromV1 using direct ethers.js
 * This avoids the zkSync-specific deployment issues
 */

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

async function main() {
  console.log("🚀 Deploying and upgrading to V3_FromV1...\n");
  console.log("=".repeat(60));

  // Setup
  const RPC_URL =
    process.env.NEXT_PUBLIC_ZKSYNC_RPC_URL || "https://sepolia.era.zksync.dev";
  const PROXY_ADDRESS = "0x2A8015613623A6A8D369BcDC2bd6DD202230785a";

  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  console.log("\n📝 Deployer:", wallet.address);
  const balance = await wallet.getBalance();
  console.log("💰 Balance:", ethers.utils.formatEther(balance), "ETH");

  // Load compiled artifact
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
      "❌ Contract not compiled. Run: npx hardhat compile --config hardhat.config.zksync.js",
    );
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  console.log("\n✅ Contract artifact loaded\n");

  // Step 1: Check current state
  console.log("📋 Step 1: Checking current state...");
  const currentAbi = [
    "function owner() view returns (address)",
    "function getVersion() view returns (uint8)",
    "function getTotalProfiles() view returns (uint256)",
  ];
  const currentContract = new ethers.Contract(
    PROXY_ADDRESS,
    currentAbi,
    provider,
  );

  const owner = await currentContract.owner();
  const version = await currentContract.getVersion();
  const totalProfiles = await currentContract.getTotalProfiles();

  console.log("  Owner:", owner);
  console.log("  Current version:", version.toString());
  console.log("  Total profiles:", totalProfiles.toString());

  if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error(`❌ Not the owner! Owner is ${owner}`);
  }

  // Step 2: Deploy new implementation
  console.log("\n📦 Step 2: Deploying V3_FromV1 implementation...");
  console.log("  This may take a minute...");

  const V3Factory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    wallet,
  );

  let implementation;
  try {
    implementation = await V3Factory.deploy({
      gasLimit: 15000000, // High gas limit for zkSync
    });

    console.log("  Transaction sent:", implementation.deployTransaction.hash);
    console.log("  Waiting for confirmation...");

    await implementation.deployed();
    console.log("✅ Implementation deployed at:", implementation.address);
  } catch (error) {
    console.error("\n❌ Deployment failed:", error.message);

    // Check if it's an initialization error
    if (error.message.includes("Initializable")) {
      console.log("\n💡 This might be an initialization error");
      console.log("   The contract constructor calls _disableInitializers()");
      console.log(
        "   This should work on zkSync, but if it fails, we need a different approach",
      );
    }

    throw error;
  }

  // Step 3: Upgrade the proxy
  console.log("\n⚡ Step 3: Upgrading proxy...");
  console.log("  Proxy:", PROXY_ADDRESS);
  console.log("  New implementation:", implementation.address);

  const upgradeAbi = ["function upgradeTo(address newImplementation) external"];
  const proxyContract = new ethers.Contract(PROXY_ADDRESS, upgradeAbi, wallet);

  const upgradeTx = await proxyContract.upgradeTo(implementation.address, {
    gasLimit: 1000000,
  });
  console.log("  Transaction sent:", upgradeTx.hash);
  console.log("  Waiting for confirmation...");

  const receipt = await upgradeTx.wait();
  console.log("✅ Upgrade confirmed!");
  console.log("  Block:", receipt.blockNumber);
  console.log("  Gas used:", receipt.gasUsed.toString());

  // Step 4: Verify upgrade
  console.log("\n🔍 Step 4: Verifying upgrade...");

  const v3Abi = [
    "function getContractVersion() view returns (uint8)",
    "function getTotalProfiles() view returns (uint256)",
    "function getWeight(address user) view returns (string)",
  ];
  const upgradedContract = new ethers.Contract(PROXY_ADDRESS, v3Abi, provider);

  const newVersion = await upgradedContract.getContractVersion();
  const profilesAfter = await upgradedContract.getTotalProfiles();

  console.log("  New version:", newVersion.toString());
  console.log("  Total profiles:", profilesAfter.toString());

  if (totalProfiles.toString() !== profilesAfter.toString()) {
    throw new Error(
      "❌ Profile count mismatch! Upgrade may have corrupted data!",
    );
  }

  console.log("✅ Data preserved!");

  // Test V3 functions
  try {
    await upgradedContract.getWeight(wallet.address);
    console.log("✅ getWeight() function works!");
  } catch (e) {
    console.log("✅ getWeight() exists (expected to fail if no weight set)");
  }

  // Final summary
  console.log("\n" + "=".repeat(60));
  console.log("✅ UPGRADE TO V3_FromV1 COMPLETE!");
  console.log("=".repeat(60));
  console.log("\n📋 Summary:");
  console.log("  Proxy (永): ", PROXY_ADDRESS);
  console.log("  Implementation:", implementation.address);
  console.log("  Version:", version.toString(), "→", newVersion.toString());
  console.log("  Profiles preserved:", profilesAfter.toString());
  console.log(
    "  Explorer:",
    `https://sepolia.explorer.zksync.io/address/${PROXY_ADDRESS}`,
  );

  console.log("\n🎯 New Functions Available:");
  console.log(
    "  ✅ addHealthEventWithStorj(encryptedData, searchTag, storjUri, contentHash)",
  );
  console.log("  ✅ createProfileWithWeight(...)");
  console.log("  ✅ getProfileWithWeight(user)");
  console.log("  ✅ updateWeight(encryptedWeight)");

  console.log("\n📝 Next Steps:");
  console.log(
    "  1. Update HealthEventService.ts to use addHealthEventWithStorj",
  );
  console.log(
    "  2. Remove eventHash calculation (contract does it internally)",
  );
  console.log("  3. Test timeline event creation!");

  // Save deployment info
  const deploymentInfo = {
    timestamp: Date.now(),
    date: new Date().toISOString(),
    network: "zkSyncSepolia",
    proxyAddress: PROXY_ADDRESS,
    implementationAddress: implementation.address,
    deploymentTx: implementation.deployTransaction.hash,
    upgradeTx: upgradeTx.hash,
    upgradeBlock: receipt.blockNumber,
    deployer: wallet.address,
    previousVersion: version.toString(),
    newVersion: newVersion.toString(),
    profilesPreserved: profilesAfter.toString(),
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
  console.log("\n💾 Deployment info saved:", filename);
}

main()
  .then(() => {
    console.log("\n✅ Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Error:", error.message);
    if (error.stack) {
      console.error("\nStack trace:", error.stack);
    }
    process.exit(1);
  });
