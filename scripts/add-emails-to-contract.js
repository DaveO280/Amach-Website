/**
 * Add emails to ProfileVerification contract whitelist
 *
 * Usage: node scripts/add-emails-to-contract.js email1@example.com email2@example.com ...
 * Or: node scripts/add-emails-to-contract.js (will prompt for emails)
 */

const { ethers } = require("hardhat");
require("dotenv").config();

const PROFILE_VERIFICATION_CONTRACT =
  "0xC9950703cE4eD704d2a0B075F7FAC3d968940f57";

// ProfileVerification ABI
const PROFILE_VERIFICATION_ABI = [
  "function addEmailToWhitelist(string memory email) external",
  "function addEmailsToWhitelist(string[] memory emails) external",
  "function isEmailWhitelisted(string memory email) external view returns (bool)",
];

async function main() {
  console.log("\n📧 Adding emails to ProfileVerification contract");
  console.log("================================================\n");

  // List of emails to whitelist - the 10 emails from admin database
  const emails = [
    "danstew@gmail.com",
    "aethergrounds@gmail.com",
    "Sayed_eng@yahoo.com",
    "aaron.snyder@gmail.com",
    "jesine.ogara@gmail.com",
    "Ldnrescue@gmail.com",
    "Iamcashcole@gmail.com",
    "mickyjoeteahan@gmail.com",
    "josh@prismbenefits.com",
    "ogara.d@gmail.com", // Already added, but will be checked
  ];

  if (emails.length === 0) {
    console.error(
      "❌ No emails specified in script. Please add emails to the array.",
    );
    process.exit(1);
  }

  console.log(`📋 Emails to add: ${emails.length}\n`);
  emails.forEach((email, index) => {
    console.log(`   ${index + 1}. ${email}`);
  });
  console.log();

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log(`📝 Using account: ${deployer.address}`);

  const balance = await deployer.provider.getBalance(deployer.address);
  console.log(`💰 Balance: ${ethers.utils.formatEther(balance)} ETH\n`);

  if (balance.lt(ethers.utils.parseEther("0.01"))) {
    console.error("❌ Insufficient balance (need at least 0.01 ETH)");
    process.exit(1);
  }

  // Connect to contract
  const contract = new ethers.Contract(
    PROFILE_VERIFICATION_CONTRACT,
    PROFILE_VERIFICATION_ABI,
    deployer,
  );

  // Check which emails are already whitelisted
  console.log("🔍 Checking current whitelist status...\n");
  const emailsToAdd = [];
  const alreadyWhitelisted = [];

  for (const email of emails) {
    try {
      const isWhitelisted = await contract.isEmailWhitelisted(email);
      if (isWhitelisted) {
        alreadyWhitelisted.push(email);
        console.log(`   ✓ ${email} - already whitelisted`);
      } else {
        emailsToAdd.push(email);
        console.log(`   ✗ ${email} - needs to be added`);
      }
    } catch (error) {
      console.warn(`   ⚠️  Error checking ${email}:`, error.message);
      emailsToAdd.push(email); // Try to add it anyway
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Already whitelisted: ${alreadyWhitelisted.length}`);
  console.log(`   Need to add: ${emailsToAdd.length}\n`);

  if (emailsToAdd.length === 0) {
    console.log("✅ All emails are already whitelisted!");
    process.exit(0);
  }

  // Try batch add first (more efficient)
  if (emailsToAdd.length > 1 && emailsToAdd.length <= 50) {
    try {
      console.log(
        `📤 Attempting batch add of ${emailsToAdd.length} emails...\n`,
      );
      const tx = await contract.addEmailsToWhitelist(emailsToAdd);
      console.log(`   ⏳ Transaction sent: ${tx.hash}`);
      console.log(`   Waiting for confirmation...`);
      const receipt = await tx.wait();
      console.log(`   ✅ Batch transaction confirmed!\n`);

      emailsToAdd.forEach((email) => {
        console.log(`   ✓ Added: ${email}`);
      });

      console.log(
        `\n🎉 Successfully added ${emailsToAdd.length} emails in one transaction!`,
      );
      process.exit(0);
    } catch (error) {
      if (error.message.includes("already whitelisted")) {
        console.log(
          `   ⚠️  Some emails already whitelisted, adding individually...\n`,
        );
      } else {
        console.log(`   ⚠️  Batch add failed: ${error.message}`);
        console.log(`   Falling back to individual adds...\n`);
      }
    }
  }

  // Add emails individually
  console.log(`📤 Adding emails individually...\n`);
  const successful = [];
  const failed = [];

  for (let i = 0; i < emailsToAdd.length; i++) {
    const email = emailsToAdd[i];
    try {
      console.log(`   [${i + 1}/${emailsToAdd.length}] Adding ${email}...`);
      const tx = await contract.addEmailToWhitelist(email);
      console.log(`      ⏳ Transaction: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`      ✅ Confirmed in block ${receipt.blockNumber}\n`);
      successful.push(email);
    } catch (error) {
      if (error.message.includes("already whitelisted")) {
        console.log(`      ⚠️  Already whitelisted (skipping)\n`);
        successful.push(email);
      } else {
        console.error(`      ❌ Failed: ${error.message}\n`);
        failed.push({ email, error: error.message });
      }
    }
  }

  // Final summary
  console.log("\n" + "=".repeat(50));
  console.log("📊 Final Summary");
  console.log("=".repeat(50));
  console.log(`   Total emails processed: ${emails.length}`);
  console.log(`   Successfully whitelisted: ${successful.length}`);
  console.log(`   Already whitelisted: ${alreadyWhitelisted.length}`);
  console.log(`   Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log(`\n   Failed emails:`);
    failed.forEach(({ email, error }) => {
      console.log(`     - ${email}: ${error}`);
    });
  }

  console.log(`\n🔗 Contract: ${PROFILE_VERIFICATION_CONTRACT}`);
  console.log(
    `   Explorer: https://sepolia.explorer.zksync.io/address/${PROFILE_VERIFICATION_CONTRACT}\n`,
  );

  if (successful.length + alreadyWhitelisted.length === emails.length) {
    console.log("🎉 All emails are now whitelisted!\n");
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  });
