/**
 * Add whitelisted emails from admin database to the new ProfileVerification contract
 *
 * This script reads emails from the admin database and adds them to the new contract
 */

const { ethers } = require("hardhat");
const Database = require("better-sqlite3");
const path = require("path");
require("dotenv").config();

const PROFILE_VERIFICATION_CONTRACT =
  "0xC9950703cE4eD704d2a0B075F7FAC3d968940f57";
const DB_PATH = path.join(
  __dirname,
  "../admin-app/admin-data/whitelist-tracking.db",
);

// ProfileVerification ABI (only the functions we need)
const PROFILE_VERIFICATION_ABI = [
  "function addEmailToWhitelist(string memory email) external",
  "function addEmailsToWhitelist(string[] memory emails) external",
  "function isEmailWhitelisted(string memory email) external view returns (bool)",
];

async function main() {
  console.log("\n📧 Adding emails to new ProfileVerification contract");
  console.log("====================================================\n");

  // Check for private key
  const privateKey = process.env.PRIVATE_KEY || process.env.ADMIN_PRIVATE_KEY;
  if (!privateKey) {
    console.error(
      "❌ Error: PRIVATE_KEY or ADMIN_PRIVATE_KEY not found in .env file",
    );
    process.exit(1);
  }

  // Connect to database
  if (!require("fs").existsSync(DB_PATH)) {
    console.error("❌ Error: Database not found at:", DB_PATH);
    process.exit(1);
  }

  const db = new Database(DB_PATH);

  // Get all whitelisted emails from database
  const whitelistedEmails = db
    .prepare(
      `
    SELECT email, email_hash, status 
    FROM whitelist_proofs 
    WHERE status = 'active'
    ORDER BY added_at ASC
  `,
    )
    .all();

  db.close();

  if (whitelistedEmails.length === 0) {
    console.log("⚠️  No active emails found in database");
    process.exit(0);
  }

  console.log(
    `📋 Found ${whitelistedEmails.length} active emails in database:\n`,
  );
  whitelistedEmails.forEach((item, index) => {
    console.log(`   ${index + 1}. ${item.email}`);
  });
  console.log();

  // Initialize blockchain connection
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

  // Check which emails are already whitelisted on blockchain
  console.log(
    "🔍 Checking which emails are already whitelisted on blockchain...\n",
  );
  const emailsToAdd = [];
  const alreadyWhitelisted = [];

  for (const item of whitelistedEmails) {
    try {
      const isWhitelisted = await contract.isEmailWhitelisted(item.email);
      if (isWhitelisted) {
        alreadyWhitelisted.push(item.email);
        console.log(`   ✓ ${item.email} - already whitelisted`);
      } else {
        emailsToAdd.push(item.email);
      }
    } catch (error) {
      console.warn(`   ⚠️  Error checking ${item.email}:`, error.message);
      emailsToAdd.push(item.email); // Add it anyway, will fail gracefully if needed
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Already whitelisted: ${alreadyWhitelisted.length}`);
  console.log(`   Need to add: ${emailsToAdd.length}\n`);

  if (emailsToAdd.length === 0) {
    console.log("✅ All emails are already whitelisted on the new contract!");
    process.exit(0);
  }

  // Add emails to blockchain
  // Use batch function if available, otherwise add one by one
  console.log("📤 Adding emails to blockchain...\n");

  if (emailsToAdd.length <= 50 && contract.addEmailsToWhitelist) {
    // Try batch add (more efficient)
    try {
      console.log(`   Adding ${emailsToAdd.length} emails in batch...`);
      const tx = await contract.addEmailsToWhitelist(emailsToAdd);
      console.log(`   ⏳ Transaction sent: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(
        `   ✅ Batch transaction confirmed: ${receipt.transactionHash}\n`,
      );

      emailsToAdd.forEach((email) => {
        console.log(`   ✓ Added: ${email}`);
      });
    } catch (error) {
      console.warn(
        `   ⚠️  Batch add failed, trying individual adds:`,
        error.message,
      );
      // Fall through to individual adds
    }
  }

  // If batch didn't work or wasn't available, add individually
  if (emailsToAdd.length > 0) {
    console.log(`\n📤 Adding emails individually...\n`);

    for (let i = 0; i < emailsToAdd.length; i++) {
      const email = emailsToAdd[i];
      try {
        console.log(`   [${i + 1}/${emailsToAdd.length}] Adding ${email}...`);
        const tx = await contract.addEmailToWhitelist(email);
        console.log(`      ⏳ Transaction: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`      ✅ Confirmed: ${receipt.transactionHash}\n`);
      } catch (error) {
        if (error.message.includes("already whitelisted")) {
          console.log(`      ⚠️  ${email} - already whitelisted (skipping)\n`);
        } else {
          console.error(`      ❌ Failed to add ${email}:`, error.message);
          console.log(`      Continuing with next email...\n`);
        }
      }
    }
  }

  // Verify final state
  console.log("\n🔍 Verifying final whitelist state...\n");
  let verifiedCount = 0;
  for (const item of whitelistedEmails) {
    try {
      const isWhitelisted = await contract.isEmailWhitelisted(item.email);
      if (isWhitelisted) {
        verifiedCount++;
        console.log(`   ✓ ${item.email}`);
      } else {
        console.log(`   ✗ ${item.email} - NOT whitelisted`);
      }
    } catch (error) {
      console.log(`   ⚠️  ${item.email} - error checking: ${error.message}`);
    }
  }

  console.log(`\n✅ Verification complete:`);
  console.log(`   Total emails in database: ${whitelistedEmails.length}`);
  console.log(`   Successfully whitelisted on blockchain: ${verifiedCount}`);

  if (verifiedCount < whitelistedEmails.length) {
    console.log(
      `   ⚠️  ${whitelistedEmails.length - verifiedCount} emails still need to be added`,
    );
  } else {
    console.log(`   🎉 All emails are now whitelisted on the new contract!`);
  }

  console.log(`\n🔗 Contract address: ${PROFILE_VERIFICATION_CONTRACT}`);
  console.log(
    `   View on explorer: https://sepolia.explorer.zksync.io/address/${PROFILE_VERIFICATION_CONTRACT}\n`,
  );
}

main()
  .then(() => {
    console.log("\n✅ Script completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  });
