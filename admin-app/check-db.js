const Database = require("better-sqlite3");
const path = require("path");

const dbPath = path.join(__dirname, "admin-data", "whitelist-tracking.db");
const db = new Database(dbPath);

console.log("📊 Database Contents:\n");

console.log("=== WHITELIST ===");
const whitelist = db.prepare("SELECT * FROM whitelist").all();
console.log(`Total: ${whitelist.length}`);
whitelist.forEach((item, i) => {
  console.log(`${i + 1}. ${item.email} (added: ${item.added_at})`);
});

console.log("\n=== EMAIL ALLOCATIONS ===");
const allocations = db.prepare("SELECT * FROM email_allocations").all();
console.log(`Total: ${allocations.length}`);
allocations.forEach((item, i) => {
  console.log(
    `${i + 1}. ${item.email} - ${item.allocation_amount} AHP (tx: ${item.transaction_hash.substring(0, 10)}...)`,
  );
});

console.log("\n=== TRACKING EVENTS ===");
const events = db
  .prepare("SELECT COUNT(*) as count FROM tracking_events")
  .get();
console.log(`Total events: ${events.count}`);

db.close();
