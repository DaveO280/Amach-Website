/**
 * Clear User Registration Script
 *
 * This script calls the deactivateUser function on the ProfileVerification contract
 * to clear an existing email/wallet registration.
 *
 * Usage: node scripts/clear-user-registration.js <wallet-address>
 */

const { ethers } = require("ethers");
require("dotenv").config();

// Contract configuration
const PROFILE_VERIFICATION_CONTRACT =
  process.env.PROFILE_VERIFICATION_CONTRACT ||
  "0xA2D3b1b8080895C5bE335d8352D867e4b6e51ab3";
const RPC_URL = process.env.ZKSYNC_RPC_URL || "https://sepolia.era.zksync.dev";

// Contract ABI (only the functions we need)
const PROFILE_VERIFICATION_ABI = [
  "function deactivateUser(address user) external",
  "function getUserVerification(address user) external view returns (tuple(string email, address wallet, uint256 userId, uint256 timestamp, bool isActive, bool hasReceivedTokens, uint256 tokenAllocation))",
  "function owner() external view returns (address)",
];

async function clearUserRegistration() {
  try {
    // Get wallet address from command line argument
    const walletToDeactivate = process.argv[2];
    if (!walletToDeactivate) {
      console.error("❌ Error: Please provide a wallet address to deactivate");
      console.log(
        "\nUsage: node scripts/clear-user-registration.js <wallet-address>",
      );
      console.log(
        "Example: node scripts/clear-user-registration.js 0x58147e61cc2683295c6eD00D5daeB8052B3D0c87",
      );
      process.exit(1);
    }

    // Validate wallet address format
    if (!ethers.utils.isAddress(walletToDeactivate)) {
      console.error("❌ Error: Invalid wallet address format");
      process.exit(1);
    }

    console.log("\n🔍 Clear User Registration Script");
    console.log("=====================================");
    console.log(`Wallet to deactivate: ${walletToDeactivate}`);
    console.log(`Contract: ${PROFILE_VERIFICATION_CONTRACT}`);
    console.log(`Network: zkSync Sepolia\n`);

    // Check for private key
    const privateKey =
      process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY;
    if (!privateKey) {
      console.error(
        "❌ Error: DEPLOYER_PRIVATE_KEY or PRIVATE_KEY not found in .env file",
      );
      console.log("\nThis script requires the contract owner's private key.");
      console.log("Add it to your .env file:");
      console.log("PRIVATE_KEY=your_private_key_here");
      process.exit(1);
    }

    // Initialize provider and wallet
    const network = {
      name: "zksync-sepolia",
      chainId: 300,
    };
    const provider = new ethers.providers.StaticJsonRpcProvider(
      RPC_URL,
      network,
    );
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log(`📝 Using wallet: ${wallet.address}`);

    // Initialize contract
    const contract = new ethers.Contract(
      PROFILE_VERIFICATION_CONTRACT,
      PROFILE_VERIFICATION_ABI,
      wallet,
    );

    // Check if the signer is the owner
    const owner = await contract.owner();
    console.log(`🔐 Contract owner: ${owner}`);

    if (wallet.address.toLowerCase() !== owner.toLowerCase()) {
      console.error("\n❌ Error: Your wallet is not the contract owner");
      console.log("Only the contract owner can deactivate users.");
      process.exit(1);
    }

    // Get current user verification status
    console.log("\n📋 Checking current user verification...");
    try {
      const verification =
        await contract.getUserVerification(walletToDeactivate);
      console.log(`Email: ${verification.email}`);
      console.log(`User ID: ${verification.userId.toString()}`);
      console.log(`Is Active: ${verification.isActive}`);
      console.log(
        `Token Allocation: ${ethers.utils.formatEther(verification.tokenAllocation)} AHP`,
      );
      console.log(`Has Received Tokens: ${verification.hasReceivedTokens}`);

      if (!verification.isActive) {
        console.log("\n⚠️  User is already deactivated. No action needed.");
        process.exit(0);
      }
    } catch (error) {
      console.log("⚠️  User verification not found or already cleared.");
      console.log("Continuing anyway to ensure cleanup...\n");
    }

    // Confirm action
    console.log(
      "\n⚠️  WARNING: This will deactivate the user and clear their registration.",
    );
    console.log(
      "The email will be freed up and can be used for a new registration.",
    );
    console.log("\nProceeding with deactivation...\n");

    // Get current gas price and set higher fees for zkSync
    const gasPrice = await provider.getGasPrice();
    const maxFeePerGas = gasPrice.mul(150).div(100); // 50% buffer
    const maxPriorityFeePerGas = gasPrice.mul(10).div(100); // 10% tip

    // Call deactivateUser function
    console.log("📤 Sending transaction to deactivate user...");
    const tx = await contract.deactivateUser(walletToDeactivate, {
      gasLimit: 200000,
      maxFeePerGas,
      maxPriorityFeePerGas,
    });

    console.log(`Transaction sent: ${tx.hash}`);
    console.log("⏳ Waiting for confirmation...");

    const receipt = await tx.wait();
    console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
    console.log(`Gas used: ${receipt.gasUsed.toString()}`);

    // Verify deactivation
    console.log("\n🔍 Verifying deactivation...");
    try {
      const verification =
        await contract.getUserVerification(walletToDeactivate);
      if (!verification.isActive) {
        console.log("✅ User successfully deactivated!");
        console.log(
          `The email "${verification.email}" is now freed up for new registration.`,
        );
      } else {
        console.log("⚠️  User still appears active. Check transaction status.");
      }
    } catch (error) {
      console.log(
        "⚠️  Could not verify final status, but transaction succeeded.",
      );
    }

    console.log("\n✅ Done!");
    console.log(
      "\nYou can now complete the wallet setup wizard with the same email.",
    );
    console.log(
      `View transaction on zkSync Explorer: https://sepolia.explorer.zksync.io/tx/${tx.hash}`,
    );
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    if (error.reason) {
      console.error("Reason:", error.reason);
    }
    if (error.transaction) {
      console.error("Transaction:", error.transaction);
    }
    process.exit(1);
  }
}

// Run the script
clearUserRegistration();
