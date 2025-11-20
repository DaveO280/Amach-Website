/**
 * Manual UUPS Proxy Deployment (No OpenZeppelin Plugin Needed!)
 * Works with ethers v5 - no dependency conflicts
 */

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log(
    "🚀 Deploying Upgradeable SecureHealthProfile (Manual Method)...\n",
  );

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
  // STEP 1: Deploy Implementation
  // ============================================

  console.log("📦 Step 1: Deploying SecureHealthProfileV1 (Implementation)...");

  const SecureHealthProfileV1 = await ethers.getContractFactory(
    "SecureHealthProfileV1",
  );
  const implementation = await SecureHealthProfileV1.deploy();
  await implementation.deployed();

  console.log("✅ Implementation deployed at:", implementation.address);
  console.log("");

  // ============================================
  // STEP 2: Encode Initialize Call
  // ============================================

  console.log("📦 Step 2: Encoding initialize() call...");

  // The initialize function signature (takes no parameters)
  const initializeData = implementation.interface.encodeFunctionData(
    "initialize",
    [],
  );
  console.log("✅ Initialize data encoded");
  console.log("");

  // ============================================
  // STEP 3: Deploy ERC1967 Proxy
  // ============================================

  console.log("📦 Step 3: Deploying ERC1967Proxy...");

  // Deploy proxy pointing to implementation
  const ERC1967ProxyWrapper = await ethers.getContractFactory(
    "ERC1967ProxyWrapper",
  );

  const proxy = await ERC1967ProxyWrapper.deploy(
    implementation.address,
    initializeData,
  );
  await proxy.deployed();

  console.log("✅ Proxy deployed at:", proxy.address);
  console.log("");

  // ============================================
  // STEP 4: Verify Deployment
  // ============================================

  console.log("🔍 Step 4: Verifying deployment...");

  // Connect to proxy as if it were the implementation
  const proxiedContract = SecureHealthProfileV1.attach(proxy.address);

  // Check contract owner
  const owner = await proxiedContract.owner();
  console.log("👤 Contract owner:", owner);

  // Check version
  const version = await proxiedContract.getVersion();
  console.log("📌 Contract version:", version.toString());

  // Check total profiles
  const totalProfiles = await proxiedContract.getTotalProfiles();
  console.log("👥 Total profiles:", totalProfiles.toString());

  console.log("");

  // ============================================
  // STEP 5: Save Deployment Info
  // ============================================

  console.log("💾 Step 5: Saving deployment info...");

  const deploymentInfo = {
    network: "zksync-sepolia",
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      proxy: {
        address: proxy.address,
        description: "永 Permanent address - users interact with this",
        contractName: "ERC1967Proxy (UUPS)",
      },
      implementation: {
        address: implementation.address,
        description: "Implementation V1 - can be upgraded",
        contractName: "SecureHealthProfileV1",
      },
    },
    deploymentMethod: "manual",
    ethersVersion: "5.8.0",
    features: {
      version: "1",
      upgradeable: true,
      proxyPattern: "UUPS (ERC1967)",
      features: [
        "Core encrypted profile (birthDate, sex, height, email)",
        "Event-based health timeline (medications, conditions, weight, etc.)",
        "ZK proof submission",
        "Append-only immutable events",
        "Soft delete (deactivate) functionality",
      ],
    },
    upgradeInstructions: {
      note: "To upgrade to V2, deploy new implementation and call upgradeTo()",
      steps: [
        "Deploy SecureHealthProfileV2.sol",
        "Get implementation address",
        "Call: proxiedContract.upgradeTo(newImplementationAddress)",
        "All data preserved in proxy storage",
        "New functions immediately available",
      ],
    },
    migration: {
      oldContract: "0xb1e41c4913D52E20aAaF4728c0449Bc6320a45A3",
      oldContractBackup: "backup/contracts-pre-upgrade-2025-11-20/",
      note: "2 profiles exist on old contract - users should re-enter data",
    },
  };

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const timestamp = Date.now();
  const filename = `upgradeable-health-profile-manual-${timestamp}.json`;
  const filepath = path.join(deploymentsDir, filename);

  fs.writeFileSync(filepath, JSON.stringify(deploymentInfo, null, 2));
  console.log("✅ Deployment info saved to:", filename);

  // Also save as latest
  const latestPath = path.join(
    deploymentsDir,
    "latest-upgradeable-deployment.json",
  );
  fs.writeFileSync(latestPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(
    "✅ Latest deployment saved to: latest-upgradeable-deployment.json",
  );

  console.log("");

  // ============================================
  // STEP 6: Frontend Integration Instructions
  // ============================================

  console.log("🎯 Step 6: Frontend Integration");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log("Update src/lib/zksync-sso-config.ts:");
  console.log("");
  console.log("const SECURE_HEALTH_PROFILE_CONTRACT =");
  console.log(`  "${proxy.address}"; // ← Use PROXY address`);
  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  // ============================================
  // DEPLOYMENT COMPLETE
  // ============================================

  console.log("✅ DEPLOYMENT COMPLETE!");
  console.log("");
  console.log("📋 Summary:");
  console.log("  • Proxy (永 address):", proxy.address);
  console.log("  • Implementation V1:", implementation.address);
  console.log("  • Owner:", owner);
  console.log("  • Version:", version.toString());
  console.log("  • Network: ZKsync Sepolia Testnet");
  console.log("  • Method: Manual (ethers v5 compatible)");
  console.log("");
  console.log("🔄 Next Steps:");
  console.log("  1. Update frontend config with proxy address");
  console.log("  2. Test profile creation");
  console.log("  3. Test timeline event submission");
  console.log("  4. Migrate 2 existing profiles (re-enter data)");
  console.log("");
  console.log("🎉 System ready for testing!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
