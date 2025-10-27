const { ethers } = require("hardhat");

async function main() {
  console.log("🔍 Checking wallet status on verification contract...");

  // Contract configuration
  const PROFILE_VERIFICATION_CONTRACT =
    "0xeae7936859433779f9529e4a00D2b5EA3eA7ED7f";
  const RPC_URL = "https://sepolia.era.zksync.dev";
  const WALLET_ADDRESS = "0xF3750F0a1F6E9e06a1887d7b9f3E638F8fA64759";

  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log("📝 Using account:", deployer.address);

  // Contract ABI
  const PROFILE_VERIFICATION_ABI = [
    "function isWalletInUse(address wallet) external view returns (bool)",
    "function walletToEmail(address wallet) external view returns (string)",
    "function isEmailWhitelisted(string memory email) external view returns (bool)",
    "function getUserVerification(string memory email) external view returns (tuple(string email, address wallet, uint256 userId, uint256 timestamp, bool isActive, bool hasReceivedTokens, uint256 tokenAllocation))",
  ];

  // Initialize provider and contract
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(
    PROFILE_VERIFICATION_CONTRACT,
    PROFILE_VERIFICATION_ABI,
    provider,
  );

  try {
    console.log(`\n🔍 Checking wallet: ${WALLET_ADDRESS}`);

    // Check if wallet is in use
    const isWalletInUse = await contract.isWalletInUse(WALLET_ADDRESS);
    console.log(`📱 Wallet in use: ${isWalletInUse ? "✅ Yes" : "❌ No"}`);

    if (isWalletInUse) {
      // Get the email associated with this wallet
      const associatedEmail = await contract.walletToEmail(WALLET_ADDRESS);
      console.log(`📧 Associated email: ${associatedEmail}`);

      // Check if that email is whitelisted
      const isEmailWhitelisted =
        await contract.isEmailWhitelisted(associatedEmail);
      console.log(`✅ Email whitelisted: ${isEmailWhitelisted ? "Yes" : "No"}`);

      if (associatedEmail) {
        // Get verification details
        try {
          const verification =
            await contract.getUserVerification(associatedEmail);
          console.log(`\n📊 Verification Details:`);
          console.log(`   User ID: ${verification.userId.toString()}`);
          console.log(`   Wallet: ${verification.wallet}`);
          console.log(
            `   Timestamp: ${new Date(Number(verification.timestamp) * 1000).toISOString()}`,
          );
          console.log(`   Active: ${verification.isActive}`);
          console.log(
            `   Has Received Tokens: ${verification.hasReceivedTokens}`,
          );
          console.log(
            `   Token Allocation: ${ethers.utils.formatEther(verification.tokenAllocation)} AHP`,
          );
        } catch (error) {
          console.log(
            `❌ Error getting verification details: ${error.message}`,
          );
        }
      }
    } else {
      console.log(
        `\n💡 This wallet is not registered in the verification system.`,
      );
      console.log(`   You can use it for verification!`);
    }

    // Also check your email separately
    console.log(`\n🔍 Checking email: ogara.d@gmail.com`);
    const isEmailWhitelisted =
      await contract.isEmailWhitelisted("ogara.d@gmail.com");
    console.log(`✅ Email whitelisted: ${isEmailWhitelisted ? "Yes" : "No"}`);

    if (isEmailWhitelisted) {
      console.log(`💡 Your email is whitelisted and ready for verification!`);
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// Execute
main()
  .then(() => {
    console.log("\n🎉 Wallet status check completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Check failed:", error);
    process.exit(1);
  });
