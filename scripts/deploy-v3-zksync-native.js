/**
 * Deploy V3 with zkSync-Native UUPS Support
 *
 * Uses zksync-web3 SDK for proper zkSync deployment
 * This should fix the UUPS upgrade issue by using zkSync's deployment mechanism
 */

const { Deployer } = require("@matterlabs/hardhat-zksync-deploy");
const { Wallet } = require("zksync-web3");
const hre = require("hardhat");

async function main() {
  console.log("🚀 Deploying V3 with zkSync-Native UUPS Support...\n");
  console.log("=".repeat(60));
  console.log("");

  // Initialize zkSync wallet
  const wallet = new Wallet(process.env.PRIVATE_KEY);
  console.log("📝 Deploying from account:", wallet.address);

  const deployer = new Deployer(hre, wallet);

  const balance = await wallet.getBalance();
  console.log(
    "💰 Account balance:",
    hre.ethers.utils.formatEther(balance),
    "ETH\n",
  );

  // ============================================
  // STEP 1: Deploy V3 Implementation with zkSync Deployer
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
  // STEP 3: Deploy ERC1967 Proxy with zkSync Deployer
  // ============================================

  console.log("📦 Step 3: Deploying ERC1967Proxy with zkSync deployer...");

  const proxyArtifact = await deployer.loadArtifact("ERC1967ProxyWrapper");
  const proxy = await deployer.deploy(proxyArtifact, [
    v3Implementation.address,
    initializeData,
  ]);
  await proxy.deployed();

  console.log("✅ Proxy deployed at:", proxy.address);
  console.log("");

  // ============================================
  // STEP 4: Verify Deployment
  // ============================================

  console.log("🔍 Step 4: Verifying deployment...");

  const SecureHealthProfileV3 = await hre.ethers.getContractFactory(
    "SecureHealthProfileV3_FromV1",
  );
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
  console.log("   Deploying test V3.1 implementation...");

  const v3_1Implementation = await deployer.deploy(artifact);
  await v3_1Implementation.deployed();
  console.log("   Test implementation:", v3_1Implementation.address);

  try {
    // Create UUPS interface
    const uupsInterface = new hre.ethers.utils.Interface([
      "function upgradeTo(address newImplementation) external",
    ]);

    const proxyWithUups = new hre.ethers.Contract(
      proxy.address,
      uupsInterface,
      wallet.connect(hre.ethers.provider),
    );

    console.log("   Calling upgradeTo()...");
    const upgradeTx = await proxyWithUups.upgradeTo(
      v3_1Implementation.address,
      {
        gasLimit: 1000000,
      },
    );
    console.log("   Transaction sent:", upgradeTx.hash);

    const receipt = await upgradeTx.wait();
    console.log("   Gas used:", receipt.gasUsed.toString());
    console.log(
      "   Status:",
      receipt.status === 1 ? "✅ SUCCESS" : "❌ FAILED",
    );
    console.log("");

    if (receipt.status === 1) {
      console.log("✅ Upgrade test PASSED!");
      console.log("   UUPS upgrades work with zkSync-native deployment!");
      console.log("");

      // Revert to original implementation
      console.log("   Reverting to original implementation...");
      const revertTx = await proxyWithUups.upgradeTo(v3Implementation.address, {
        gasLimit: 1000000,
      });
      await revertTx.wait();
      console.log("   ✅ Reverted to original");
      console.log("");
    } else {
      console.log("❌ Upgrade test FAILED");
      console.log("   Even zkSync-native deployment has upgrade issues");
      console.log("");
    }
  } catch (error) {
    console.log("❌ Upgrade test FAILED:", error.message);
    console.log("");
    console.log("   This indicates a deeper issue:");
    console.log(
      "   - OpenZeppelin UUPS may not be fully compatible with zkSync",
    );
    console.log("   - May need zkSync-specific UUPS implementation");
    console.log("");
  }

  // ============================================
  // Save Deployment Info
  // ============================================

  const deploymentInfo = {
    timestamp: Date.now(),
    network: hre.network.name,
    proxyAddress: proxy.address,
    v3ImplementationAddress: v3Implementation.address,
    deployer: wallet.address,
    version: "3",
    deploymentMethod: "zkSync-native (zksync-web3 SDK)",
    features: [
      "V1: Core profile (birthDate, sex, height, email)",
      "V1: Event timeline",
      "V2: Storj off-chain storage",
      "V3: Weight field",
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
    `zksync-native-v3-${Date.now()}.json`,
  );
  fs.writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));
  console.log("💾 Deployment info saved to:", filename);

  console.log("");
  console.log("=".repeat(60));
  console.log("✅ DEPLOYMENT COMPLETE");
  console.log("=".repeat(60));
  console.log("");
  console.log("📋 Summary:");
  console.log("  • Proxy Address:", proxy.address);
  console.log("  • V3 Implementation:", v3Implementation.address);
  console.log("  • Version: 3 (includes all features)");
  console.log("  • Deployment: zkSync-native");
  console.log("");
  console.log("🎯 Next Steps:");
  console.log("  1. Check upgrade test results above");
  console.log("  2. If successful: Update frontend to new proxy address");
  console.log("  3. Migrate 2 existing profiles (users re-enter data)");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
