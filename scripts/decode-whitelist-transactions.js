const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
  const RPC_URL =
    process.env.NEXT_PUBLIC_ZKSYNC_RPC_URL || "https://sepolia.era.zksync.dev";
  const USER = "0x5aE248bAb1B22690d9137B0F27b7fa3A89E01fa3";

  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

  console.log("🔍 Checking user account...\n");
  console.log("Address:", USER);

  const balance = await provider.getBalance(USER);
  console.log("Balance:", ethers.utils.formatEther(balance), "ETH");

  const nonce = await provider.getTransactionCount(USER);
  console.log("Nonce:", nonce);

  const code = await provider.getCode(USER);
  console.log("Is contract:", code !== "0x");
}

main().catch(console.error);
