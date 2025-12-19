/**
 * Test calling addHealthEventWithStorj through the proxy
 */

const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
  console.log("🧪 Testing addHealthEventWithStorj through proxy...\n");

  const RPC_URL =
    process.env.NEXT_PUBLIC_ZKSYNC_RPC_URL || "https://sepolia.era.zksync.dev";
  const PROXY_ADDRESS = "0x2A8015613623A6A8D369BcDC2bd6DD202230785a";

  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  console.log("📍 Proxy:", PROXY_ADDRESS);
  console.log("👤 Wallet:", wallet.address);

  // V3 ABI
  const v3Abi = [
    "function addHealthEventWithStorj(string encryptedData, bytes32 searchTag, string storjUri, bytes32 contentHash) external",
    "function getContractVersion() view returns (uint8)",
    "function getTotalProfiles() view returns (uint256)",
  ];

  const contract = new ethers.Contract(PROXY_ADDRESS, v3Abi, wallet);

  // Check version
  const version = await contract.getContractVersion();
  console.log("📌 Contract version:", version.toString());

  const profiles = await contract.getTotalProfiles();
  console.log("👥 Total profiles:", profiles.toString());

  // Test parameters (dummy data)
  const encryptedData = ""; // Empty as per V3 design
  const searchTag = ethers.utils.formatBytes32String("test");
  const storjUri = "storj://test/path";
  const contentHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test"));

  console.log("\n🔍 Testing static call...");
  try {
    await contract.callStatic.addHealthEventWithStorj(
      encryptedData,
      searchTag,
      storjUri,
      contentHash,
    );
    console.log("✅ Static call succeeded!");
  } catch (e) {
    console.log("❌ Static call failed:", e.reason || e.message);

    // Try to decode the error
    if (e.data) {
      console.log("Error data:", e.data);
    }
  }

  console.log("\n📋 Summary:");
  console.log(
    "  If static call succeeded: ✅ addHealthEventWithStorj is available",
  );
  console.log(
    '  If failed with "Profile not found": ✅ Function works, need to test with actual profile',
  );
  console.log("  If failed with other error: ❌ Need to investigate");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });
