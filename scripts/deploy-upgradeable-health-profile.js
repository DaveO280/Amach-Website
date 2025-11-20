/**
 * Deploy Upgradeable SecureHealthProfile with UUPS Proxy Pattern
 *
 * Architecture:
 * - Deploys SecureHealthProfileV1 (implementation contract with logic)
 * - Deploys ERC1967Proxy (proxy contract pointing to implementation)
 * - Initializes the proxy with owner
 * - Returns proxy address (永 permanent address users interact with)
 */

const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 Deploying Upgradeable SecureHealthProfile System...\n");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("📝 Deploying from account:", deployer.address);

  // Check balance
  const balance = await deployer.provider.getBalance(deployer.address);
  console.log("💰 Account balance:", ethers.formatEther(balance), "ETH\n");

  if (balance === 0n) {
    throw new Error("❌ Deployer account has no balance!");
  }

  // ============================================
  // STEP 1: Deploy Implementation
  // ============================================

  console.log("📦 Step 1: Deploying SecureHealthProfileV1 (Implementation)...");

  const SecureHealthProfileV1 = await ethers.getContractFactory(
    "SecureHealthProfileV1",
  );

  // Deploy as upgradeable proxy using OpenZeppelin's upgrades plugin
  // This automatically:
  // 1. Deploys the implementation contract
  // 2. Deploys the ERC1967Proxy
  // 3. Calls initialize() on the proxy
  // 4. Sets up upgrade permissions
  const proxy = await upgrades.deployProxy(
    SecureHealthProfileV1,
    [], // initialize() takes no parameters
    {
      kind: "uups",
      initializer: "initialize",
    },
  );

  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();

  console.log("✅ Proxy deployed at:", proxyAddress);

  // Get implementation address
  const implementationAddress =
    await upgrades.erc1967.getImplementationAddress(proxyAddress);

  console.log("✅ Implementation deployed at:", implementationAddress);
  console.log("");

  // ============================================
  // STEP 2: Verify Deployment
  // ============================================

  console.log("🔍 Step 2: Verifying deployment...");

  // Check contract owner
  const owner = await proxy.owner();
  console.log("👤 Contract owner:", owner);

  // Check version
  const version = await proxy.getVersion();
  console.log("📌 Contract version:", version);

  // Check total profiles
  const totalProfiles = await proxy.getTotalProfiles();
  console.log("👥 Total profiles:", totalProfiles.toString());

  console.log("");

  // ============================================
  // STEP 3: Save Deployment Info
  // ============================================

  console.log("💾 Step 3: Saving deployment info...");

  const deploymentInfo = {
    network: "zksync-sepolia",
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      proxy: {
        address: proxyAddress,
        description: "永 Permanent address - users interact with this",
        contractName: "ERC1967Proxy (UUPS)",
      },
      implementation: {
        address: implementationAddress,
        description: "Implementation V1 - can be upgraded",
        contractName: "SecureHealthProfileV1",
      },
    },
    features: {
      version: "1",
      upgradeable: true,
      proxyPattern: "UUPS",
      features: [
        "Core encrypted profile (birthDate, sex, height, email)",
        "Event-based health timeline (medications, conditions, weight, etc.)",
        "ZK proof submission",
        "Append-only immutable events",
        "Soft delete (deactivate) functionality",
      ],
    },
    upgradeInstructions: {
      note: "To upgrade to V2, use: scripts/upgrade-health-profile.js",
      steps: [
        "Deploy new implementation (e.g., SecureHealthProfileV2.sol)",
        "Call upgradeTo(newImplementationAddress) on proxy",
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
  const filename = `upgradeable-health-profile-zksyncSepolia-${timestamp}.json`;
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
  // STEP 4: Frontend Integration Instructions
  // ============================================

  console.log("🎯 Step 4: Frontend Integration");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log("Update src/lib/zksync-sso-config.ts:");
  console.log("");
  console.log("const SECURE_HEALTH_PROFILE_CONTRACT =");
  console.log(`  "${proxyAddress}"; // ← Use PROXY address`);
  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  // ============================================
  // DEPLOYMENT COMPLETE
  // ============================================

  console.log("✅ DEPLOYMENT COMPLETE!");
  console.log("");
  console.log("📋 Summary:");
  console.log("  • Proxy (永 address):", proxyAddress);
  console.log("  • Implementation V1:", implementationAddress);
  console.log("  • Owner:", owner);
  console.log("  • Version:", version);
  console.log("  • Network: ZKsync Sepolia Testnet");
  console.log("");
  console.log("🔄 Next Steps:");
  console.log("  1. Update frontend config with proxy address");
  console.log("  2. Fix HealthProfileReader.ts to import from config");
  console.log("  3. Test profile creation");
  console.log("  4. Test timeline event submission");
  console.log("  5. Migrate 2 existing profiles (re-enter data)");
  console.log("");
  console.log("🎉 System ready for testing!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
