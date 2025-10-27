const { ethers } = require("hardhat");

async function main() {
  console.log("🎁 Setting up allocation for user wallet...");

  // Get the deployer account (for admin operations)
  const [deployer] = await ethers.getSigners();
  console.log("📝 Admin account:", deployer.address);

  // Contract addresses
  const PROFILE_VERIFICATION_ADDRESS =
    "0x2C35eBf2085e5d1224Fb170A1594E314Dea6B759";
  const HEALTH_TOKEN_ADDRESS = "0xb697C5f2c72e8598714D31ED105723f9C65531C2";

  // User's wallet address (the one you're using in the browser)
  const userWalletAddress = "0xF3750F0a1F6E9e06a1887d7b9f3E638F8fA64759";
  const userEmail = "user@amachhealth.com"; // Different email for this wallet

  // Get contract instances
  const profileVerification = await ethers.getContractAt(
    "ProfileVerification",
    PROFILE_VERIFICATION_ADDRESS,
  );
  const healthToken = await ethers.getContractAt(
    "IERC20",
    HEALTH_TOKEN_ADDRESS,
  );

  console.log(`\n🎯 Setting up allocation for wallet: ${userWalletAddress}`);
  console.log(`📧 Using email: ${userEmail}`);

  // Add email to whitelist
  console.log("\n📝 Adding email to whitelist...");
  const addEmailTx = await profileVerification.addEmailToWhitelist(userEmail);
  await addEmailTx.wait();
  console.log("✅ Email added to whitelist");

  // Verify the profile for the user wallet
  console.log("\n🔐 Verifying profile...");

  // Create a signer for the user wallet
  const userSigner = await ethers.getImpersonatedSigner(userWalletAddress);

  const verifyTx = await profileVerification
    .connect(userSigner)
    .verifyProfileZKsync(userEmail);
  await verifyTx.wait();
  console.log("✅ Profile verification successful!");

  // Check verification status
  console.log("\n📊 Verification details:");
  const verification =
    await profileVerification.getUserVerification(userWalletAddress);
  console.log("Email:", verification.email);
  console.log("Wallet:", verification.wallet);
  console.log(
    "Token allocation:",
    ethers.utils.formatEther(verification.tokenAllocation),
    "AHP",
  );
  console.log("Has claimed:", verification.hasReceivedTokens);
  console.log("User ID:", verification.userId.toString());

  // Check token balance
  const balance = await healthToken.balanceOf(userWalletAddress);
  console.log("Current $AHP balance:", ethers.utils.formatEther(balance));

  console.log("\n✅ User allocation setup completed!");
  console.log("\n🎯 Next steps:");
  console.log("1. Go to your wallet page in the browser");
  console.log("2. You should now see the 1000 $AHP allocation");
  console.log("3. Click 'Claim Allocation' to receive the tokens");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
