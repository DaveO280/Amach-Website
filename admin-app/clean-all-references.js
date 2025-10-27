const db = require("better-sqlite3")("./admin-data/whitelist-tracking.db");

console.log("🧹 Cleaning up ALL foreign key references...\n");

// Check initial state
const whitelistCount = db
  .prepare("SELECT COUNT(*) as count FROM whitelist_proofs")
  .get();
const userTrackingCount = db
  .prepare("SELECT COUNT(*) as count FROM user_tracking")
  .get();
const emailAllocCount = db
  .prepare("SELECT COUNT(*) as count FROM email_allocations")
  .get();

console.log("Initial state:");
console.log(`  Whitelist entries: ${whitelistCount.count}`);
console.log(`  User tracking entries: ${userTrackingCount.count}`);
console.log(`  Email allocation entries: ${emailAllocCount.count}`);

// Delete in correct order (child tables first)
console.log("\n🗑️ Step 1: Deleting user_tracking entries...");
const userTrackingResult = db.prepare("DELETE FROM user_tracking").run();
console.log(`  Deleted ${userTrackingResult.changes} user tracking entries`);

console.log("\n🗑️ Step 2: Deleting email_allocations entries...");
const emailAllocResult = db.prepare("DELETE FROM email_allocations").run();
console.log(`  Deleted ${emailAllocResult.changes} email allocation entries`);

console.log("\n🗑️ Step 3: Deleting whitelist_proofs entries...");
const whitelistResult = db.prepare("DELETE FROM whitelist_proofs").run();
console.log(`  Deleted ${whitelistResult.changes} whitelist entries`);

// Verify final state
const finalWhitelistCount = db
  .prepare("SELECT COUNT(*) as count FROM whitelist_proofs")
  .get();
const finalUserTrackingCount = db
  .prepare("SELECT COUNT(*) as count FROM user_tracking")
  .get();
const finalEmailAllocCount = db
  .prepare("SELECT COUNT(*) as count FROM email_allocations")
  .get();

console.log("\n✅ Cleanup complete!");
console.log("Final state:");
console.log(`  Whitelist entries: ${finalWhitelistCount.count}`);
console.log(`  User tracking entries: ${finalUserTrackingCount.count}`);
console.log(`  Email allocation entries: ${finalEmailAllocCount.count}`);

db.close();
