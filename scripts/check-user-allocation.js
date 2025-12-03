/**
 * Check user allocation status using getUserVerification function
 */

const { ethers } = require("ethers");

const PROFILE_VERIFICATION_CONTRACT =
  "0xC9950703cE4eD704d2a0B075F7FAC3d968940f57";
const USER_WALLET = "0x58147e61cc2683295c6eD00D5daeB8052B3D0c87";
const RPC_URL = "https://sepolia.era.zksync.dev";

const ABI = [
  "function getUserVerification(address user) external view returns (tuple(string email, address wallet, uint256 userId, uint256 timestamp, bool isActive, bool hasReceivedTokens, uint256 tokenAllocation) verification)",
  "function healthToken() external view returns (address)",
];

async function main() {
  console.log("🔍 Checking user allocation...\n");

  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(
    PROFILE_VERIFICATION_CONTRACT,
    ABI,
    provider,
  );

  try {
    const verification = await contract.getUserVerification(USER_WALLET);

    console.log("📊 User Verification:");
    console.log("   Email:", verification.email);
    console.log("   Wallet:", verification.wallet);
    console.log("   User ID:", verification.userId.toString());
    console.log(
      "   Timestamp:",
      new Date(verification.timestamp.toNumber() * 1000).toLocaleString(),
    );
    console.log("   Is Active:", verification.isActive);
    console.log("   Has Received Tokens:", verification.hasReceivedTokens);
    console.log(
      "   Token Allocation:",
      ethers.utils.formatEther(verification.tokenAllocation),
      "AHP",
    );

    console.log("\n🔍 Claim Requirements Check:");

    let canClaim = true;

    if (!verification.isActive) {
      console.log("   ❌ User is not active");
      canClaim = false;
    } else {
      console.log("   ✅ User is active");
    }

    if (verification.tokenAllocation.eq(0)) {
      console.log("   ❌ No allocation (0 AHP)");
      canClaim = false;
    } else {
      console.log(
        "   ✅ Has allocation:",
        ethers.utils.formatEther(verification.tokenAllocation),
        "AHP",
      );
    }

    if (verification.hasReceivedTokens) {
      console.log("   ❌ Tokens already claimed");
      canClaim = false;
    } else {
      console.log("   ✅ Tokens not yet claimed");
    }

    const healthToken = await contract.healthToken();
    if (healthToken === ethers.constants.AddressZero) {
      console.log("   ❌ Health token not set");
      canClaim = false;
    } else {
      console.log("   ✅ Health token configured:", healthToken);
    }

    // Check contract token balance
    const tokenAbi = [
      "function balanceOf(address) external view returns (uint256)",
    ];
    const tokenContract = new ethers.Contract(healthToken, tokenAbi, provider);
    const contractBalance = await tokenContract.balanceOf(
      PROFILE_VERIFICATION_CONTRACT,
    );

    console.log(
      "\n💰 Contract Token Balance:",
      ethers.utils.formatEther(contractBalance),
      "AHP",
    );

    if (contractBalance.lt(verification.tokenAllocation)) {
      console.log("   ❌ Contract doesn't have enough tokens!");
      console.log(
        "       Needs:",
        ethers.utils.formatEther(verification.tokenAllocation),
        "AHP",
      );
      console.log(
        "       Has:",
        ethers.utils.formatEther(contractBalance),
        "AHP",
      );
      canClaim = false;
    } else {
      console.log("   ✅ Contract has sufficient balance");
    }

    if (canClaim) {
      console.log("\n✅ User CAN claim allocation!");
    } else {
      console.log("\n❌ User CANNOT claim allocation - see issues above");
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });
