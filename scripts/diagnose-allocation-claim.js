/**
 * Diagnose why allocation claim is failing
 * Checks all requirements for claimAllocation()
 */

const { ethers } = require("ethers");

const PROFILE_VERIFICATION_CONTRACT =
  "0xC9950703cE4eD704d2a0B075F7FAC3d968940f57";
const HEALTH_TOKEN_CONTRACT = "0x057df807987f284b55ba6A9ab89d089fd8398B99";
const USER_WALLET = "0x58147e61cc2683295c6eD00D5daeB8052B3D0c87";
const RPC_URL = "https://sepolia.era.zksync.dev";

const VERIFICATION_ABI = [
  "function userVerifications(address) external view returns (tuple(string email, address wallet, uint256 userId, uint256 timestamp, bool isActive, bool hasReceivedTokens, uint256 tokenAllocation))",
  "function healthToken() external view returns (address)",
  "function isUserVerified(address user) external view returns (bool)",
];

const TOKEN_ABI = [
  "function balanceOf(address) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",
];

async function main() {
  console.log("🔍 Diagnosing allocation claim issue...\n");
  console.log("📋 Details:");
  console.log("   Verification contract:", PROFILE_VERIFICATION_CONTRACT);
  console.log("   Health token:", HEALTH_TOKEN_CONTRACT);
  console.log("   User wallet:", USER_WALLET);

  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const verificationContract = new ethers.Contract(
    PROFILE_VERIFICATION_CONTRACT,
    VERIFICATION_ABI,
    provider,
  );

  console.log("\n🔍 Checking claimAllocation requirements...\n");

  // Requirement 1: User must be verified (isActive = true)
  console.log("1️⃣ Is user verified?");
  try {
    const isVerified = await verificationContract.isUserVerified(USER_WALLET);
    console.log("   ✅ User verified:", isVerified);

    if (!isVerified) {
      console.log("   ❌ FAILED: User is not verified!");
      console.log("   → You must verify your profile first before claiming");
      return;
    }
  } catch (err) {
    console.log("   ❌ Error checking verification:", err.message);
  }

  // Get full verification data
  console.log("\n2️⃣ Checking user verification details...");
  try {
    const verification =
      await verificationContract.userVerifications(USER_WALLET);
    console.log("   Email:", verification.email);
    console.log("   User ID:", verification.userId.toString());
    console.log("   Is Active:", verification.isActive);
    console.log("   Has Received Tokens:", verification.hasReceivedTokens);
    console.log(
      "   Token Allocation:",
      ethers.utils.formatEther(verification.tokenAllocation),
      "AHP",
    );

    // Requirement 2: tokenAllocation > 0
    if (verification.tokenAllocation.eq(0)) {
      console.log("\n   ❌ FAILED: No allocation available!");
      console.log(
        "   → Token allocation is 0 - you may have verified before allocation was set up",
      );
      return;
    } else {
      console.log(
        "   ✅ Allocation available:",
        ethers.utils.formatEther(verification.tokenAllocation),
        "AHP",
      );
    }

    // Requirement 3: hasReceivedTokens = false
    if (verification.hasReceivedTokens) {
      console.log("\n   ❌ FAILED: Tokens already claimed!");
      console.log("   → You have already claimed your allocation");
      return;
    } else {
      console.log("   ✅ Tokens not yet claimed");
    }
  } catch (err) {
    console.log("   ❌ Error:", err.message);
  }

  // Requirement 4: Health token address must be set
  console.log("\n3️⃣ Checking health token configuration...");
  try {
    const healthTokenAddress = await verificationContract.healthToken();
    console.log("   Health token address:", healthTokenAddress);

    if (healthTokenAddress === ethers.constants.AddressZero) {
      console.log("   ❌ FAILED: Health token not set!");
      console.log("   → Contract admin needs to call setHealthToken()");
      return;
    } else {
      console.log("   ✅ Health token is set");
    }

    // Check if it matches expected address
    if (
      healthTokenAddress.toLowerCase() !== HEALTH_TOKEN_CONTRACT.toLowerCase()
    ) {
      console.log(
        "   ⚠️  WARNING: Health token address doesn't match expected!",
      );
      console.log("       Expected:", HEALTH_TOKEN_CONTRACT);
      console.log("       Actual:", healthTokenAddress);
    }
  } catch (err) {
    console.log("   ❌ Error:", err.message);
  }

  // Requirement 5: Contract must have enough tokens
  console.log("\n4️⃣ Checking if contract has enough tokens...");
  try {
    const tokenContract = new ethers.Contract(
      HEALTH_TOKEN_CONTRACT,
      TOKEN_ABI,
      provider,
    );

    const contractBalance = await tokenContract.balanceOf(
      PROFILE_VERIFICATION_CONTRACT,
    );
    console.log(
      "   Contract balance:",
      ethers.utils.formatEther(contractBalance),
      "AHP",
    );

    const verification =
      await verificationContract.userVerifications(USER_WALLET);
    const requiredAmount = verification.tokenAllocation;

    if (contractBalance.lt(requiredAmount)) {
      console.log("   ❌ FAILED: Contract doesn't have enough tokens!");
      console.log(
        "       Required:",
        ethers.utils.formatEther(requiredAmount),
        "AHP",
      );
      console.log(
        "       Available:",
        ethers.utils.formatEther(contractBalance),
        "AHP",
      );
      console.log("   → Contract admin needs to fund the contract with tokens");
      return;
    } else {
      console.log("   ✅ Contract has sufficient tokens");
    }
  } catch (err) {
    console.log("   ⚠️  Error checking balance:", err.message);
    console.log(
      "       (This might be because the health token contract is not deployed)",
    );
  }

  console.log("\n✅ All requirements passed!");
  console.log("   The claim should work. If it's still failing, check:");
  console.log("   - Gas limit (should be high enough, now set to 5M)");
  console.log("   - Transaction simulation errors in browser console");
  console.log("   - Privy wallet connection status");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  });
