/**
 * Get list of whitelisted emails from admin database
 */

const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = path.join(
  __dirname,
  "../admin-app/admin-data/whitelist-tracking.db",
);

try {
  const db = new Database(DB_PATH);
  const emails = db
    .prepare(
      `
    SELECT email 
    FROM whitelist_proofs 
    WHERE status = 'active' 
    ORDER BY added_at ASC
  `,
    )
    .all();

  db.close();

  const emailList = emails.map((e) => e.email);
  console.log(JSON.stringify(emailList, null, 2));
} catch (error) {
  console.error("Error:", error.message);
  process.exit(1);
}
