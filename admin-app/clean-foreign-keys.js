const db = require("better-sqlite3")("./admin-data/whitelist-tracking.db");

console.log("🧹 Cleaning up foreign key references...\n");

// First, check what we have
const whitelistCount = db
  .prepare("SELECT COUNT(*) as count FROM whitelist_proofs")
  .get();
const emailAllocCount = db
  .prepare("SELECT COUNT(*) as count FROM email_allocations")
  .get();

console.log(`Whitelist entries: ${whitelistCount.count}`);
console.log(`Email allocation entries: ${emailAllocCount.count}`);

// Delete email allocations first (they reference whitelist_proofs)
console.log("\n🗑️ Deleting email allocations...");
const emailAllocResult = db.prepare("DELETE FROM email_allocations").run();
console.log(`Deleted ${emailAllocResult.changes} email allocation entries`);

// Now delete the whitelist entries
console.log("\n🗑️ Deleting whitelist entries...");
const whitelistResult = db.prepare("DELETE FROM whitelist_proofs").run();
console.log(`Deleted ${whitelistResult.changes} whitelist entries`);

// Verify cleanup
const finalWhitelistCount = db
  .prepare("SELECT COUNT(*) as count FROM whitelist_proofs")
  .get();
const finalEmailAllocCount = db
  .prepare("SELECT COUNT(*) as count FROM email_allocations")
  .get();

console.log("\n✅ Cleanup complete!");
console.log(`Final whitelist entries: ${finalWhitelistCount.count}`);
console.log(`Final email allocation entries: ${finalEmailAllocCount.count}`);

db.close();
