/**
 * Test if V3_FromV1 functions are available
 */

const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
  console.log("🧪 Testing V3_FromV1 functions...\n");

  const RPC_URL =
    process.env.NEXT_PUBLIC_ZKSYNC_RPC_URL || "https://sepolia.era.zksync.dev";
  const PROXY_ADDRESS = "0x2A8015613623A6A8D369BcDC2bd6DD202230785a";

  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  console.log("📍 Proxy:", PROXY_ADDRESS);
  console.log("👤 Testing with:", wallet.address);

  // Test with V3 ABI
  const v3Abi = [
    "function getContractVersion() view returns (uint8)",
    "function addHealthEventWithStorj(string encryptedData, bytes32 searchTag, string storjUri, bytes32 contentHash) external",
    "function getWeight(address user) view returns (string)",
    "function createProfileWithWeight(string name, string age, string gender, string height, string encryptedEmail, string profilePictureUrl, bytes32 publicKeyHash, string encryptedWeight) external",
  ];

  const contract = new ethers.Contract(PROXY_ADDRESS, v3Abi, provider);

  // Test 1: getContractVersion
  try {
    const version = await contract.getContractVersion();
    console.log("✅ getContractVersion():", version.toString());
  } catch (e) {
    console.log("❌ getContractVersion() NOT FOUND");
  }

  // Test 2: Check function selector for addHealthEventWithStorj
  const iface = new ethers.utils.Interface(v3Abi);
  const selector = iface.getSighash("addHealthEventWithStorj");
  console.log("\n📝 Function selector for addHealthEventWithStorj:", selector);

  // Test 3: Try to call getWeight (will fail if no profile, but proves function exists)
  try {
    const weight = await contract.getWeight(wallet.address);
    console.log("✅ getWeight() returned:", weight || "(empty)");
  } catch (e) {
    if (e.message.includes("execution reverted")) {
      console.log(
        "✅ getWeight() EXISTS (reverted as expected - no weight set)",
      );
    } else {
      console.log("❌ getWeight() error:", e.message);
    }
  }

  // Test 4: Check bytecode to see if addHealthEventWithStorj selector exists
  console.log("\n🔍 Checking contract bytecode for function selectors...");
  const code = await provider.getCode(PROXY_ADDRESS);

  const addHealthEventWithStorjSelector = iface.getSighash(
    "addHealthEventWithStorj",
  );
  const hasAddHealthEventWithStorj = code.includes(
    addHealthEventWithStorjSelector.slice(2),
  );

  console.log(
    "  addHealthEventWithStorj selector:",
    addHealthEventWithStorjSelector,
  );
  console.log(
    "  Found in bytecode:",
    hasAddHealthEventWithStorj ? "✅ YES" : "❌ NO",
  );

  // Also check V2 function
  const v2Abi = [
    "function addHealthEventV2(bytes32 searchTag, string storjUri, bytes32 contentHash, bytes32 eventHash) external",
  ];
  const v2Iface = new ethers.utils.Interface(v2Abi);
  const addHealthEventV2Selector = v2Iface.getSighash("addHealthEventV2");
  const hasAddHealthEventV2 = code.includes(addHealthEventV2Selector.slice(2));

  console.log("  addHealthEventV2 selector:", addHealthEventV2Selector);
  console.log("  Found in bytecode:", hasAddHealthEventV2 ? "✅ YES" : "❌ NO");

  console.log("\n📋 Summary:");
  if (hasAddHealthEventWithStorj) {
    console.log("  ✅ Contract is V3_FromV1");
    console.log("  ✅ Use addHealthEventWithStorj()");
  } else if (hasAddHealthEventV2) {
    console.log("  ⚠️  Contract is V2");
    console.log("  ⚠️  Use addHealthEventV2()");
  } else {
    console.log("  ❌ Neither V2 nor V3 functions found");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });
