const db = require("better-sqlite3")("./admin-data/whitelist-tracking.db");

console.log("🔍 Checking foreign key relationships...\n");

// Get all tables
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table'")
  .all();
console.log("Tables in database:", tables.map((t) => t.name).join(", "));

// Check foreign key constraints
console.log("\n📋 Foreign Key Constraints:");
const fkInfo = db.prepare("PRAGMA foreign_key_list(whitelist_proofs)").all();
if (fkInfo.length > 0) {
  fkInfo.forEach((fk) => {
    console.log(`  - whitelist_proofs.${fk.from} -> ${fk.table}.${fk.to}`);
  });
} else {
  console.log("  No foreign key constraints found on whitelist_proofs");
}

// Check if email_allocations table exists and has foreign keys
const emailAllocFk = db
  .prepare("PRAGMA foreign_key_list(email_allocations)")
  .all();
if (emailAllocFk.length > 0) {
  console.log("\n📋 Email Allocations Foreign Keys:");
  emailAllocFk.forEach((fk) => {
    console.log(`  - email_allocations.${fk.from} -> ${fk.table}.${fk.to}`);
  });
}

// Check what's referencing the whitelist_proofs
console.log("\n🔗 Checking references to whitelist_proofs...");
const whitelistHashes = db
  .prepare("SELECT email_hash FROM whitelist_proofs")
  .all();
console.log(`Found ${whitelistHashes.length} whitelist entries`);

if (whitelistHashes.length > 0) {
  const firstHash = whitelistHashes[0].email_hash;
  console.log(`Checking references to hash: ${firstHash.substring(0, 16)}...`);

  // Check if any other table references this hash
  tables.forEach((table) => {
    if (table.name !== "whitelist_proofs") {
      try {
        const result = db
          .prepare(
            `SELECT COUNT(*) as count FROM ${table.name} WHERE email_hash = ?`,
          )
          .get(firstHash);
        if (result.count > 0) {
          console.log(`  - ${table.name}: ${result.count} references found`);
        }
      } catch (e) {
        // Table might not have email_hash column
      }
    }
  });
}

db.close();
