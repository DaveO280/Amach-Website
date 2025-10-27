const Database = require("better-sqlite3");
const path = require("path");
const { createHash } = require("crypto");

// Shared database file path
const DB_PATH = path.join(__dirname, "amach-health.db");

// Initialize database connection
const db = new Database(DB_PATH);

// Enable foreign keys
db.pragma("foreign_keys = ON");

console.log("🗄️ Initializing shared Amach Health database...");

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS whitelist_proofs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    email_hash TEXT UNIQUE NOT NULL,
    whitelist_proof TEXT NOT NULL,
    added_by TEXT NOT NULL,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'active'
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS user_tracking (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email_hash TEXT UNIQUE NOT NULL,
    profile_hash TEXT,
    device_fingerprint_hash TEXT,
    source_hash TEXT,
    email_ownership_proof TEXT,
    device_consistency_proof TEXT,
    profile_completion_proof TEXT,
    verification_proof TEXT,
    allocation_proof TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (email_hash) REFERENCES whitelist_proofs(email_hash)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS email_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    email_hash TEXT UNIQUE NOT NULL,
    allocation_amount TEXT NOT NULL,
    allocation_proof TEXT NOT NULL,
    transaction_hash TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    nonce TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (email_hash) REFERENCES whitelist_proofs(email_hash)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS anonymous_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    allocation_amount TEXT NOT NULL,
    transaction_hash TEXT UNIQUE NOT NULL,
    timestamp INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS admin_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_email TEXT NOT NULL,
    action TEXT NOT NULL,
    target_email_hash TEXT,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Hash function
function hashEmail(email) {
  return createHash("sha256").update(email.toLowerCase().trim()).digest("hex");
}

// Test emails to add
const testEmails = [
  "test15@test.com",
  "test14@test.com",
  "test13@test.com",
  "test12@test.com",
  "test11@test.com",
  "test10@test.com",
  "test9@test.com",
  "test8@test.com",
  "test7@test.com",
  "test6@test.com",
  "test5@test.com",
  "test4@test.com",
  "test3@test.com",
  "user1@example.com",
  "user2@example.com",
  "user3@example.com",
  "user4@example.com",
  "user5@example.com",
];

// Prepare insert statement
const insertEmail = db.prepare(`
  INSERT OR IGNORE INTO whitelist_proofs (email, email_hash, whitelist_proof, added_by)
  VALUES (?, ?, ?, ?)
`);

// Add test emails
console.log("📧 Adding test emails to whitelist...");
testEmails.forEach((email) => {
  const emailHash = hashEmail(email);
  const whitelistProof = `whitelist_proof_${emailHash}`;

  try {
    insertEmail.run(email, emailHash, whitelistProof, "admin@amachhealth.com");
    console.log(`✅ Added ${email}`);
  } catch (error) {
    console.log(`⚠️  ${email} already exists`);
  }
});

console.log("✅ Shared database initialized successfully!");
console.log(`📁 Database location: ${DB_PATH}`);

db.close();
