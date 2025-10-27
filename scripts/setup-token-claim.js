const { ethers } = require("hardhat");

async function main() {
  console.log("🔧 Setting up token claim system...");

  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log("📝 Setting up with account:", deployer.address);

  // Contract addresses from latest deployment
  const HEALTH_TOKEN_ADDRESS = "0xb697C5f2c72e8598714D31ED105723f9C65531C2";
  const PROFILE_VERIFICATION_ADDRESS =
    "0x2C35eBf2085e5d1224Fb170A1594E314Dea6B759";

  // Get contract instances
  const healthToken = await ethers.getContractAt(
    "HealthToken",
    HEALTH_TOKEN_ADDRESS,
  );
  const profileVerification = await ethers.getContractAt(
    "ProfileVerification",
    PROFILE_VERIFICATION_ADDRESS,
  );

  console.log(
    "\n📊 Current token balance of deployer:",
    ethers.utils.formatEther(await healthToken.balanceOf(deployer.address)),
    "AHP",
  );
  console.log(
    "📊 Current token balance of ProfileVerification:",
    ethers.utils.formatEther(
      await healthToken.balanceOf(PROFILE_VERIFICATION_ADDRESS),
    ),
    "AHP",
  );

  // Set the health token address in ProfileVerification contract
  console.log("\n🔗 Setting health token address in ProfileVerification...");
  const setTokenTx =
    await profileVerification.setHealthToken(HEALTH_TOKEN_ADDRESS);
  await setTokenTx.wait();
  console.log("✅ Health token address set in ProfileVerification");

  // Transfer tokens to ProfileVerification contract for distribution
  // We'll transfer enough for 100 allocations (100,000 tokens)
  const tokensToTransfer = ethers.utils.parseEther("100000"); // 100,000 AHP tokens

  console.log("\n💰 Transferring tokens to ProfileVerification contract...");
  const transferTx = await healthToken.transfer(
    PROFILE_VERIFICATION_ADDRESS,
    tokensToTransfer,
  );
  await transferTx.wait();
  console.log(
    "✅ Transferred",
    ethers.utils.formatEther(tokensToTransfer),
    "AHP tokens to ProfileVerification",
  );

  // Verify final balances
  console.log("\n📊 Final balances:");
  console.log(
    "Deployer balance:",
    ethers.utils.formatEther(await healthToken.balanceOf(deployer.address)),
    "AHP",
  );
  console.log(
    "ProfileVerification balance:",
    ethers.utils.formatEther(
      await healthToken.balanceOf(PROFILE_VERIFICATION_ADDRESS),
    ),
    "AHP",
  );

  // Test the claim function setup
  console.log("\n🔍 Verifying setup...");
  try {
    const tokenAddress = await profileVerification.healthToken();
    console.log("✅ Health token address in contract:", tokenAddress);
    console.log("✅ Token claim system setup complete!");
  } catch (error) {
    console.error("❌ Error verifying setup:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
