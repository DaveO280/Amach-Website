import Database from "better-sqlite3";
import { createHash } from "crypto";
import path from "path";

// Type definitions for database query results
export interface WhitelistProof {
  email: string;
  email_hash: string;
  whitelist_proof: string;
  added_by?: string;
  added_at?: string;
  status?: string;
}

export interface UserTracking {
  id?: number;
  email_hash: string;
  profile_hash: string | null;
  device_fingerprint_hash: string | null;
  source_hash: string | null;
  email_ownership_proof: string | null;
  device_consistency_proof: string | null;
  profile_completion_proof: string | null;
  verification_proof: string | null;
  allocation_proof: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface EmailAllocation {
  id?: number;
  email: string;
  email_hash: string;
  allocation_amount: string;
  allocation_proof: string;
  transaction_hash: string;
  timestamp: number;
  nonce: string;
  created_at?: string;
}

export interface AnonymousAllocation {
  id?: number;
  allocation_amount: string;
  transaction_hash: string;
  timestamp: number;
  created_at?: string;
}

export interface AdminLog {
  id?: number;
  admin_email: string;
  action: string;
  target_email_hash: string | null;
  details: string | null;
  created_at?: string;
}

// Database file path (shared between apps)
const DB_PATH = path.join(process.cwd(), "admin-data", "whitelist-tracking.db");

// Initialize database connection
export const db = new Database(DB_PATH);

// Enable foreign keys
db.pragma("foreign_keys = ON");

// Initialize database schema
export function initializeDatabase(): void {
  console.log("🗄️ Initializing privacy-preserving tracking database...");

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

  // Anonymous allocation tracking (NO email-wallet association)
  db.exec(`
    CREATE TABLE IF NOT EXISTS anonymous_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      allocation_amount TEXT NOT NULL,
      transaction_hash TEXT UNIQUE NOT NULL,
      timestamp INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Admin activity logs
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

  // System settings
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log("✅ Database initialized successfully");
}

// Utility functions for hashing (privacy-preserving)
export function hashEmail(email: string): string {
  return createHash("sha256").update(email.toLowerCase().trim()).digest("hex");
}

export function hashDeviceFingerprint(
  fingerprint: Record<string, unknown>,
): string {
  const fingerprintString = JSON.stringify(
    fingerprint,
    Object.keys(fingerprint).sort(),
  );
  return createHash("sha256").update(fingerprintString).digest("hex");
}

export function hashSource(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

export function hashProfile(profile: Record<string, unknown>): string {
  const profileString = JSON.stringify(profile, Object.keys(profile).sort());
  return createHash("sha256").update(profileString).digest("hex");
}

export function hashWalletAddress(walletAddress: string): string {
  return createHash("sha256").update(walletAddress.toLowerCase()).digest("hex");
}

// Whitelist management functions
export const whitelistQueries = {
  addEmail: db.prepare(`
    INSERT INTO whitelist_proofs (email, email_hash, whitelist_proof, added_by)
    VALUES (?, ?, ?, ?)
  `),

  removeEmail: db.prepare(`
    UPDATE whitelist_proofs 
    SET status = 'removed', added_at = CURRENT_TIMESTAMP
    WHERE email = ? OR email_hash = ?
  `),

  getWhitelistedEmails: db.prepare(`
    SELECT email, email_hash, whitelist_proof, added_by, added_at, status
    FROM whitelist_proofs
    WHERE status = 'active'
    ORDER BY added_at DESC
  `),

  checkEmailWhitelisted: db.prepare(`
    SELECT email, email_hash, whitelist_proof
    FROM whitelist_proofs
    WHERE email_hash = ? AND status = 'active'
  `),

  checkEmailWhitelistedByEmail: db.prepare(`
    SELECT email, email_hash, whitelist_proof
    FROM whitelist_proofs
    WHERE email = ? AND status = 'active'
  `),
};

// User tracking functions
export const trackingQueries = {
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

  getUserTracking: db.prepare(`
    SELECT * FROM user_tracking
    WHERE email_hash = ?
  `),

  getAllUserTracking: db.prepare(`
    SELECT 
      ut.email_hash,
      wp.email,
      ut.profile_hash,
      ut.device_fingerprint_hash,
      ut.source_hash,
      ut.profile_completion_proof,
      ut.verification_proof,
      ut.allocation_proof,
      ut.created_at,
      ut.updated_at
    FROM user_tracking ut
    LEFT JOIN whitelist_proofs wp ON ut.email_hash = wp.email_hash
    ORDER BY ut.created_at DESC
  `),

  getAnalytics: db.prepare(`
    SELECT 
      COUNT(*) as total_whitelisted,
      COUNT(ut.email_hash) as total_with_profiles,
      COUNT(ut.verification_proof) as total_verified,
      COUNT(ut.allocation_proof) as total_claimed
    FROM whitelist_proofs wp
    LEFT JOIN user_tracking ut ON wp.email_hash = ut.email_hash
    WHERE wp.status = 'active'
  `),
};

// Email allocation tracking functions
export const emailAllocationQueries = {
  addAllocation: db.prepare(`
    INSERT OR REPLACE INTO email_allocations 
    (email, email_hash, allocation_amount, allocation_proof, transaction_hash, timestamp, nonce)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),

  getAllocationByEmail: db.prepare(`
    SELECT * FROM email_allocations
    WHERE email = ?
  `),

  getAllocationByEmailHash: db.prepare(`
    SELECT * FROM email_allocations
    WHERE email_hash = ?
  `),

  getAllAllocations: db.prepare(`
    SELECT * FROM email_allocations
    ORDER BY created_at DESC
  `),

  getAllocationStats: db.prepare(`
    SELECT 
      COUNT(*) as total_allocations,
      SUM(CAST(allocation_amount AS REAL)) as total_amount,
      COUNT(DISTINCT email_hash) as unique_emails,
      AVG(CAST(allocation_amount AS REAL)) as average_allocation
    FROM email_allocations
  `),

  deleteAllocation: db.prepare(`
    DELETE FROM email_allocations WHERE email_hash = ?
  `),
};

// Anonymous allocation tracking functions (NO email-wallet association)
export const anonymousAllocationQueries = {
  addAllocation: db.prepare(`
    INSERT INTO anonymous_allocations (allocation_amount, transaction_hash, timestamp)
    VALUES (?, ?, ?)
  `),

  getAllAllocations: db.prepare(`
    SELECT * FROM anonymous_allocations
    ORDER BY created_at DESC
  `),

  getTotalAllocations: db.prepare(`
    SELECT COUNT(*) as total_allocations
    FROM anonymous_allocations
  `),

  getTotalAllocationAmount: db.prepare(`
    SELECT SUM(CAST(allocation_amount AS REAL)) as total_amount
    FROM anonymous_allocations
  `),

  getTotalVerifiedUsers: db.prepare(`
    SELECT COUNT(*) as total_verified
    FROM user_tracking
    WHERE verification_proof IS NOT NULL
  `),

  getClaimRate: db.prepare(`
    SELECT 
      (SELECT COUNT(*) FROM anonymous_allocations) as total_claimed,
      (SELECT COUNT(*) FROM user_tracking WHERE verification_proof IS NOT NULL) as total_verified
  `),
};

// Admin logging functions
export const adminQueries = {
  logAction: db.prepare(`
    INSERT INTO admin_logs (admin_email, action, target_email_hash, details)
    VALUES (?, ?, ?, ?)
  `),

  getAdminLogs: db.prepare(`
    SELECT * FROM admin_logs
    ORDER BY created_at DESC
    LIMIT 100
  `),
};

// Initialize database on import
initializeDatabase();

export default db;
