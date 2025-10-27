# Privacy-Preserving Tracking System Architecture

## Overview

The Amach Health admin system uses a hybrid approach to balance privacy protection with administrative usability. Emails are visible in the admin dashboard for management purposes, but everywhere else they are hashed for privacy.

## Where Emails Are Stored

### 1. **Admin Dashboard Database (SQLite)**

- **Location**: `admin-app/admin-data/whitelist-tracking.db`
- **Storage**: Plain text emails + hashed versions
- **Purpose**: Admin whitelist management
- **Access**: Only accessible from admin dashboard
- **Security**: Local device-based storage, no external exposure

### 2. **Blockchain (ZKsync Sepolia)**

- **Location**: ProfileVerification smart contract
- **Storage**: Only hashed emails (never plain text)
- **Purpose**: On-chain verification and token allocation
- **Access**: Public blockchain, but only hashes are visible
- **Security**: Email privacy protected by cryptographic hashing

### 3. **User Tracking Database (SQLite)**

- **Location**: `admin-app/admin-data/whitelist-tracking.db` (user_tracking table)
- **Storage**: Only email hashes (never plain text)
- **Purpose**: Privacy-preserving analytics
- **Access**: Only accessible from admin dashboard
- **Security**: No way to reverse hash back to email

## Data Flow

### Email Whitelisting Flow

```
Admin Input: user@example.com
    ↓
Admin DB: Stores both email AND hash
    |
    ├─→ Admin Dashboard: Shows "user@example.com" (for admin viewing)
    |
    └─→ Blockchain Check: Uses hash only (973dfe46...)
```

### User Journey Tracking Flow

```
User Action (profile creation, verification, etc.)
    ↓
Email Hash Generated: 973dfe46...
    ↓
Tracking DB: Stores ONLY hash + ZK-proofs
    ↓
Analytics: Shows "***973dfe46" or conversion metrics
```

## Privacy Guarantees

### What's Hashed Everywhere (Except Admin DB)

1. ✅ **Email addresses** - Hashed in blockchain and user tracking
2. ✅ **Device fingerprints** - Always hashed, never stored raw
3. ✅ **Profile data** - Content hashed, only hash stored
4. ✅ **Source/referrer data** - Hashed for privacy
5. ✅ **ZK-proofs** - Cryptographic proofs without revealing data

### What's Visible in Admin Dashboard

1. 📧 **Actual emails** - For whitelist management
2. 📊 **Analytics metrics** - Aggregated data (percentages, counts)
3. 📝 **Admin logs** - Actions taken by admins (with hashed targets)

### What's NEVER Stored Anywhere

1. ❌ **Health data** - Never leaves user's device/blockchain
2. ❌ **Private keys** - Never stored or transmitted
3. ❌ **Device details** - Only fingerprint hash stored
4. ❌ **Profile content** - Only hash stored in tracking

## Database Schema

### whitelist_proofs Table

```sql
CREATE TABLE whitelist_proofs (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,           -- For admin viewing
  email_hash TEXT UNIQUE NOT NULL,      -- For privacy tracking
  whitelist_proof TEXT NOT NULL,        -- ZK-proof
  added_by TEXT NOT NULL,
  added_at DATETIME,
  status TEXT DEFAULT 'active'
);
```

### user_tracking Table

```sql
CREATE TABLE user_tracking (
  id INTEGER PRIMARY KEY,
  email_hash TEXT UNIQUE NOT NULL,      -- ONLY hash, no email
  wallet_address TEXT,
  profile_hash TEXT,                    -- ONLY hash, no profile data
  device_fingerprint_hash TEXT,         -- ONLY hash, no device data
  source_hash TEXT,                     -- ONLY hash, no source data
  email_ownership_proof TEXT,           -- ZK-proof
  device_consistency_proof TEXT,        -- ZK-proof
  profile_completion_proof TEXT,        -- ZK-proof
  verification_proof TEXT,              -- ZK-proof
  allocation_proof TEXT,                -- ZK-proof
  created_at DATETIME,
  updated_at DATETIME
);
```

## Security Model

### Admin Dashboard Security

- **Access Control**: Admin authentication required
- **Local Storage**: SQLite database on admin device
- **No External Exposure**: Emails never sent to external services
- **Audit Trail**: All admin actions logged with timestamps

### Blockchain Security

- **Email Privacy**: Only hashes stored on-chain
- **Verification**: Smart contract validates hash matches
- **Token Allocation**: Tied to hash, not email
- **Public Ledger**: Anyone can verify, but can't see emails

### User Privacy

- **Device Tracking**: Only fingerprint hash stored
- **Profile Privacy**: Only hash stored, content encrypted
- **Journey Tracking**: All tracking via hashes
- **ZK-Proofs**: Prove facts without revealing data

## Compliance

### GDPR Compliance

- ✅ **Right to Access**: Admin can show user their data
- ✅ **Right to Erasure**: Admin can remove from whitelist
- ✅ **Data Minimization**: Only essential data stored
- ✅ **Privacy by Design**: Hashing everywhere except admin
- ✅ **Audit Trail**: Complete logging of all actions

### HIPAA Compliance

- ✅ **No PHI Storage**: Health data stays on blockchain/device
- ✅ **Access Control**: Admin authentication required
- ✅ **Audit Logs**: All access and modifications logged
- ✅ **Encryption**: Hashing for privacy-preserving tracking
- ✅ **De-identification**: Tracking uses hashes only

## API Endpoints

### Admin Dashboard APIs

- `GET /api/whitelist` - Returns emails for admin viewing
- `POST /api/whitelist` - Add/remove with both email and hash
- `GET /api/tracking` - Returns analytics (hashes only)
- `POST /api/tracking` - Track user journey (hashes only)

### Main App APIs (Blockchain-based)

- `GET /api/verification/check-email` - Uses hash for lookup
- `POST /api/verification/verify-profile` - Stores hash on-chain
- `GET /api/verification/allocation-info` - Uses wallet address

## Benefits of This Approach

### For Admins

1. 👁️ **Easy Management**: See actual emails in dashboard
2. 📊 **Useful Analytics**: Track conversion without seeing data
3. 🔍 **Fraud Detection**: Detect patterns without privacy invasion
4. ⚡ **Fast Operations**: No blockchain delays for whitelist

### For Users

1. 🔒 **Privacy Protected**: Email hashed everywhere except admin
2. 🛡️ **No Data Exposure**: Device, profile data never revealed
3. ✅ **Verification Security**: ZK-proofs protect identity
4. 📱 **Device Control**: Only fingerprint hash tracked

### For Compliance

1. ✅ **GDPR Compliant**: Data minimization and privacy by design
2. ✅ **HIPAA Compliant**: No PHI storage or exposure
3. 📝 **Audit Trail**: Complete logging for compliance
4. 🔐 **Encryption**: Cryptographic hashing for privacy

## Testing

Run the test suite:

```bash
cd admin-app
node init-database.js  # Initialize database
node test-system.js    # Run privacy tests
```

Expected results:

- ✅ Emails visible in whitelist API
- ✅ Hashes used in tracking API
- ✅ ZK-proofs generated
- ✅ Analytics work without exposing data

## Conclusion

This hybrid approach provides:

- **Full admin control** with visible emails in the dashboard
- **Complete privacy protection** everywhere else via hashing
- **GDPR/HIPAA compliance** through data minimization
- **ZK-proof security** for verification without data exposure

The system ensures admins can efficiently manage the whitelist while protecting user privacy in all tracking, analytics, and blockchain interactions.
