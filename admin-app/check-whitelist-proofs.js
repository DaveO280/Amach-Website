const db = require("better-sqlite3")("./admin-data/whitelist-tracking.db");

console.log("📊 Checking whitelist_proofs table:\n");
const whitelist = db.prepare("SELECT * FROM whitelist_proofs").all();
console.log(`Total entries: ${whitelist.length}`);

if (whitelist.length > 0) {
  whitelist.forEach((item, i) => {
    console.log(`${i + 1}. Email: ${item.email}`);
    console.log(`   Hash: ${item.email_hash.substring(0, 16)}...`);
    console.log(`   Added by: ${item.added_by}`);
    console.log(`   Status: ${item.status}`);
    console.log("");
  });
} else {
  console.log("No entries found in whitelist_proofs table");
}

db.close();
