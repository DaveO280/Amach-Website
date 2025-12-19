/**
 * Check if SecureHealthProfile contract has been upgraded to V3
 */
const { ethers } = require("ethers");

async function main() {
  const RPC_URL =
    process.env.NEXT_PUBLIC_ZKSYNC_RPC_URL || "https://sepolia.era.zksync.dev";
  const CONTRACT_ADDRESS = "0x2A8015613623A6A8D369BcDC2bd6DD202230785a";

  console.log("🔍 Checking contract version...");
  console.log(`📬 Contract address: ${CONTRACT_ADDRESS}`);
  console.log(`🔗 RPC URL: ${RPC_URL}`);

  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

  // Check if getVersion function exists
  const abi = [
    {
      inputs: [],
      name: "getVersion",
      outputs: [{ name: "", type: "uint8" }],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [],
      name: "getTotalProfiles",
      outputs: [{ name: "", type: "uint256" }],
      stateMutability: "view",
      type: "function",
    },
  ];

  const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);

  try {
    const version = await contract.getVersion();
    console.log(`✅ Contract version: ${version}`);

    const totalProfiles = await contract.getTotalProfiles();
    console.log(`📊 Total profiles: ${totalProfiles}`);

    // Check if createProfileWithWeight function exists by calling it with invalid data
    // (this will revert but we can see if the function exists)
    const abiV3 = [
      {
        inputs: [
          { name: "encryptedBirthDate", type: "string" },
          { name: "encryptedSex", type: "string" },
          { name: "encryptedHeight", type: "string" },
          { name: "encryptedWeight", type: "string" },
          { name: "encryptedEmail", type: "string" },
          { name: "dataHash", type: "bytes32" },
          { name: "nonce", type: "string" },
        ],
        name: "createProfileWithWeight",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
      },
    ];

    const contractV3 = new ethers.Contract(CONTRACT_ADDRESS, abiV3, provider);

    // Try to estimate gas for the function (this will fail if function doesn't exist)
    try {
      await contractV3.createProfileWithWeight.staticCall(
        "",
        "",
        "",
        "",
        "",
        ethers.constants.HashZero,
        "",
        { from: ethers.constants.AddressZero },
      );
    } catch (error) {
      if (
        error.message.includes("function does not exist") ||
        error.code === "CALL_EXCEPTION"
      ) {
        console.log(
          "❌ createProfileWithWeight function NOT found - contract is NOT V3",
        );
        console.log("⚠️  You need to upgrade the proxy to V3 implementation");
        return;
      }
      // If we get a revert with a custom error, the function exists
      console.log(
        "✅ createProfileWithWeight function EXISTS - contract appears to be V3",
      );
      console.log(
        `   (Got expected revert: ${error.message.substring(0, 100)}...)`,
      );
    }
  } catch (error) {
    console.error("❌ Error checking contract:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
