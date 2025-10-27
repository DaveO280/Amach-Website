const { ethers } = require("hardhat");

async function main() {
  console.log("🔐 Verifying user wallet...");

  // Get the deployer account (for admin operations)
  const [deployer] = await ethers.getSigners();
  console.log("📝 Admin account:", deployer.address);

  // Contract addresses
  const PROFILE_VERIFICATION_ADDRESS =
    "0x2C35eBf2085e5d1224Fb170A1594E314Dea6B759";

  // User's wallet address (the one you're using in the browser)
  const userWalletAddress = "0xF3750F0a1F6E9e06a1887d7b9f3E638F8fA64759";
  const userEmail = "ogara.d@gmail.com";

  // Get contract instance
  const profileVerification = await ethers.getContractAt(
    "ProfileVerification",
    PROFILE_VERIFICATION_ADDRESS,
  );

  console.log(`\n🎯 Setting up verification for wallet: ${userWalletAddress}`);
  console.log(`📧 Email: ${userEmail}`);

  // Check current status
  console.log("\n🔍 Checking current status...");
  const isVerified =
    await profileVerification.isUserVerified(userWalletAddress);
  const isEmailInUse = await profileVerification.isEmailInUse(userEmail);

  console.log("Wallet verified:", isVerified);
  console.log("Email in use:", isEmailInUse);

  if (isEmailInUse) {
    console.log("\n⚠️ Email is already in use by another wallet");
    const linkedWallet = await profileVerification.emailToWallet(userEmail);
    console.log("Linked to wallet:", linkedWallet);

    if (linkedWallet.toLowerCase() !== userWalletAddress.toLowerCase()) {
      console.log(
        "❌ Email is linked to a different wallet. Need to use a different email or unlink the current one.",
      );
      return;
    }
  }

  if (!isVerified) {
    console.log("\n🔐 Verifying profile for user wallet...");

    // Create a signer for the user wallet (this simulates the user signing)
    // In real usage, this would be done through the frontend with the user's wallet
    const userSigner = await ethers.getImpersonatedSigner(userWalletAddress);

    try {
      // Call verifyProfileZKsync with the user's wallet
      const verifyTx = await profileVerification
        .connect(userSigner)
        .verifyProfileZKsync(userEmail);
      await verifyTx.wait();
      console.log("✅ Profile verification successful for user wallet!");

      // Check verification status
      const verification =
        await profileVerification.getUserVerification(userWalletAddress);
      console.log("\n📊 Verification details:");
      console.log("Email:", verification.email);
      console.log("Wallet:", verification.wallet);
      console.log(
        "Token allocation:",
        ethers.utils.formatEther(verification.tokenAllocation),
        "AHP",
      );
      console.log("Has claimed:", verification.hasReceivedTokens);
      console.log("User ID:", verification.userId.toString());
    } catch (error) {
      console.error("❌ Verification failed:", error.message);
    }
  } else {
    console.log("✅ Wallet is already verified!");
    const verification =
      await profileVerification.getUserVerification(userWalletAddress);
    console.log(
      "Token allocation:",
      ethers.utils.formatEther(verification.tokenAllocation),
      "AHP",
    );
    console.log("Has claimed:", verification.hasReceivedTokens);
  }

  console.log("\n✅ User wallet verification completed!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
