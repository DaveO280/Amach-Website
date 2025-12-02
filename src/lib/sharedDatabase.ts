// Blockchain-based whitelist checker (no admin app needed!)
// This queries the ProfileVerification smart contract directly

import { keccak256, toBytes } from "viem";

// Hash email using keccak256 (matches Solidity implementation)
export function hashEmailForBlockchain(email: string): `0x${string}` {
  const normalizedEmail = email.toLowerCase().trim();
  return keccak256(toBytes(normalizedEmail));
}

// Check if email is whitelisted by querying blockchain directly
export async function isEmailWhitelisted(email: string): Promise<boolean> {
  try {
    console.log("🔍 Checking email whitelist on blockchain...");

    // Use viem directly for server-side blockchain queries (no wagmi needed)
    const { createPublicClient, http } = await import("viem");
    const { getContractAddresses } = await import("./networkConfig");
    const { profileVerificationAbi } = await import("./zksync-sso-config");

    const contracts = getContractAddresses();
    const { getActiveChain } = await import("./networkConfig");
    const chain = getActiveChain();

    // Create public client for blockchain queries
    const publicClient = createPublicClient({
      chain,
      transport: http(),
    });

    // Hash the email using keccak256 (same as contract)
    const emailHash = hashEmailForBlockchain(email);
    console.log("📧 Email:", email);
    console.log("🔐 Email hash:", emailHash);

    // Query blockchain for email hash
    const isWhitelisted = await publicClient.readContract({
      address: contracts.PROFILE_VERIFICATION_CONTRACT as `0x${string}`,
      abi: profileVerificationAbi,
      functionName: "isEmailWhitelisted",
      args: [email], // Contract handles hashing internally
    });

    console.log("✅ Whitelist status:", isWhitelisted);
    return isWhitelisted;
  } catch (error) {
    console.error("❌ Error checking email whitelist on blockchain:", error);
    // Fallback to false (safer to deny than allow)
    return false;
  }
}

// Utility function to hash email (SHA256 - for legacy/non-blockchain use)
export function hashEmail(email: string): string {
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(email.toLowerCase()).digest("hex");
}
