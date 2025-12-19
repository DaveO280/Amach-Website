/**
 * Sync emails to database from a list
 *
 * This script helps you manually add emails to the database
 * when you have the original email addresses that correspond
 * to the contract hashes.
 *
 * Usage:
 * 1. Create a file with one email per line: emails.txt
 * 2. Run: node scripts/sync-emails-to-database.js
 */

const Database = require("better-sqlite3");
const path = require("path");
const crypto = require("crypto");

const DB_PATH = path.join(
  __dirname,
  "../admin-app/admin-data/whitelist-tracking.db",
);

function hashEmail(email) {
  return crypto
    .createHash("sha256")
    .update(email.toLowerCase().trim())
    .digest("hex");
}

// Example: If you know which emails correspond to the hashes, list them here
// Or read from a file
const emailsToSync = [
  // Add your known emails here, one per line
  // Example:
  // "user1@example.com",
  // "user2@example.com",
  // etc.
];

async function syncEmails() {
  console.log("📧 Syncing emails to database...\n");

  if (emailsToSync.length === 0) {
    console.log("⚠️  No emails provided in emailsToSync array");
    console.log("\nTo use this script:");
    console.log("1. Edit this file and add emails to the emailsToSync array");
    console.log("2. Or modify to read from a file");
    console.log("3. Run: node scripts/sync-emails-to-database.js");
    return;
  }

  let db;
  try {
    db = new Database(DB_PATH);
    console.log("✅ Connected to database\n");

    // Initialize tables if needed
    db.exec(`
      CREATE TABLE IF NOT EXISTS whitelist_proofs (
        email TEXT NOT NULL PRIMARY KEY,
        email_hash TEXT NOT NULL UNIQUE,
        whitelist_proof TEXT,
        added_by TEXT NOT NULL,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'active'
      );
    `);

    let added = 0;
    let skipped = 0;
    let errors = 0;

    for (const email of emailsToSync) {
      try {
        const emailHash = hashEmail(email);

        // Check if already exists
        const existing = db
          .prepare(
            "SELECT email FROM whitelist_proofs WHERE email = ? OR email_hash = ?",
          )
          .get(email, emailHash);

        if (existing) {
          console.log(`⚠️  ${email} - already exists (skipping)`);
          skipped++;
          continue;
        }

        // Add to database
        db.prepare(
          `
          INSERT INTO whitelist_proofs (email, email_hash, whitelist_proof, added_by, status)
          VALUES (?, ?, ?, ?, 'active')
        `,
        ).run(email, emailHash, "", "manual_sync");

        console.log(`✅ Added: ${email}`);
        added++;
      } catch (error) {
        console.error(`❌ Error adding ${email}:`, error.message);
        errors++;
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("📊 SUMMARY");
    console.log("=".repeat(60));
    console.log(`Total emails: ${emailsToSync.length}`);
    console.log(`✅ Added: ${added}`);
    console.log(`⚠️  Skipped (already exists): ${skipped}`);
    console.log(`❌ Errors: ${errors}`);
    console.log("\n✅ Sync complete!");
  } catch (error) {
    console.error("❌ Database error:", error);
  } finally {
    if (db) db.close();
  }
}

syncEmails().catch(console.error);
