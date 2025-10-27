const db = require("better-sqlite3")("./admin-data/whitelist-tracking.db");

console.log("🧹 Cleaning up removed entries...");

// Delete all entries with status = 'removed'
const result = db
  .prepare("DELETE FROM whitelist_proofs WHERE status = ?")
  .run("removed");
console.log(`Deleted ${result.changes} removed entries`);

// Check remaining entries
const count = db
  .prepare("SELECT COUNT(*) as count FROM whitelist_proofs")
  .get();
console.log(`Remaining active entries: ${count.count}`);

// Show any remaining entries
const remaining = db
  .prepare("SELECT email, status FROM whitelist_proofs")
  .all();
if (remaining.length > 0) {
  console.log("\nRemaining entries:");
  remaining.forEach((item, i) => {
    console.log(`  ${i + 1}. ${item.email} (${item.status})`);
  });
} else {
  console.log("\n✅ Database is now clean!");
}

db.close();
