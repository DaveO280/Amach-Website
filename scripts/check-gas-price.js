/**
 * Check current zkSync gas prices
 */

const { ethers } = require("ethers");

const RPC_URL = "https://sepolia.era.zksync.dev";

async function main() {
  console.log("⛽ Checking zkSync Sepolia gas prices...\n");

  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

  const gasPrice = await provider.getGasPrice();

  console.log("Current Gas Price:");
  console.log("  - Wei:", gasPrice.toString());
  console.log("  - Gwei:", ethers.utils.formatUnits(gasPrice, "gwei"));

  console.log("\nRecommended transaction params:");
  const maxFeePerGas = (gasPrice * 150n) / 100n;
  const maxPriorityFeePerGas = (gasPrice * 10n) / 100n;

  console.log(
    "  - maxFeePerGas:",
    ethers.utils.formatUnits(maxFeePerGas, "gwei"),
    "gwei",
  );
  console.log(
    "  - maxPriorityFeePerGas:",
    ethers.utils.formatUnits(maxPriorityFeePerGas, "gwei"),
    "gwei",
  );

  console.log("\nWhat your transaction is using:");
  console.log("  - maxFeePerGas: 0.0000000375 gwei (37500000 wei)");
  console.log("  - maxPriorityFeePerGas: 0.0000000025 gwei (2500000 wei)");

  console.log("\n❌ PROBLEM: Your gas fees are WAY too low!");
  console.log(
    "   This could explain why zkSync bootloader is rejecting the transaction.",
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });
