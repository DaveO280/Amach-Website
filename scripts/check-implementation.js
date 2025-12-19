/**
 * Check the implementation contract directly
 */

const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
  console.log("🔍 Checking implementation contract...\n");

  const RPC_URL =
    process.env.NEXT_PUBLIC_ZKSYNC_RPC_URL || "https://sepolia.era.zksync.dev";
  const IMPLEMENTATION_ADDRESS = "0x378e8ec2507c6987a3A2a075bB9c21817e4e8453";

  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

  console.log("📍 Implementation:", IMPLEMENTATION_ADDRESS);

  // Get implementation bytecode
  const code = await provider.getCode(IMPLEMENTATION_ADDRESS);
  console.log("📦 Bytecode length:", code.length, "characters");

  // Check for function selectors
  const v3Abi = [
    "function addHealthEventWithStorj(string encryptedData, bytes32 searchTag, string storjUri, bytes32 contentHash) external",
  ];
  const v2Abi = [
    "function addHealthEventV2(bytes32 searchTag, string storjUri, bytes32 contentHash, bytes32 eventHash) external",
  ];

  const v3Iface = new ethers.utils.Interface(v3Abi);
  const v2Iface = new ethers.utils.Interface(v2Abi);

  const v3Selector = v3Iface.getSighash("addHealthEventWithStorj");
  const v2Selector = v2Iface.getSighash("addHealthEventV2");

  console.log("\n🔍 Checking for function selectors:");
  console.log("  addHealthEventWithStorj:", v3Selector);
  console.log(
    "    Found:",
    code.includes(v3Selector.slice(2)) ? "✅ YES" : "❌ NO",
  );

  console.log("  addHealthEventV2:", v2Selector);
  console.log(
    "    Found:",
    code.includes(v2Selector.slice(2)) ? "✅ YES" : "❌ NO",
  );

  // Try calling functions through the implementation directly
  const implContract = new ethers.Contract(
    IMPLEMENTATION_ADDRESS,
    [
      "function getContractVersion() view returns (uint8)",
      "function addHealthEventWithStorj(string encryptedData, bytes32 searchTag, string storjUri, bytes32 contentHash) external",
    ],
    provider,
  );

  try {
    const version = await implContract.getContractVersion();
    console.log(
      "\n✅ Implementation getContractVersion():",
      version.toString(),
    );
  } catch (e) {
    console.log("\n❌ getContractVersion() failed:", e.message);
  }

  console.log("\n📋 Summary:");
  if (code.includes(v3Selector.slice(2))) {
    console.log("  ✅ Implementation HAS addHealthEventWithStorj");
  } else if (code.includes(v2Selector.slice(2))) {
    console.log("  ⚠️  Implementation only has addHealthEventV2");
  } else {
    console.log("  ❌ Implementation missing both functions");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });
