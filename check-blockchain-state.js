const { ethers } = require("ethers");

const PROFILE_VERIFICATION_CONTRACT =
  "0xB7484a0D79BEe9d4caf50aD705565d99f624F44f";
const HEALTH_TOKEN_CONTRACT = "0xBcd8dC8A5F1A6A704c10A7A3c78d2048dAC224c7";

const provider = new ethers.providers.JsonRpcProvider(
  "https://sepolia.era.zksync.dev",
);

const verificationAbi = [
  "function getTotalVerifiedUsers() view returns (uint256)",
  "function getUserVerification(address) view returns (tuple(string email, address wallet, uint256 userId, uint256 timestamp, bool isActive, bool hasReceivedTokens, uint256 tokenAllocation))",
  "function getAllocationConfig() view returns (tuple(uint256 totalAllocated, uint256 maxAllocations, uint256 allocationPerUser, bool isActive))",
];

const tokenAbi = [
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
];

async function checkState() {
  console.log("🔍 Checking Fresh Deployment State...\n");

  const verificationContract = new ethers.Contract(
    PROFILE_VERIFICATION_CONTRACT,
    verificationAbi,
    provider,
  );
  const tokenContract = new ethers.Contract(
    HEALTH_TOKEN_CONTRACT,
    tokenAbi,
    provider,
  );

  const totalUsers = await verificationContract.getTotalVerifiedUsers();
  const allocationConfig = await verificationContract.getAllocationConfig();
  const totalSupply = await tokenContract.totalSupply();
  const contractBalance = await tokenContract.balanceOf(
    PROFILE_VERIFICATION_CONTRACT,
  );

  console.log(
    "📊 ProfileVerification Contract:",
    PROFILE_VERIFICATION_CONTRACT,
  );
  console.log("   Total Verified Users:", totalUsers.toString());
  console.log(
    "   Total Allocated:",
    ethers.utils.formatEther(allocationConfig.totalAllocated),
    "AHP",
  );
  console.log(
    "   Allocation Per User:",
    ethers.utils.formatEther(allocationConfig.allocationPerUser),
    "AHP",
  );
  console.log("   Is Active:", allocationConfig.isActive);

  console.log("\n💰 HealthToken Contract:", HEALTH_TOKEN_CONTRACT);
  console.log("   Total Supply:", ethers.utils.formatEther(totalSupply), "AHP");
  console.log(
    "   Contract Balance:",
    ethers.utils.formatEther(contractBalance),
    "AHP",
  );

  // Check specific wallet
  const testWallet = "0xC367D68D58B09BFADCfDA95CB09b65417b43F6EA";
  console.log("\n👤 Checking wallet:", testWallet);
  const verification =
    await verificationContract.getUserVerification(testWallet);
  console.log("   Email:", verification.email);
  console.log("   Is Active:", verification.isActive);
  console.log("   Has Claimed:", verification.hasReceivedTokens);
  console.log(
    "   Allocation:",
    ethers.utils.formatEther(verification.tokenAllocation),
    "AHP",
  );
}

checkState().catch(console.error);
