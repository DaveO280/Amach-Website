/**
 * Deploy/Upgrade SecureHealthProfileV4 with Attestation
 *
 * Usage:
 *   npx hardhat run scripts/deploy-v4-attestation.js --config hardhat.config.zksync.js --network zkSyncSepolia
 *
 * Prerequisites:
 *   - Set PRIVATE_KEY in .env (deployer wallet with ETH for gas)
 *   - Compile contracts first: npx hardhat compile --config hardhat.config.zksync.js
 */

const { ethers, upgrades } = require("hardhat");

// Current proxy address (from contractConfig.ts)
const PROXY_ADDRESS = "0x2A8015613623A6A8D369BcDC2bd6DD202230785a";

async function main() {
  console.log("🚀 Deploying SecureHealthProfileV4...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);
  console.log(
    "Balance:",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "ETH\n",
  );

  // Get the V4 contract factory
  const SecureHealthProfileV4 = await ethers.getContractFactory(
    "SecureHealthProfileV4",
  );

  // Option 1: Fresh deployment (if no existing proxy)
  // const proxy = await upgrades.deployProxy(SecureHealthProfileV4, [], {
  //   initializer: "initialize",
  //   kind: "uups",
  // });
  // await proxy.waitForDeployment();
  // console.log("✅ V4 Proxy deployed to:", await proxy.getAddress());

  // Option 2: Upgrade existing proxy to V4
  console.log("📦 Upgrading existing proxy to V4...");
  console.log("   Proxy address:", PROXY_ADDRESS);

  const upgraded = await upgrades.upgradeProxy(
    PROXY_ADDRESS,
    SecureHealthProfileV4,
    {
      kind: "uups",
    },
  );
  await upgraded.waitForDeployment();

  // Verify the upgrade
  const version = await upgraded.getContractVersion();
  console.log("\n✅ Upgrade complete!");
  console.log("   Contract version:", version.toString());
  console.log("   Proxy address:", PROXY_ADDRESS);

  // Test attestation functions exist
  console.log("\n🧪 Verifying attestation functions...");
  try {
    const totalAttestations = await upgraded.totalAttestations();
    console.log("   totalAttestations():", totalAttestations.toString());

    // Check tier thresholds
    const goldMin = await upgraded.TIER_GOLD_MIN_SCORE();
    const silverMin = await upgraded.TIER_SILVER_MIN_SCORE();
    const bronzeMin = await upgraded.TIER_BRONZE_MIN_SCORE();
    console.log(
      "   Tier thresholds: Gold ≥",
      goldMin.toString(),
      "Silver ≥",
      silverMin.toString(),
      "Bronze ≥",
      bronzeMin.toString(),
    );

    console.log("\n✅ All attestation functions verified!");
  } catch (error) {
    console.error("❌ Verification failed:", error.message);
  }

  // Output for contractConfig.ts update (if implementation address needed)
  const implementationAddress =
    await upgrades.erc1967.getImplementationAddress(PROXY_ADDRESS);
  console.log("\n📋 Addresses for reference:");
  console.log("   Proxy (unchanged):", PROXY_ADDRESS);
  console.log("   New Implementation:", implementationAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
