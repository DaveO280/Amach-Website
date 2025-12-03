/**
 * Check wallet balance on zkSync
 * Run with: node scripts/check-wallet-balance.js <wallet-address>
 */

const { ethers } = require("ethers");

const RPC_URL = "https://sepolia.era.zksync.dev";

async function main() {
  const walletAddress =
    process.argv[2] || "0x58147e61cc2683295c6eD00D5daeB8052B3D0c87";

  console.log("💰 Checking wallet balance...\n");
  console.log("👤 Wallet:", walletAddress);

  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

  const balance = await provider.getBalance(walletAddress);
  const balanceInEth = ethers.utils.formatEther(balance);

  console.log("\n📊 Balance:", balanceInEth, "ETH");
  console.log("    In Wei:", balance.toString());

  // Check transaction count to see if wallet is deployed
  const txCount = await provider.getTransactionCount(walletAddress);
  console.log("\n📋 Transaction count:", txCount);
  console.log(
    "    Wallet deployed:",
    txCount > 0 ? "Yes" : "Maybe not (or no txs yet)",
  );

  console.log("\n✅ Balance check complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });
