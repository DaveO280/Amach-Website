/**
 * TEST UUPS Upgrade with OpenZeppelin v5 Correct Function
 *
 * KEY DISCOVERY: OpenZeppelin v5 changed UUPS!
 * - v4 had: upgradeTo(address)
 * - v5 has: upgradeToAndCall(address, bytes) ONLY
 *
 * This is why all our upgrades were failing!
 */

const hre = require("hardhat");

async function main() {
  console.log("🧪 TESTING UUPS UPGRADE WITH CORRECT OZ v5 FUNCTION\n");
  console.log("=".repeat(60));
  console.log("");
  console.log("⚠️  KEY FINDING: OpenZeppelin v5 removed upgradeTo()!");
  console.log("   v4: upgradeTo(address newImplementation)");
  console.log("   v5: upgradeToAndCall(address newImplementation, bytes data)");
  console.log("");

  const [deployer] = await hre.ethers.getSigners();
  console.log("📝 Testing from account:", deployer.address);

  const balance = await deployer.getBalance();
  console.log(
    "💰 Account balance:",
    hre.ethers.utils.formatEther(balance),
    "ETH\n",
  );

  try {
    // ============================================
    // Deploy Test Contracts
    // ============================================

    console.log("📦 Deploying V3 implementation...");
    const SecureHealthProfileV3 = await hre.ethers.getContractFactory(
      "SecureHealthProfileV3_FromV1",
    );
    const v3Implementation = await SecureHealthProfileV3.deploy();
    await v3Implementation.deployed();
    console.log("✅ V3 Implementation:", v3Implementation.address);

    console.log("📦 Deploying proxy...");
    const initializeData = v3Implementation.interface.encodeFunctionData(
      "initialize",
      [],
    );
    const ERC1967ProxyWrapper = await hre.ethers.getContractFactory(
      "ERC1967ProxyWrapper",
    );
    const testProxy = await ERC1967ProxyWrapper.deploy(
      v3Implementation.address,
      initializeData,
    );
    await testProxy.deployed();
    console.log("✅ Test Proxy:", testProxy.address);
    console.log("");

    console.log("📦 Deploying V3.1 implementation for upgrade test...");
    const v3_1Implementation = await SecureHealthProfileV3.deploy();
    await v3_1Implementation.deployed();
    console.log("✅ V3.1 Implementation:", v3_1Implementation.address);
    console.log("");

    // ============================================
    // Test Upgrade with Correct Function
    // ============================================

    console.log("⚡ Testing upgrade with upgradeToAndCall()...");

    // Create interface with correct OZ v5 function
    const uupsInterface = new hre.ethers.utils.Interface([
      "function upgradeToAndCall(address newImplementation, bytes memory data) external payable",
    ]);

    const proxyWithUups = new hre.ethers.Contract(
      testProxy.address,
      uupsInterface,
      deployer,
    );

    console.log("   Calling upgradeToAndCall() with empty data...");
    const upgradeTx = await proxyWithUups.upgradeToAndCall(
      v3_1Implementation.address,
      "0x", // Empty bytes for no initialization call
      {
        gasLimit: 1000000,
        value: 0, // No ETH sent
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
      console.log("=".repeat(60));
      console.log("✅ SUCCESS! UUPS UPGRADES WORK!");
      console.log("=".repeat(60));
      console.log("");
      console.log("🎉 Key Finding:");
      console.log(
        "   The issue was using upgradeTo() instead of upgradeToAndCall()",
      );
      console.log("   OpenZeppelin v5 only has upgradeToAndCall()");
      console.log("");
      console.log("✅ We can now safely deploy and upgrade contracts!");
      console.log("");

      // Verify upgrade
      const implSlot =
        "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
      const currentImpl = await hre.ethers.provider.getStorageAt(
        testProxy.address,
        implSlot,
      );
      const expectedImpl = hre.ethers.utils.hexZeroPad(
        v3_1Implementation.address.toLowerCase(),
        32,
      );
      console.log("🔍 Verification:");
      console.log(
        "   Implementation updated:",
        currentImpl.toLowerCase() === expectedImpl.toLowerCase()
          ? "✅ YES"
          : "❌ NO",
      );
      console.log("");

      // Test contract still works
      const proxied = SecureHealthProfileV3.attach(testProxy.address);
      const version = await proxied.getContractVersion();
      console.log("   Contract version:", version.toString());
      console.log(
        "   Contract functional:",
        version.toString() === "3" ? "✅ YES" : "❌ NO",
      );
      console.log("");
    } else {
      console.log("❌ Upgrade still failed with correct function");
      console.log("   This indicates a deeper zkSync compatibility issue");
    }
  } catch (error) {
    console.log("❌ TEST FAILED:", error.message);
    console.log("");
    console.log("Error details:", error);
  }

  console.log("");
  console.log("=".repeat(60));
  console.log("📋 Summary:");
  console.log("   OpenZeppelin v5 UUPS requires: upgradeToAndCall()");
  console.log("   NOT: upgradeTo()");
  console.log("");
  console.log("🎯 Next Step:");
  console.log(
    "   If this test passed, we can now upgrade the production contract!",
  );
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Test script error:", error);
    process.exit(1);
  });
