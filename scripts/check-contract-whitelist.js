const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
  const RPC_URL =
    process.env.NEXT_PUBLIC_ZKSYNC_RPC_URL || "https://sepolia.era.zksync.dev";
  const PROXY_ADDRESS = "0x2A8015613623A6A8D369BcDC2bd6DD202230785a";

  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

  console.log("🔍 Checking for whitelist or access control...\n");

  const abi = [
    "function whitelistedUsers(address) view returns (bool)",
    "function isWhitelisted(address) view returns (bool)",
    "function isAuthorizedProtocol(address) view returns (bool)",
    "function hasProfile(address) view returns (bool)",
    "function isProfileActive(address) view returns (bool)",
  ];

  const contract = new ethers.Contract(PROXY_ADDRESS, abi, provider);
  const USER = "0x5aE248bAb1B22690d9137B0F27b7fa3A89E01fa3";

  // Try each potential access control function
  const checks = [
    { name: "whitelistedUsers", fn: () => contract.whitelistedUsers(USER) },
    { name: "isWhitelisted", fn: () => contract.isWhitelisted(USER) },
    {
      name: "isAuthorizedProtocol",
      fn: () => contract.isAuthorizedProtocol(USER),
    },
    { name: "hasProfile", fn: () => contract.hasProfile(USER) },
    { name: "isProfileActive", fn: () => contract.isProfileActive(USER) },
  ];

  for (const check of checks) {
    try {
      const result = await check.fn();
      console.log(`✅ ${check.name}:`, result);
    } catch (e) {
      console.log(`ℹ️  ${check.name}: not available`);
    }
  }
}

main().catch(console.error);
