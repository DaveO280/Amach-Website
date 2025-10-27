const db = require("better-sqlite3")("./admin-data/whitelist-tracking.db");

console.log("📊 Database Tables:\n");
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table'")
  .all();
tables.forEach((t) => console.log(`  - ${t.name}`));

console.log("\n📊 Table Schemas:\n");
tables.forEach((t) => {
  console.log(`Table: ${t.name}`);
  const schema = db.prepare(`PRAGMA table_info(${t.name})`).all();
  schema.forEach((col) => {
    console.log(`  ${col.name}: ${col.type}`);
  });
  console.log("");
});

db.close();
