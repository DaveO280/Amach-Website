const Database = require("better-sqlite3");
const path = require("path");
const { createHash } = require("crypto");

// Database file path (shared between apps)
const DB_PATH = path.join(__dirname, "admin-data", "whitelist-tracking.db");

// Initialize database connection
const db = new Database(DB_PATH);

// Enable foreign keys
db.pragma("foreign_keys = ON");

// Initialize database schema
function initializeDatabase() {
  console.log("🗄️ Initializing admin database...");

  // Whitelist with ZK-proofs
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

  // Privacy-preserving user tracking (NO wallet addresses stored)
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

  // Email-based allocation tracking (emails visible, NO wallet addresses)
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
      -- Note: NO wallet_address column - complete wallet privacy
      FOREIGN KEY (email_hash) REFERENCES whitelist_proofs(email_hash)
    )
  `);

  console.log("✅ Database initialized successfully");
}

// Utility functions
function hashEmail(email) {
  return createHash("sha256").update(email.toLowerCase().trim()).digest("hex");
}

function hashDeviceFingerprint(fingerprint) {
  const fingerprintString = JSON.stringify(
    fingerprint,
    Object.keys(fingerprint).sort(),
  );
  return createHash("sha256").update(fingerprintString).digest("hex");
}

function hashSource(source) {
  return createHash("sha256").update(source).digest("hex");
}

function hashProfile(profile) {
  const profileString = JSON.stringify(profile, Object.keys(profile).sort());
  return createHash("sha256").update(profileString).digest("hex");
}

// Prepare statements
const whitelistQueries = {
  addEmail: db.prepare(`
    INSERT INTO whitelist_proofs (email, email_hash, whitelist_proof, added_by)
    VALUES (?, ?, ?, ?)
  `),
};

const trackingQueries = {
  addUser: db.prepare(`
    INSERT INTO user_tracking (email_hash, device_fingerprint_hash, source_hash)
    VALUES (?, ?, ?)
  `),
  updateUserProfile: db.prepare(`
    UPDATE user_tracking 
    SET profile_hash = ?, profile_completion_proof = ?, updated_at = CURRENT_TIMESTAMP
    WHERE email_hash = ?
  `),
  updateUserVerification: db.prepare(`
    UPDATE user_tracking 
    SET verification_proof = ?, updated_at = CURRENT_TIMESTAMP
    WHERE email_hash = ?
  `),
  updateUserAllocation: db.prepare(`
    UPDATE user_tracking 
    SET allocation_proof = ?, updated_at = CURRENT_TIMESTAMP
    WHERE email_hash = ?
  `),
};

const emailAllocationQueries = {
  addAllocation: db.prepare(`
    INSERT OR REPLACE INTO email_allocations 
    (email, email_hash, allocation_amount, allocation_proof, transaction_hash, timestamp, nonce)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
};

// Test data
const testEmails = [
  "user1@example.com",
  "user2@example.com",
  "user3@example.com",
  "user4@example.com",
  "user5@example.com",
];

const testWallets = [
  "0x1234567890abcdef1234567890abcdef12345678",
  "0x2345678901bcdef1234567890abcdef1234567890",
  "0x3456789012cdef1234567890abcdef12345678901",
  "0x4567890123def1234567890abcdef123456789012",
  "0x5678901234ef1234567890abcdef1234567890123",
];

// Populate test data
function populateTestData() {
  console.log("📊 Populating test data...");

  // Clear existing data
  db.exec("DELETE FROM email_allocations");
  db.exec("DELETE FROM user_tracking");
  db.exec("DELETE FROM whitelist_proofs");

  // Add whitelisted emails
  testEmails.forEach((email, index) => {
    const emailHash = hashEmail(email);
    const whitelistProof = `whitelist_proof_${emailHash.substring(0, 16)}`;

    whitelistQueries.addEmail.run(
      email,
      emailHash,
      whitelistProof,
      "admin@amachhealth.com",
    );

    console.log(`✅ Added whitelist: ${email}`);
  });

  // Add user tracking data
  testEmails.forEach((email, index) => {
    const emailHash = hashEmail(email);
    const deviceFingerprint = {
      browser: "Chrome",
      os: "Windows",
      timestamp: Date.now(),
    };
    const deviceHash = hashDeviceFingerprint(deviceFingerprint);
    const sourceHash = hashSource("web_app");

    // Add user (NO wallet address stored)
    trackingQueries.addUser.run(emailHash, deviceHash, sourceHash);

    // Add profile completion (for some users)
    if (index < 3) {
      const profile = {
        name: `User ${index + 1}`,
        age: 25 + index,
        healthScore: 80 + index * 5,
      };
      const profileHash = hashProfile(profile);
      trackingQueries.updateUserProfile.run(
        profileHash,
        "profile_completion_proof",
        emailHash,
      );
    }

    // Add verification (for some users)
    if (index < 4) {
      trackingQueries.updateUserVerification.run("verified", emailHash);
    }

    // Add allocation (for some users)
    if (index < 2) {
      const allocationAmount = "1000";
      const transactionHash = `0x${Math.random().toString(16).substring(2, 66)}`;
      const timestamp = Date.now() - index * 86400000; // Different days
      const nonce = `nonce_${Date.now()}_${index}`;

      emailAllocationQueries.addAllocation.run(
        email,
        emailHash,
        allocationAmount,
        "allocation_proof_placeholder",
        transactionHash,
        timestamp,
        nonce,
      );

      trackingQueries.updateUserAllocation.run("claimed", emailHash);
    }

    console.log(`✅ Added user tracking: ${email} (privacy-preserving)`);
  });

  console.log("✅ Test data populated successfully!");
}

// Run the script
try {
  initializeDatabase();
  populateTestData();

  // Show final stats
  const whitelistCount = db
    .prepare("SELECT COUNT(*) as count FROM whitelist_proofs")
    .get();
  const trackingCount = db
    .prepare("SELECT COUNT(*) as count FROM user_tracking")
    .get();
  const allocationCount = db
    .prepare("SELECT COUNT(*) as count FROM email_allocations")
    .get();

  console.log("\n📊 Final Database Stats:");
  console.log(`- Whitelisted emails: ${whitelistCount.count}`);
  console.log(`- User tracking entries: ${trackingCount.count}`);
  console.log(`- Email allocations: ${allocationCount.count}`);
} catch (error) {
  console.error("❌ Error populating test data:", error);
} finally {
  db.close();
}
