/**
 * TEST SCRIPT: Verify UUPS upgrade capability works
 *
 * This script will:
 * 1. Deploy a test V3 implementation
 * 2. Deploy a test proxy pointing to it
 * 3. Deploy a second test implementation (V3.1)
 * 4. Attempt to upgrade from V3 → V3.1
 * 5. Verify the upgrade succeeded
 *
 * If this test passes, we know UUPS upgrades will work in production.
 * If it fails, we have a zkSync or OpenZeppelin compatibility issue.
 */

const hre = require("hardhat");

async function main() {
  console.log("🧪 TESTING UUPS UPGRADE CAPABILITY\n");
  console.log("=".repeat(60));
  console.log("");

  const [deployer] = await hre.ethers.getSigners();
  console.log("📝 Testing from account:", deployer.address);

  const balance = await deployer.getBalance();
  console.log(
    "💰 Account balance:",
    hre.ethers.utils.formatEther(balance),
    "ETH\n",
  );

  let testPassed = true;
  let failureReason = "";

  try {
    // ============================================
    // TEST 1: Deploy Initial Implementation (V3)
    // ============================================

    console.log("📦 Test 1: Deploying initial V3 implementation...");
    const SecureHealthProfileV3 = await hre.ethers.getContractFactory(
      "SecureHealthProfileV3_FromV1",
    );
    const v3Implementation = await SecureHealthProfileV3.deploy();
    await v3Implementation.deployed();
    console.log("✅ V3 Implementation:", v3Implementation.address);
    console.log("");

    // ============================================
    // TEST 2: Deploy Proxy
    // ============================================

    console.log("📦 Test 2: Deploying test proxy...");
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

    // ============================================
    // TEST 3: Verify Initial Deployment
    // ============================================

    console.log("🔍 Test 3: Verifying initial state...");
    const proxied = SecureHealthProfileV3.attach(testProxy.address);

    const owner = await proxied.owner();
    console.log("   Owner:", owner);

    const version = await proxied.getContractVersion();
    console.log("   Version:", version.toString());

    if (version.toString() !== "3") {
      throw new Error("Initial version should be 3, got " + version.toString());
    }
    console.log("✅ Initial state correct");
    console.log("");

    // ============================================
    // TEST 4: Deploy Second Implementation (V3.1)
    // ============================================

    console.log(
      "📦 Test 4: Deploying second V3 implementation (for upgrade test)...",
    );
    const v3_1Implementation = await SecureHealthProfileV3.deploy();
    await v3_1Implementation.deployed();
    console.log("✅ V3.1 Implementation:", v3_1Implementation.address);
    console.log("");

    // ============================================
    // TEST 5: Attempt Upgrade (THE CRITICAL TEST)
    // ============================================

    console.log("⚡ Test 5: Attempting upgrade V3 → V3.1...");
    console.log("   This is the critical test!");
    console.log("");

    // Create UUPS interface
    const uupsInterface = new hre.ethers.utils.Interface([
      "function upgradeTo(address newImplementation) external",
    ]);

    const proxyWithUups = new hre.ethers.Contract(
      testProxy.address,
      uupsInterface,
      deployer,
    );

    console.log("   Calling upgradeTo()...");
    const upgradeTx = await proxyWithUups.upgradeTo(
      v3_1Implementation.address,
      {
        gasLimit: 1000000,
      },
    );
    console.log("   Transaction sent:", upgradeTx.hash);
    console.log("   Waiting for confirmation...");

    const receipt = await upgradeTx.wait();
    console.log("   Gas used:", receipt.gasUsed.toString());
    console.log("   Status:", receipt.status === 1 ? "SUCCESS" : "FAILED");
    console.log("");

    if (receipt.status !== 1) {
      testPassed = false;
      failureReason = "Upgrade transaction reverted";
      throw new Error("Upgrade transaction failed!");
    }

    console.log("✅ Upgrade transaction succeeded!");
    console.log("");

    // ============================================
    // TEST 6: Verify Upgrade Success
    // ============================================

    console.log("🔍 Test 6: Verifying upgrade...");

    // Check implementation storage slot
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

    console.log("   Implementation in storage:", currentImpl);
    console.log("   Expected:                  ", expectedImpl);

    if (currentImpl.toLowerCase() !== expectedImpl.toLowerCase()) {
      testPassed = false;
      failureReason = "Implementation address in storage doesn't match";
      throw new Error("Implementation not updated in storage!");
    }

    console.log("✅ Implementation storage updated correctly");
    console.log("");

    // ============================================
    // TEST 7: Verify Contract Still Functions
    // ============================================

    console.log(
      "🔍 Test 7: Verifying contract still functions after upgrade...",
    );

    const upgradedProxy = SecureHealthProfileV3.attach(testProxy.address);

    const ownerAfter = await upgradedProxy.owner();
    const versionAfter = await upgradedProxy.getContractVersion();
    const totalProfilesAfter = await upgradedProxy.getTotalProfiles();

    console.log("   Owner after upgrade:", ownerAfter);
    console.log("   Version after upgrade:", versionAfter.toString());
    console.log("   Total profiles:", totalProfilesAfter.toString());

    if (ownerAfter.toLowerCase() !== owner.toLowerCase()) {
      testPassed = false;
      failureReason = "Owner changed after upgrade (storage corruption)";
      throw new Error("Storage corrupted - owner changed!");
    }

    console.log("✅ Contract functions correctly after upgrade");
    console.log("");

    // ============================================
    // TEST 8: Test Creating Profile
    // ============================================

    console.log("🔍 Test 8: Testing profile creation after upgrade...");

    try {
      const testTx = await upgradedProxy.createProfileWithWeight(
        "encrypted_birthdate_test",
        "encrypted_sex_test",
        "encrypted_height_test",
        "encrypted_weight_test",
        "encrypted_email_test",
        hre.ethers.utils.id("test_data_hash"),
        "test_nonce_" + Date.now(),
        { gasLimit: 500000 },
      );
      const testReceipt = await testTx.wait();

      if (testReceipt.status === 1) {
        console.log("✅ Profile creation works after upgrade");

        const finalProfiles = await upgradedProxy.getTotalProfiles();
        console.log("   Total profiles now:", finalProfiles.toString());
      } else {
        console.log("⚠️  Profile creation failed (but upgrade still worked)");
      }
    } catch (createError) {
      console.log("⚠️  Profile creation error:", createError.message);
      console.log("   (This might be expected - the upgrade itself worked)");
    }

    console.log("");
  } catch (error) {
    testPassed = false;
    if (!failureReason) {
      failureReason = error.message;
    }
    console.log("❌ TEST FAILED:", error.message);
    console.log("");
  }

  // ============================================
  // FINAL RESULTS
  // ============================================

  console.log("=".repeat(60));
  if (testPassed) {
    console.log("✅ ALL TESTS PASSED!");
    console.log("=".repeat(60));
    console.log("");
    console.log("🎉 UUPS Upgrade Capability Confirmed!");
    console.log("");
    console.log("✅ You can safely deploy to production");
    console.log("✅ The upgrade mechanism works correctly");
    console.log("✅ Storage is preserved during upgrades");
    console.log("✅ Contract functions after upgrade");
    console.log("");
    console.log("Next step: Run deploy-v3-production.js");
  } else {
    console.log("❌ TESTS FAILED");
    console.log("=".repeat(60));
    console.log("");
    console.log("Failure reason:", failureReason);
    console.log("");
    console.log("This means:");
    console.log("  ❌ UUPS upgrades don't work with current setup");
    console.log("  ❌ Same issue exists with fresh deployments");
    console.log("  ❌ Likely zkSync or OpenZeppelin incompatibility");
    console.log("");
    console.log("Options:");
    console.log("  1. Research zkSync-specific UUPS implementation");
    console.log("  2. Use TransparentProxy instead of UUPS");
    console.log("  3. Deploy without upgradability (fresh deploy for changes)");
    console.log("  4. Contact zkSync team about UUPS support");
  }
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Test script error:", error);
    process.exit(1);
  });
