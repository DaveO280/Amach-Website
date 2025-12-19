/**
 * Check user profile and permissions
 */

const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
  console.log("🔍 Checking user profile and permissions...\n");

  const RPC_URL =
    process.env.NEXT_PUBLIC_ZKSYNC_RPC_URL || "https://sepolia.era.zksync.dev";
  const PROXY_ADDRESS = "0x2A8015613623A6A8D369BcDC2bd6DD202230785a";
  const USER_ADDRESS = "0x5aE248bAb1B22690d9137B0F27b7fa3A89E01fa3";

  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

  console.log("📍 Contract:", PROXY_ADDRESS);
  console.log("👤 User:", USER_ADDRESS);

  const abi = [
    "function isProfileActive(address user) view returns (bool)",
    "function getProfile(address user) view returns (tuple(string name, string age, string gender, string height, string encryptedEmail, string profilePictureUrl, bytes32 publicKeyHash, bool isActive, uint256 createdAt))",
    "function getHealthTimeline(address user) view returns (tuple(uint256 timestamp, bytes32 searchTag, bool isDeleted, bytes32 deletionHash)[])",
    "function getContractVersion() view returns (uint8)",
    "function isWhitelisted(address user) view returns (bool)",
    "function eventStorjUri(address user, uint256 index) view returns (string)",
    "function eventContentHash(address user, uint256 index) view returns (bytes32)",
  ];

  const contract = new ethers.Contract(PROXY_ADDRESS, abi, provider);

  // 1. Check version
  try {
    const version = await contract.getContractVersion();
    console.log("\n✅ Contract version:", version.toString());
  } catch (e) {
    console.log("\n❌ getContractVersion failed:", e.message);
  }

  // 2. Check if profile is active
  try {
    const isActive = await contract.isProfileActive(USER_ADDRESS);
    console.log("✅ Profile active:", isActive);
  } catch (e) {
    console.log("❌ isProfileActive failed:", e.message);
  }

  // 3. Check if whitelisted (if function exists)
  try {
    const isWhitelisted = await contract.isWhitelisted(USER_ADDRESS);
    console.log("✅ Whitelisted:", isWhitelisted);
  } catch (e) {
    console.log(
      "ℹ️  isWhitelisted not available (may not exist on this version)",
    );
  }

  // 4. Get full profile
  try {
    const profile = await contract.getProfile(USER_ADDRESS);
    console.log("\n📋 Profile Details:");
    console.log("  Name:", profile.name);
    console.log("  Age:", profile.age);
    console.log("  Gender:", profile.gender);
    console.log("  Active:", profile.isActive);
    console.log(
      "  Created:",
      new Date(Number(profile.createdAt) * 1000).toISOString(),
    );
  } catch (e) {
    console.log("\n❌ getProfile failed:", e.message);
  }

  // 5. Get timeline events
  try {
    const timeline = await contract.getHealthTimeline(USER_ADDRESS);
    console.log("\n📋 Timeline Events:", timeline.length);

    for (let i = 0; i < timeline.length; i++) {
      const event = timeline[i];
      console.log(`\n  Event ${i}:`);
      console.log(
        "    Timestamp:",
        new Date(Number(event.timestamp) * 1000).toISOString(),
      );
      console.log("    SearchTag:", event.searchTag);
      console.log("    Deleted:", event.isDeleted);

      // Get Storj URI and content hash
      try {
        const storjUri = await contract.eventStorjUri(USER_ADDRESS, i);
        const contentHash = await contract.eventContentHash(USER_ADDRESS, i);
        console.log("    Storj URI:", storjUri || "(empty)");
        console.log("    Content Hash:", contentHash || "(empty)");
      } catch (e) {
        console.log("    ⚠️  Could not fetch Storj data:", e.message);
      }
    }
  } catch (e) {
    console.log("\n❌ getHealthTimeline failed:", e.message);
  }

  // 6. Try to simulate the transaction
  console.log("\n🧪 Testing static call with actual transaction data...");
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const contractWithSigner = contract.connect(wallet);

  const encryptedData = "";
  const searchTag =
    "0x0258aee730f0d40290ba2490fe526c4d9e1f69374eeb5b29d897e25907428eca";
  const storjUri =
    "storj://amach-health-464a2ccf9897e268/timeline-event/1765557810011-d6eca946.enc";
  const contentHash =
    "0xb87e879f1db74466dfa39ebb9527a7961f97eb34d059bbe02559b107ef3ecb50";

  try {
    // Try with USER_ADDRESS (the one that failed)
    await contractWithSigner.callStatic.addHealthEventWithStorj(
      encryptedData,
      searchTag,
      storjUri,
      contentHash,
      { from: USER_ADDRESS },
    );
    console.log("✅ Static call SUCCEEDED for user");
  } catch (e) {
    console.log("❌ Static call FAILED for user:", e.reason || e.message);
    if (e.error && e.error.data) {
      console.log("   Error data:", e.error.data);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });
