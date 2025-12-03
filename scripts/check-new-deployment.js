const { ethers } = require("ethers");

// Current contract addresses from src/lib/zksync-sso-config.ts
const PROFILE_VERIFICATION_CONTRACT =
  "0xA2D3b1b8080895C5bE335d8352D867e4b6e51ab3";
const SECURE_HEALTH_PROFILE_CONTRACT =
  "0x2A8015613623A6A8D369BcDC2bd6DD202230785a";
const HEALTH_TOKEN_CONTRACT = "0x057df807987f284b55ba6A9ab89d089fd8398B99";

// Old contract addresses for comparison
const OLD_PROFILE_VERIFICATION = "0xB7484a0D79BEe9d4caf50aD705565d99f624F44f";
const OLD_SECURE_HEALTH_PROFILE = "0xb1e41c4913D52E20aAaF4728c0449Bc6320a45A3";

const provider = new ethers.JsonRpcProvider("https://sepolia.era.zksync.dev");

const verificationAbi = [
  "function getTotalVerifiedUsers() view returns (uint256)",
  "function getUserVerification(address) view returns (tuple(string email, address wallet, uint256 userId, uint256 timestamp, bool isActive, bool hasReceivedTokens, uint256 tokenAllocation))",
  "function getAllocationConfig() view returns (tuple(uint256 maxAllocations, uint256 allocationPerUser, uint256 totalAllocated, bool isActive))",
];

const profileAbi = [
  "function getTotalProfiles() view returns (uint256)",
  "function getVersion() view returns (uint8)",
  "function hasProfile(address) view returns (bool)",
];

async function checkContract(name, address, abi) {
  console.log(`\n=== Checking ${name} ===`);
  console.log(`Address: ${address}`);

  try {
    const code = await provider.getCode(address);
    if (code === "0x") {
      console.log("❌ Contract does not exist (no code at this address)");
      return null;
    }

    console.log("✅ Contract exists");
    const contract = new ethers.Contract(address, abi, provider);
    return contract;
  } catch (error) {
    console.log(`❌ Error checking contract: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log("🔍 Checking New Deployment Framework\n");
  console.log("=".repeat(60));

  // Check ProfileVerification contract
  const pvContract = await checkContract(
    "ProfileVerification (NEW)",
    PROFILE_VERIFICATION_CONTRACT,
    verificationAbi,
  );

  if (pvContract) {
    try {
      const totalUsers = await pvContract.getTotalVerifiedUsers();
      const config = await pvContract.getAllocationConfig();

      console.log(`\n📊 ProfileVerification Stats:`);
      console.log(`   Total Verified Users/Wallets: ${totalUsers.toString()}`);
      console.log(`   Max Allocations: ${config.maxAllocations.toString()}`);
      console.log(
        `   Allocation Per User: ${ethers.formatEther(config.allocationPerUser)} AHP`,
      );
      console.log(
        `   Total Allocated: ${ethers.formatEther(config.totalAllocated)} AHP`,
      );
      console.log(`   Is Active: ${config.isActive}`);
    } catch (error) {
      console.log(`⚠️ Error reading ProfileVerification: ${error.message}`);
    }
  }

  // Check SecureHealthProfile contract
  const shpContract = await checkContract(
    "SecureHealthProfile (NEW)",
    SECURE_HEALTH_PROFILE_CONTRACT,
    profileAbi,
  );

  if (shpContract) {
    try {
      const totalProfiles = await shpContract.getTotalProfiles();
      const version = await shpContract.getVersion();

      console.log(`\n📊 SecureHealthProfile Stats:`);
      console.log(`   Total Profiles: ${totalProfiles.toString()}`);
      console.log(`   Contract Version: ${version.toString()}`);
    } catch (error) {
      console.log(`⚠️ Error reading SecureHealthProfile: ${error.message}`);
    }
  }

  // Compare with old contracts
  console.log(`\n${"=".repeat(60)}`);
  console.log("\n🔍 Comparing with OLD Contracts\n");

  const oldPvContract = await checkContract(
    "ProfileVerification (OLD)",
    OLD_PROFILE_VERIFICATION,
    verificationAbi,
  );

  if (oldPvContract) {
    try {
      const oldTotalUsers = await oldPvContract.getTotalVerifiedUsers();
      console.log(`   Old Total Verified Users: ${oldTotalUsers.toString()}`);
    } catch (error) {
      console.log(`   ⚠️ Could not read old contract`);
    }
  }

  const oldShpContract = await checkContract(
    "SecureHealthProfile (OLD)",
    OLD_SECURE_HEALTH_PROFILE,
    profileAbi,
  );

  if (oldShpContract) {
    try {
      const oldTotalProfiles = await oldShpContract.getTotalProfiles();
      console.log(`   Old Total Profiles: ${oldTotalProfiles.toString()}`);
    } catch (error) {
      console.log(`   ⚠️ Could not read old contract`);
    }
  }

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log("\n📋 SUMMARY:\n");

  if (pvContract) {
    const totalUsers = await pvContract.getTotalVerifiedUsers();
    console.log(
      `✅ NEW ProfileVerification Contract: ${totalUsers.toString()} verified wallets`,
    );
  } else {
    console.log(`❌ NEW ProfileVerification Contract: NOT DEPLOYED`);
  }

  if (shpContract) {
    const totalProfiles = await shpContract.getTotalProfiles();
    console.log(
      `✅ NEW SecureHealthProfile Contract: ${totalProfiles.toString()} profiles`,
    );
  } else {
    console.log(`❌ NEW SecureHealthProfile Contract: NOT DEPLOYED`);
  }

  console.log(`\n${"=".repeat(60)}\n`);
}

main().catch(console.error);
