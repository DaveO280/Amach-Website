import { NextRequest, NextResponse } from "next/server";

// Force Node.js runtime for ethers.js compatibility
export const runtime = "nodejs";

import { ethers } from "ethers";

// Contract configuration
const PROFILE_VERIFICATION_CONTRACT =
  process.env.PROFILE_VERIFICATION_CONTRACT ||
  "0x87B69bDBa7e9E15E7e8e3337D76c62A2b6A78356";
const RPC_URL = process.env.ZKSYNC_RPC_URL || "https://sepolia.era.zksync.dev";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";

// Contract ABI
const PROFILE_VERIFICATION_ABI = [
  "function addEmailToWhitelist(string memory email) external",
  "function addEmailsToWhitelist(string[] memory emails) external",
  "function removeEmailFromWhitelist(string memory email) external",
  "function isEmailWhitelisted(string memory email) external view returns (bool)",
  "function isEmailInUse(string memory email) external view returns (bool)",
];

// Known whitelisted emails from deployment (this should ideally be tracked from events)
const knownWhitelistedEmails = [
  "admin@amachhealth.com",
  "test@amachhealth.com",
  "user1@example.com",
  "user2@example.com",
  "user3@example.com",
  "ogara.d@gmail.com", // Added via script
  "user@amachhealth.com", // Added via script
  "tbh81_99@yahoo.com", // From admin dashboard
  "beta.tester@amachhealth.com", // From admin dashboard
];

export async function GET(): Promise<NextResponse> {
  try {
    // Remove authentication requirement for now to debug
    // const authHeader = request.headers.get('authorization');
    // if (!authHeader || !authHeader.startsWith('Bearer ')) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }

    // Initialize provider and contract
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL, {
      name: "zksync-sepolia",
      chainId: 300,
    });
    const contract = new ethers.Contract(
      PROFILE_VERIFICATION_CONTRACT,
      PROFILE_VERIFICATION_ABI,
      provider,
    );

    // Check which emails are actually whitelisted on-chain
    const whitelistEntries = [];

    for (const email of knownWhitelistedEmails) {
      try {
        const isWhitelisted = await contract.isEmailWhitelisted(email);
        if (isWhitelisted) {
          whitelistEntries.push({
            email,
            isWhitelisted: true,
            addedAt: new Date().toISOString(),
            addedBy: "admin",
          });
        }
      } catch (error) {
        console.error(`Error checking email ${email}:`, error);
      }
    }

    return NextResponse.json(whitelistEntries);
  } catch (error) {
    console.error("Failed to get email whitelist:", error);
    return NextResponse.json(
      { error: "Failed to fetch email whitelist" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Temporarily remove authentication for debugging
    // const authHeader = request.headers.get('authorization');
    // if (!authHeader || !authHeader.startsWith('Bearer ')) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }

    const { email, action } = await request.json();

    if (!email || !action) {
      return NextResponse.json(
        { error: "Email and action are required" },
        { status: 400 },
      );
    }

    // Initialize provider, signer, and contract with explicit network config
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL, {
      name: "zksync-sepolia",
      chainId: 300,
    });

    if (!PRIVATE_KEY) {
      return NextResponse.json(
        { error: "Private key not configured" },
        { status: 500 },
      );
    }

    const signer = new ethers.Wallet(PRIVATE_KEY, provider);
    const contract = new ethers.Contract(
      PROFILE_VERIFICATION_CONTRACT,
      PROFILE_VERIFICATION_ABI,
      signer,
    );

    let tx: ethers.ContractTransaction;

    if (action === "add") {
      // Check if email is already whitelisted
      const isAlreadyWhitelisted = await contract.isEmailWhitelisted(email);
      if (isAlreadyWhitelisted) {
        return NextResponse.json(
          { error: "Email is already whitelisted" },
          { status: 400 },
        );
      }

      tx = await contract.addEmailToWhitelist(email);
      await tx.wait();

      // Update known emails list
      if (!knownWhitelistedEmails.includes(email)) {
        knownWhitelistedEmails.push(email);
      }
    } else if (action === "remove") {
      // Check if email is whitelisted
      const isWhitelisted = await contract.isEmailWhitelisted(email);
      if (!isWhitelisted) {
        return NextResponse.json(
          { error: "Email is not whitelisted" },
          { status: 400 },
        );
      }

      tx = await contract.removeEmailFromWhitelist(email);
      await tx.wait();

      // Update known emails list
      const index = knownWhitelistedEmails.indexOf(email);
      if (index > -1) {
        knownWhitelistedEmails.splice(index, 1);
      }
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "add" or "remove"' },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      transactionHash: tx.hash,
      email,
      action,
    });
  } catch (error) {
    console.error("Failed to modify email whitelist:", error);
    return NextResponse.json(
      { error: "Failed to modify email whitelist" },
      { status: 500 },
    );
  }
}
