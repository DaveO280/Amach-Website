/**
 * Upgrade using UUPS interface directly
 * The upgradeTo() function exists in UUPSUpgradeable but wasn't included in V1's ABI
 * We'll call it directly using the UUPS interface
 */

const hre = require("hardhat");

async function main() {
  console.log("🚀 Upgrading V1 → V2 using UUPS interface...\n");

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
  console.log("");

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
  // STEP 3: Call upgradeTo using UUPS ABI
  // ============================================

  console.log("⚡ Step 3: Calling upgradeTo() using UUPS interface...");

  // Create a contract instance with UUPS interface
  // upgradeTo(address) is part of UUPSUpgradeable
  const uupsInterface = new hre.ethers.utils.Interface([
    "function upgradeTo(address newImplementation) external",
    "function upgradeToAndCall(address newImplementation, bytes memory data) external payable",
  ]);

  // Create contract with UUPS interface
  const proxyWithUupsInterface = new hre.ethers.Contract(
    PROXY_ADDRESS,
    uupsInterface,
    deployer,
  );

  console.log("   Calling upgradeTo()...");

  try {
    const upgradeTx = await proxyWithUupsInterface.upgradeTo(
      v2Implementation.address,
      {
        gasLimit: 1000000,
      },
    );
    console.log("   Transaction sent:", upgradeTx.hash);
    console.log("   Waiting for confirmation...");

    const receipt = await upgradeTx.wait();
    console.log(
      "   Status:",
      receipt.status === 1 ? "✅ SUCCESS" : "❌ FAILED",
    );
    console.log("");

    if (receipt.status !== 1) {
      throw new Error("Transaction failed!");
    }
  } catch (error) {
    console.log("   ❌ Upgrade failed:", error.message);
    console.log("");

    // Additional diagnostics
    if (error.message.includes("function_selector = 0x")) {
      console.log("🔍 Additional Diagnosis:");
      console.log("   The upgradeTo function appears to be reverting.");
      console.log(
        "   Checking if _authorizeUpgrade is properly implemented...",
      );
      console.log("");

      // Check implementation storage
      const implSlot =
        "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
      const currentImpl = await hre.ethers.provider.getStorageAt(
        PROXY_ADDRESS,
        implSlot,
      );
      console.log("   Implementation in storage:", currentImpl);
      console.log("");

      // Try to interact with implementation directly (not recommended but for testing)
      console.log("   Testing if V1 implementation has upgradeTo...");
      const v1Direct = new hre.ethers.Contract(
        "0x9aD92C50548c7D0628f21836c48230041330D277",
        uupsInterface,
        deployer,
      );

      try {
        await v1Direct.callStatic.upgradeTo(v2Implementation.address);
        console.log("   ✅ V1 implementation accepts upgradeTo call");
      } catch (directError) {
        console.log(
          "   ❌ V1 implementation rejects upgradeTo:",
          directError.message,
        );
      }
    }

    throw error;
  }

  // ============================================
  // STEP 4: Verify Upgrade to V2
  // ============================================

  console.log("🔍 Step 4: Verifying upgrade to V2...");

  const proxyAsV2 = SecureHealthProfileV2.attach(PROXY_ADDRESS);

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
  console.log("🎯 Next step: Run upgrade to V3!");
  console.log("");

  // Save deployment info
  const deploymentInfo = {
    timestamp: Date.now(),
    network: hre.network.name,
    proxyAddress: PROXY_ADDRESS,
    v2ImplementationAddress: v2Implementation.address,
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
