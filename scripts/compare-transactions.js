/**
 * Compare successful profile creation tx with failed verification tx
 */

const { ethers } = require("ethers");

const RPC_URL = "https://sepolia.era.zksync.dev";

const SUCCESSFUL_TX =
  "0x9a6f21647ad0b44fc9cbd66bbbdae1e0a0fb2d12c5f7f38d8eb3d63c94c0f3f2"; // Profile creation
const FAILED_TX =
  "0x69dbf3b5c67a54e5c83de82b8a81cd23e855bab8ea4113d55bad3e9b9a93dfa6"; // Verification

async function main() {
  console.log("🔍 Comparing successful vs failed transactions...\n");

  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

  // Get successful transaction
  console.log("✅ Successful Transaction (Profile Creation):");
  console.log("   Hash:", SUCCESSFUL_TX);
  try {
    const successTx = await provider.getTransaction(SUCCESSFUL_TX);
    const successReceipt = await provider.getTransactionReceipt(SUCCESSFUL_TX);

    console.log("\n   Transaction Details:");
    console.log("   - From:", successTx.from);
    console.log("   - To:", successTx.to);
    console.log("   - Gas Limit:", successTx.gasLimit.toString());
    console.log(
      "   - Gas Price:",
      successTx.gasPrice
        ? ethers.utils.formatUnits(successTx.gasPrice, "gwei") + " gwei"
        : "N/A",
    );
    console.log(
      "   - Max Fee Per Gas:",
      successTx.maxFeePerGas
        ? ethers.utils.formatUnits(successTx.maxFeePerGas, "gwei") + " gwei"
        : "N/A",
    );
    console.log(
      "   - Max Priority Fee:",
      successTx.maxPriorityFeePerGas
        ? ethers.utils.formatUnits(successTx.maxPriorityFeePerGas, "gwei") +
            " gwei"
        : "N/A",
    );
    console.log("   - Nonce:", successTx.nonce);
    console.log("   - Type:", successTx.type);
    console.log(
      "   - Value:",
      ethers.utils.formatEther(successTx.value),
      "ETH",
    );

    if (successReceipt) {
      console.log("\n   Receipt:");
      console.log(
        "   - Status:",
        successReceipt.status === 1 ? "Success" : "Failed",
      );
      console.log("   - Gas Used:", successReceipt.gasUsed.toString());
      console.log("   - Block:", successReceipt.blockNumber);
    }
  } catch (err) {
    console.log("   Error:", err.message);
  }

  // Get failed transaction
  console.log("\n\n❌ Failed Transaction (Verification):");
  console.log("   Hash:", FAILED_TX);
  try {
    const failedTx = await provider.getTransaction(FAILED_TX);
    const failedReceipt = await provider.getTransactionReceipt(FAILED_TX);

    console.log("\n   Transaction Details:");
    console.log("   - From:", failedTx.from);
    console.log("   - To:", failedTx.to);
    console.log("   - Gas Limit:", failedTx.gasLimit.toString());
    console.log(
      "   - Gas Price:",
      failedTx.gasPrice
        ? ethers.utils.formatUnits(failedTx.gasPrice, "gwei") + " gwei"
        : "N/A",
    );
    console.log(
      "   - Max Fee Per Gas:",
      failedTx.maxFeePerGas
        ? ethers.utils.formatUnits(failedTx.maxFeePerGas, "gwei") + " gwei"
        : "N/A",
    );
    console.log(
      "   - Max Priority Fee:",
      failedTx.maxPriorityFeePerGas
        ? ethers.utils.formatUnits(failedTx.maxPriorityFeePerGas, "gwei") +
            " gwei"
        : "N/A",
    );
    console.log("   - Nonce:", failedTx.nonce);
    console.log("   - Type:", failedTx.type);
    console.log("   - Value:", ethers.utils.formatEther(failedTx.value), "ETH");

    if (failedReceipt) {
      console.log("\n   Receipt:");
      console.log(
        "   - Status:",
        failedReceipt.status === 1 ? "Success" : "Failed",
      );
      console.log("   - Gas Used:", failedReceipt.gasUsed.toString());
      console.log("   - Block:", failedReceipt.blockNumber);
    }
  } catch (err) {
    console.log("   Error:", err.message);
  }

  // Compare
  console.log("\n\n📊 Key Differences:");
  console.log("   Run the comparison above to see differences in:");
  console.log("   - Gas parameters");
  console.log("   - Transaction type");
  console.log("   - Contract addresses");
  console.log("   - Nonce sequencing");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });
