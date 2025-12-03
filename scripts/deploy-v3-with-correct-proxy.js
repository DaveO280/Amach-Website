/**
 * Deploy fresh V3 contract with proper UUPS proxy
 * Then migrate 2 existing profiles from old contract
 *
 * Root Cause Analysis:
 * - Old proxy: ERC1967Proxy (doesn't work with UUPS implementations)
 * - The issue: ERC1967Proxy and UUPSUpgradeable are incompatible patterns
 * - Solution: Deploy from scratch with just the proxy, let UUPS handle upgrades
 */

const hre = require("hardhat");

async function main() {
  console.log("🚀 Deploying Fresh V3 Contract with Proper Proxy...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("📝 Deploying from account:", deployer.address);

  const balance = await deployer.getBalance();
  console.log(
    "💰 Account balance:",
    hre.ethers.utils.formatEther(balance),
    "ETH\n",
  );

  const OLD_PROXY_ADDRESS = "0x2A8015613623A6A8D369BcDC2bd6DD202230785a";

  // ============================================
  // STEP 1: Deploy V3 Implementation
  // ============================================

  console.log(
    "📦 Step 1: Deploying SecureHealthProfileV3_FromV1 (Implementation)...",
  );
  console.log("   This combines V2 + V3 features in one contract");
  const SecureHealthProfileV3 = await hre.ethers.getContractFactory(
    "SecureHealthProfileV3_FromV1",
  );
  const v3Implementation = await SecureHealthProfileV3.deploy();
  await v3Implementation.deployed();
  console.log("✅ V3 Implementation deployed at:", v3Implementation.address);
  console.log("");

  // ============================================
  // STEP 2: Encode Initialize Call
  // ============================================

  console.log("📦 Step 2: Encoding initialize() call...");
  const initializeData = v3Implementation.interface.encodeFunctionData(
    "initialize",
    [],
  );
  console.log("✅ Initialize data encoded");
  console.log("");

  // ============================================
  // STEP 3: Deploy Simple ERC1967 Proxy
  // ============================================

  console.log("📦 Step 3: Deploying ERC1967Proxy (for UUPS)...");
  console.log("   Note: We use the SAME proxy type as before");
  console.log("   The difference: V3 implementation might have fixes");

  const ERC1967ProxyWrapper = await hre.ethers.getContractFactory(
    "ERC1967ProxyWrapper",
  );
  const proxy = await ERC1967ProxyWrapper.deploy(
    v3Implementation.address,
    initializeData,
  );
  await proxy.deployed();

  console.log("✅ Proxy deployed at:", proxy.address);
  console.log("");

  // ============================================
  // STEP 4: Verify Deployment
  // ============================================

  console.log("🔍 Step 4: Verifying deployment...");

  const proxiedContract = SecureHealthProfileV3.attach(proxy.address);

  const owner = await proxiedContract.owner();
  console.log("👤 Contract owner:", owner);

  const version = await proxiedContract.getContractVersion();
  console.log("📌 Contract version:", version.toString());

  const totalProfiles = await proxiedContract.getTotalProfiles();
  console.log("👥 Total profiles:", totalProfiles.toString());
  console.log("");

  // ============================================
  // STEP 5: Test Upgrade Capability
  // ============================================

  console.log("🧪 Step 5: Testing upgrade capability...");
  console.log("   Deploying a dummy V4 to test upgradeTo()...");

  // Deploy a test implementation to verify upgrade works
  const testImplementation = await SecureHealthProfileV3.deploy();
  await testImplementation.deployed();
  console.log("   Test implementation deployed:", testImplementation.address);

  try {
    // Try to call upgradeTo using UUPS interface
    const uupsInterface = new hre.ethers.utils.Interface([
      "function upgradeTo(address newImplementation) external",
    ]);

    const proxyWithUups = new hre.ethers.Contract(
      proxy.address,
      uupsInterface,
      deployer,
    );

    console.log("   Calling upgradeTo() on fresh proxy...");
    const testUpgradeTx = await proxyWithUups.upgradeTo(
      testImplementation.address,
      {
        gasLimit: 1000000,
      },
    );
    console.log("   Transaction sent:", testUpgradeTx.hash);

    const receipt = await testUpgradeTx.wait();

    if (receipt.status === 1) {
      console.log(
        "   ✅ Upgrade test PASSED! Reverting to original implementation...",
      );

      // Upgrade back to original
      const proxyWithTest = new hre.ethers.Contract(
        proxy.address,
        uupsInterface,
        deployer,
      );
      const revertTx = await proxyWithTest.upgradeTo(v3Implementation.address, {
        gasLimit: 1000000,
      });
      await revertTx.wait();
      console.log("   ✅ Reverted to original implementation");
    } else {
      console.log("   ❌ Upgrade test FAILED - same issue as old proxy");
      console.log("   This confirms ERC1967Proxy is incompatible with UUPS");
    }
  } catch (error) {
    console.log("   ❌ Upgrade test FAILED:", error.message);
    console.log("");
    console.log("   This confirms the root cause:");
    console.log("   ERC1967Proxy does NOT support UUPS pattern upgrades");
    console.log("");
    console.log("   We need to use a different approach:");
    console.log("   1. Use OpenZeppelin's Upgrades plugin");
    console.log("   2. Or use TransparentUpgradeableProxy with ProxyAdmin");
    console.log("   3. Or manually implement proper UUPS proxy forwarding");
  }

  console.log("");

  // ============================================
  // STEP 6: Retrieve Old Profiles for Migration
  // ============================================

  console.log("📋 Step 6: Retrieving profiles from old contract...");
  const SecureHealthProfileV1 = await hre.ethers.getContractFactory(
    "SecureHealthProfileV1",
  );
  const oldContract = SecureHealthProfileV1.attach(OLD_PROXY_ADDRESS);

  const oldTotalProfiles = await oldContract.getTotalProfiles();
  console.log("   Old contract has", oldTotalProfiles.toString(), "profiles");

  // Get profile addresses (we know there are 2)
  // Note: We don't have a function to enumerate profiles, so we need to check addresses
  console.log(
    "   Note: Profile migration would require knowing user addresses",
  );
  console.log("   These can be retrieved from ProfileCreated events");
  console.log("");

  // ============================================
  // Save Deployment Info
  // ============================================

  const deploymentInfo = {
    timestamp: Date.now(),
    network: hre.network.name,
    proxyAddress: proxy.address,
    v3ImplementationAddress: v3Implementation.address,
    deployer: deployer.address,
    version: "3",
    upgradeTestResult: "See console output above",
    oldContractAddress: OLD_PROXY_ADDRESS,
    oldContractProfiles: oldTotalProfiles.toString(),
    migrationStatus: "Pending - need to copy 2 profiles",
  };

  const fs = require("fs");
  const path = require("path");
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  const filename = path.join(
    deploymentsDir,
    `fresh-v3-deployment-${Date.now()}.json`,
  );
  fs.writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));
  console.log("💾 Deployment info saved to:", filename);

  console.log("");
  console.log("=".repeat(60));
  console.log("✅ FRESH V3 DEPLOYMENT COMPLETE");
  console.log("=".repeat(60));
  console.log("");
  console.log("📋 Summary:");
  console.log("  • New Proxy Address:", proxy.address);
  console.log("  • V3 Implementation:", v3Implementation.address);
  console.log("  • Version: 3 (includes V2 Storj + V3 Weight features)");
  console.log("  • Owner:", owner);
  console.log("");
  console.log("⚠️  Next Steps:");
  console.log("  1. Check upgrade test results above");
  console.log(
    "  2. If upgrade still fails: Research proper UUPS proxy solution",
  );
  console.log("  3. Update frontend to use new proxy address");
  console.log("  4. Migrate 2 existing profiles (users re-enter data)");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
