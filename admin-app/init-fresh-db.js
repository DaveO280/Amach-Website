const Database = require("better-sqlite3");
const path = require("path");
const { createHash } = require("crypto");

const dbPath = path.join(__dirname, "admin-data", "whitelist-tracking.db");
const db = new Database(dbPath);

console.log("🗄️ Initializing fresh admin database...");

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS whitelist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    email_hash TEXT UNIQUE NOT NULL,
    whitelist_proof TEXT NOT NULL,
    added_by TEXT NOT NULL,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'active'
  );

  CREATE TABLE IF NOT EXISTS whitelist_proofs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email_hash TEXT UNIQUE NOT NULL,
    ownership_proof TEXT NOT NULL,
    device_consistency_proof TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tracking_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email_hash TEXT NOT NULL,
    event_type TEXT NOT NULL,
    device_fingerprint_hash TEXT NOT NULL,
    source_fingerprint_hash TEXT NOT NULL,
    profile_hash TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT
  );

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
  );
`);

console.log("✅ Admin database initialized successfully!");
console.log("📊 Database created at:", dbPath);
console.log("🔐 Ready for ZK-proof email allocation tracking");

db.close();
