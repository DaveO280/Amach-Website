const { ethers } = require("hardhat");

async function main() {
  console.log("🔍 Checking user allocation status...");

  // Contract addresses
  const PROFILE_VERIFICATION_ADDRESS =
    "0x2C35eBf2085e5d1224Fb170A1594E314Dea6B759";
  const HEALTH_TOKEN_ADDRESS = "0xb697C5f2c72e8598714D31ED105723f9C65531C2";

  // Get contract instances
  const profileVerification = await ethers.getContractAt(
    "ProfileVerification",
    PROFILE_VERIFICATION_ADDRESS,
  );
  const healthToken = await ethers.getContractAt(
    "IERC20",
    HEALTH_TOKEN_ADDRESS,
  );

  // Check all verified users
  console.log("\n📊 All verified users:");
  const totalUsers = await profileVerification.getTotalVerifiedUsers();
  console.log("Total verified users:", totalUsers.toString());

  // Check specific wallet addresses that might be in use
  const testAddresses = [
    "0xC9fFD981932FA4F91A0f31184264Ce079d196c48", // Deployer account
    "0xF3750F0a1F6E9e06a1887d7b9f3E638F8fA64759", // From earlier check
  ];

  for (const address of testAddresses) {
    console.log(`\n🔍 Checking wallet: ${address}`);

    try {
      // Check if wallet is verified
      const isVerified = await profileVerification.isUserVerified(address);
      console.log("Is verified:", isVerified);

      if (isVerified) {
        const verification =
          await profileVerification.getUserVerification(address);
        console.log("Email:", verification.email);
        console.log(
          "Token allocation:",
          ethers.utils.formatEther(verification.tokenAllocation),
          "AHP",
        );
        console.log("Has claimed:", verification.hasReceivedTokens);
        console.log("User ID:", verification.userId.toString());

        // Check token balance
        const balance = await healthToken.balanceOf(address);
        console.log("Current $AHP balance:", ethers.utils.formatEther(balance));
      } else {
        console.log("❌ Wallet not verified");
      }
    } catch (error) {
      console.log("❌ Error checking wallet:", error.message);
    }
  }

  // Check by email
  console.log("\n📧 Checking by email: ogara.d@gmail.com");
  try {
    const isInUse = await profileVerification.isEmailInUse("ogara.d@gmail.com");
    console.log("Email in use:", isInUse);

    if (isInUse) {
      const walletAddress =
        await profileVerification.emailToWallet("ogara.d@gmail.com");
      console.log("Linked wallet:", walletAddress);

      const verification =
        await profileVerification.getUserVerification(walletAddress);
      console.log(
        "Token allocation:",
        ethers.utils.formatEther(verification.tokenAllocation),
        "AHP",
      );
      console.log("Has claimed:", verification.hasReceivedTokens);
    }
  } catch (error) {
    console.log("❌ Error checking email:", error.message);
  }

  console.log("\n✅ User allocation check completed!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
