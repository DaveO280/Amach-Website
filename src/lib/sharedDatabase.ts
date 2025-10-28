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

    // Dynamic import to avoid issues with SSR
    const { readContract } = await import("@wagmi/core");
    const {
      wagmiConfig,
      profileVerificationAbi,
      PROFILE_VERIFICATION_CONTRACT,
    } = await import("./zksync-sso-config");

    // Hash the email using keccak256 (same as contract)
    const emailHash = hashEmailForBlockchain(email);
    console.log("📧 Email:", email);
    console.log("🔐 Email hash:", emailHash);

    // Query blockchain for email hash
    const isWhitelisted = await readContract(wagmiConfig, {
      address: PROFILE_VERIFICATION_CONTRACT,
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

// Legacy API-based checker (keep for admin app usage)
export async function isEmailWhitelistedViaAPI(
  email: string,
): Promise<boolean> {
  try {
    const adminApiUrl =
      process.env.ADMIN_API_URL || "http://localhost:3001/api";
    const apiKey = process.env.ADMIN_API_KEY;

    if (!apiKey) {
      console.error("❌ ADMIN_API_KEY not configured");
      return false;
    }

    const response = await fetch(`${adminApiUrl}/whitelist/check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      console.error("Admin app API not available:", response.status);
      return false;
    }

    const data = await response.json();
    return data.isWhitelisted === true;
  } catch (error) {
    console.error("Error checking email whitelist via API:", error);
    return false;
  }
}

// Utility function to hash email (SHA256 - for non-blockchain use)
export function hashEmail(email: string): string {
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(email.toLowerCase()).digest("hex");
}

// Get all whitelisted emails (for admin purposes)
export async function getWhitelistedEmails(): Promise<
  Array<{
    email: string;
    status: string;
    addedAt: string;
    addedBy: string;
  }>
> {
  try {
    const adminApiUrl =
      process.env.ADMIN_API_URL || "http://localhost:3001/api";
    const apiKey = process.env.ADMIN_API_KEY;

    if (!apiKey) {
      console.error("❌ ADMIN_API_KEY not configured");
      return [];
    }

    const response = await fetch(`${adminApiUrl}/whitelist`, {
      headers: {
        "x-api-key": apiKey,
      },
    });

    if (!response.ok) {
      console.error("Admin app API not available:", response.status);
      return [];
    }

    const data = await response.json();
    return data.whitelist || [];
  } catch (error) {
    console.error("Error getting whitelisted emails:", error);
    return [];
  }
}

// Add email to whitelist
export async function addEmailToWhitelist(
  email: string,
  addedBy: string = "admin@amachhealth.com",
): Promise<boolean> {
  try {
    const adminApiUrl =
      process.env.ADMIN_API_URL || "http://localhost:3001/api";
    const apiKey = process.env.ADMIN_API_KEY;

    if (!apiKey) {
      console.error("❌ ADMIN_API_KEY not configured");
      return false;
    }

    const response = await fetch(`${adminApiUrl}/whitelist/add`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ email, addedBy }),
    });

    if (!response.ok) {
      console.error("Failed to add email to whitelist:", response.status);
      return false;
    }

    const data = await response.json();
    return data.success === true;
  } catch (error) {
    console.error("Error adding email to whitelist:", error);
    return false;
  }
}

// Remove email from whitelist
export async function removeEmailFromWhitelist(
  email: string,
): Promise<boolean> {
  try {
    const adminApiUrl =
      process.env.ADMIN_API_URL || "http://localhost:3001/api";
    const apiKey = process.env.ADMIN_API_KEY;

    if (!apiKey) {
      console.error("❌ ADMIN_API_KEY not configured");
      return false;
    }

    const response = await fetch(`${adminApiUrl}/whitelist/remove`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      console.error("Failed to remove email from whitelist:", response.status);
      return false;
    }

    const data = await response.json();
    return data.success === true;
  } catch (error) {
    console.error("Error removing email from whitelist:", error);
    return false;
  }
}

// Update email status
export async function updateEmailStatus(
  email: string,
  status: "active" | "inactive" | "suspended",
): Promise<boolean> {
  try {
    const adminApiUrl =
      process.env.ADMIN_API_URL || "http://localhost:3001/api";
    const apiKey = process.env.ADMIN_API_KEY;

    if (!apiKey) {
      console.error("❌ ADMIN_API_KEY not configured");
      return false;
    }

    const response = await fetch(`${adminApiUrl}/whitelist/update-status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ email, status }),
    });

    if (!response.ok) {
      console.error("Failed to update email status:", response.status);
      return false;
    }

    const data = await response.json();
    return data.success === true;
  } catch (error) {
    console.error("Error updating email status:", error);
    return false;
  }
}
