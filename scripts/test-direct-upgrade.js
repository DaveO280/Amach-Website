/**
 * Test direct upgradeTo call through proxy
 * Root cause: ERC1967Proxy (Transparent) + UUPS implementation = incompatible
 * This script tests if calling upgradeTo through the proxied contract interface works
 */

const hre = require("hardhat");

async function main() {
  console.log("🔍 Testing Direct Upgrade Call...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("📝 Testing from account:", deployer.address);

  const PROXY_ADDRESS = "0x2A8015613623A6A8D369BcDC2bd6DD202230785a";
  console.log("📍 Proxy Address:", PROXY_ADDRESS);
  console.log("");

  // ============================================
  // Deploy V2 Implementation
  // ============================================

  console.log("📦 Deploying V2 implementation...");
  const SecureHealthProfileV2 = await hre.ethers.getContractFactory(
    "SecureHealthProfileV2",
  );
  const v2Implementation = await SecureHealthProfileV2.deploy();
  await v2Implementation.deployed();
  console.log("✅ V2 Implementation:", v2Implementation.address);
  console.log("");

  // ============================================
  // Connect to proxy as V1 (current implementation)
  // ============================================

  console.log("🔗 Connecting to proxy as V1...");
  const SecureHealthProfileV1 = await hre.ethers.getContractFactory(
    "SecureHealthProfileV1",
  );
  const proxiedContract = SecureHealthProfileV1.attach(PROXY_ADDRESS);

  const owner = await proxiedContract.owner();
  console.log("👤 Owner:", owner);

  const version = await proxiedContract.getVersion();
  console.log("📌 Current version:", version.toString());
  console.log("");

  // ============================================
  // Test 1: Call upgradeTo through proxied interface
  // ============================================

  console.log(
    "🧪 Test 1: Calling upgradeTo() through proxied contract interface",
  );
  console.log("   This should work if UUPS is properly implemented...");

  try {
    const tx = await proxiedContract.upgradeTo(v2Implementation.address, {
      gasLimit: 1000000,
    });
    console.log("   Transaction sent:", tx.hash);

    const receipt = await tx.wait();
    console.log(
      "   Status:",
      receipt.status === 1 ? "✅ SUCCESS" : "❌ FAILED",
    );
    console.log("");

    if (receipt.status === 1) {
      // Verify upgrade
      const proxyAsV2 = SecureHealthProfileV2.attach(PROXY_ADDRESS);
      const newVersion = await proxyAsV2.getVersion();
      console.log("✅ Upgrade successful! New version:", newVersion.toString());
    }
  } catch (error) {
    console.log("   ❌ ERROR:", error.message);
    console.log("");

    // ============================================
    // Test 2: Check if upgradeTo function exists
    // ============================================

    console.log("🔍 Test 2: Checking if upgradeTo() function is accessible...");

    try {
      // Check if function selector exists
      const selector = hre.ethers.utils
        .id("upgradeTo(address)")
        .substring(0, 10);
      console.log("   Function selector:", selector);

      // Try to estimate gas (this will fail if function doesn't exist)
      const gasEstimate = await proxiedContract.estimateGas.upgradeTo(
        v2Implementation.address,
      );
      console.log("   Gas estimate:", gasEstimate.toString());
    } catch (estimateError) {
      console.log("   ❌ Cannot estimate gas:", estimateError.message);
    }

    console.log("");

    // ============================================
    // Test 3: Check proxy implementation slot
    // ============================================

    console.log("🔍 Test 3: Checking ERC1967 implementation slot...");

    // ERC1967 implementation slot: keccak256("eip1967.proxy.implementation") - 1
    const implementationSlot =
      "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

    const currentImpl = await hre.ethers.provider.getStorageAt(
      PROXY_ADDRESS,
      implementationSlot,
    );
    console.log("   Current implementation in storage:", currentImpl);
    console.log(
      "   Expected V1 implementation:      ",
      hre.ethers.utils.hexZeroPad(
        (await proxiedContract.provider.getCode(PROXY_ADDRESS)).slice(0, 42),
        32,
      ),
    );
    console.log("");

    // ============================================
    // Diagnosis
    // ============================================

    console.log("📋 DIAGNOSIS:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("");
    console.log("Root Cause: Proxy Pattern Mismatch");
    console.log("");
    console.log(
      "The proxy was deployed using ERC1967Proxy (Transparent Proxy pattern),",
    );
    console.log("but the implementation uses UUPS pattern (UUPSUpgradeable).");
    console.log("");
    console.log("These patterns are incompatible:");
    console.log("  • Transparent Proxy: Upgrade logic in proxy contract");
    console.log("  • UUPS: Upgrade logic in implementation contract");
    console.log("");
    console.log("Solutions:");
    console.log("  1. Deploy new UUPS proxy (requires data migration)");
    console.log("  2. Deploy ProxyAdmin and use transparent upgrade pattern");
    console.log(
      "  3. Use OpenZeppelin's ERC1967Upgrade directly in implementation",
    );
    console.log("");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
