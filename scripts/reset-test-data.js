const { ethers } = require("ethers");

// Contract addresses
const PROFILE_VERIFICATION_CONTRACT =
  "0xB7484a0D79BEe9d4caf50aD705565d99f624F44f";
const RPC_URL = "https://sepolia.era.zksync.dev";

// You'll need the private key of the contract owner
const OWNER_PRIVATE_KEY = process.env.CONTRACT_OWNER_PRIVATE_KEY;

if (!OWNER_PRIVATE_KEY) {
  console.log("❌ Set CONTRACT_OWNER_PRIVATE_KEY environment variable");
  console.log("   This should be the private key of the contract deployer");
  process.exit(1);
}

const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);

const verificationAbi = [
  "function resetUserVerification(address user) external",
  "function getUserVerification(address user) view returns (tuple(string email, address wallet, uint256 userId, uint256 timestamp, bool isActive, bool hasReceivedTokens, uint256 tokenAllocation))",
  "function getTotalVerifiedUsers() view returns (uint256)",
];

async function resetTestData() {
  console.log("🔄 Resetting test data...");

  const contract = new ethers.Contract(
    PROFILE_VERIFICATION_CONTRACT,
    verificationAbi,
    wallet,
  );

  // Get current verified users
  const totalUsers = await contract.getTotalVerifiedUsers();
  console.log(`Current verified users: ${totalUsers}`);

  // List of test wallet addresses to reset
  const testWallets = [
    "0xC367D68D58B09BFADCfDA95CB09b65417b43F6EA", // Your current wallet
    // Add more test wallets as needed
  ];

  for (const walletAddress of testWallets) {
    try {
      // Check if user exists
      const verification = await contract.getUserVerification(walletAddress);
      if (verification.email !== "") {
        console.log(
          `Resetting wallet: ${walletAddress} (${verification.email})`,
        );

        // Call reset function (you'll need to add this to your contract)
        // await contract.resetUserVerification(walletAddress);
        console.log("⚠️  Reset function not implemented in contract yet");
      }
    } catch (error) {
      console.log(
        `Wallet ${walletAddress} not found or error: ${error.message}`,
      );
    }
  }

  console.log("✅ Test data reset complete");
}

resetTestData().catch(console.error);
