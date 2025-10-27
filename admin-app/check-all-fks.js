const db = require("better-sqlite3")("./admin-data/whitelist-tracking.db");

console.log("🔍 Checking ALL foreign key relationships...\n");

// Get all tables
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table'")
  .all();

// Check foreign keys for each table
tables.forEach((table) => {
  const fks = db.prepare(`PRAGMA foreign_key_list(${table.name})`).all();
  if (fks.length > 0) {
    console.log(`📋 ${table.name} foreign keys:`);
    fks.forEach((fk) => {
      console.log(`  - ${table.name}.${fk.from} -> ${fk.table}.${fk.to}`);
    });
    console.log("");
  }
});

// Check if any table references whitelist_proofs
console.log("🔗 Checking which tables reference whitelist_proofs...");
const whitelistHashes = db
  .prepare("SELECT email_hash FROM whitelist_proofs LIMIT 1")
  .all();

if (whitelistHashes.length > 0) {
  const testHash = whitelistHashes[0].email_hash;
  console.log(`Testing with hash: ${testHash.substring(0, 16)}...`);

  tables.forEach((table) => {
    if (table.name !== "whitelist_proofs") {
      try {
        // Check if table has email_hash column
        const columns = db.prepare(`PRAGMA table_info(${table.name})`).all();
        const hasEmailHash = columns.some((col) => col.name === "email_hash");

        if (hasEmailHash) {
          const result = db
            .prepare(
              `SELECT COUNT(*) as count FROM ${table.name} WHERE email_hash = ?`,
            )
            .get(testHash);
          if (result.count > 0) {
            console.log(`  - ${table.name}: ${result.count} references found`);
          }
        }
      } catch (e) {
        console.log(`  - ${table.name}: Error checking (${e.message})`);
      }
    }
  });
}

db.close();
