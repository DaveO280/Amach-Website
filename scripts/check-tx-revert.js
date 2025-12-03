/**
 * Check Transaction Revert Reason
 */

const { ethers } = require("ethers");
require("dotenv").config();

const RPC_URL = process.env.ZKSYNC_RPC_URL || "https://sepolia.era.zksync.dev";
const TX_HASH =
  "0x5d180736ffafdd77879772e2e49b7b136fd7ca776ea92a895e647aae07441c78";

async function checkTxRevert() {
  console.log("\n🔍 Checking Transaction Revert Reason");
  console.log("======================================");
  console.log(`TX Hash: ${TX_HASH}\n`);

  try {
    const network = { name: "zksync-sepolia", chainId: 300 };
    const provider = new ethers.providers.StaticJsonRpcProvider(
      RPC_URL,
      network,
    );

    // Get transaction receipt
    const receipt = await provider.getTransactionReceipt(TX_HASH);

    if (!receipt) {
      console.log("❌ Transaction not found");
      return;
    }

    console.log(`Status: ${receipt.status === 1 ? "✅ Success" : "❌ Failed"}`);
    console.log(`Block: ${receipt.blockNumber}`);
    console.log(`Gas Used: ${receipt.gasUsed.toString()}\n`);

    if (receipt.status === 0) {
      console.log("Transaction reverted. Attempting to get revert reason...\n");

      // Get the transaction
      const tx = await provider.getTransaction(TX_HASH);

      try {
        // Try to call the transaction to get the revert reason
        await provider.call(tx, tx.blockNumber);
        console.log(
          "⚠️  Could not determine revert reason using provider.call",
        );
      } catch (error) {
        if (error.message) {
          console.log("📋 Revert reason:");
          console.log(error.message);

          // Try to extract the actual revert message
          if (error.data) {
            console.log("\n📋 Revert data:", error.data);
          }

          // Check for common revert patterns
          if (error.message.includes("User not active")) {
            console.log("\n💡 The contract says: User not active");
            console.log("This means the user was already deactivated.");
          } else if (error.message.includes("Ownable")) {
            console.log("\n💡 Ownership Error:");
            console.log("The caller is not the contract owner.");
          } else if (error.message.includes("already")) {
            console.log("\n💡 The email or wallet is already in use.");
          }
        } else {
          console.log("⚠️  Could not extract revert reason");
        }
      }
    }

    // Also check the logs
    if (receipt.logs && receipt.logs.length > 0) {
      console.log(`\n📋 Transaction logs (${receipt.logs.length}):`);
      receipt.logs.forEach((log, i) => {
        console.log(`\nLog ${i + 1}:`);
        console.log(`  Address: ${log.address}`);
        console.log(`  Topics: ${log.topics.join(", ")}`);
        console.log(`  Data: ${log.data}`);
      });
    }
  } catch (error) {
    console.error("\n❌ Error:", error.message);
  }
}

checkTxRevert();
