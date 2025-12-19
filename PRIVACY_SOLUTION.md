# Privacy Solution for Email Whitelist

## The Problem

- Events with plain emails are still on-chain and publicly readable
- Storage with hashes is private but not readable for admin
- Need both: privacy on-chain + readable emails for admin

## Solution: Hybrid Approach

### Option 1: Events with Hashes + Local Database (Recommended)

**Contract:**

- Emit hashes in events: `emit EmailWhitelisted(emailHash, ...)`
- Store hashes in storage: `emailHashWhitelist[emailHash] = true`

**Admin App:**

- Maintain simple local database (SQLite) with:
  - `email` (plain text) → `email_hash` (for matching)
  - When adding: store locally + add hash to contract
  - When viewing: query local DB for readable emails
  - When verifying: hash email and check contract

**Benefits:**

- ✅ Privacy: Only hashes on-chain
- ✅ Readability: Plain emails in local DB
- ✅ Single source of truth: Contract for verification
- ✅ Simple: Local DB just for admin convenience

### Option 2: Accept On-Chain Emails (Simpler)

**Contract:**

- Keep current: emit plain emails in events
- Accept that emails are on-chain (they already are)

**Admin App:**

- Query events directly for emails
- No local database needed

**Benefits:**

- ✅ Simple: No database
- ✅ Always accurate: Events are source of truth
- ⚠️ Privacy: Emails are on-chain (but harder to query than storage)

### Option 3: Encrypted Events (Complex)

**Contract:**

- Encrypt emails before emitting
- Admin app decrypts with private key

**Benefits:**

- ✅ Privacy: Encrypted on-chain
- ✅ Readability: Decrypted locally
- ❌ Complex: Key management, encryption/decryption

## Recommendation: Option 1

Since you already have the database infrastructure, use it properly:

1. **Fix the database** (we're working on this)
2. **Update contract events** to emit hashes instead of plain emails
3. **Admin app** stores plain emails locally, adds hashes to contract
4. **Wizard** continues to work (hashes email and checks contract)

This gives you:

- Privacy on-chain (hashes only)
- Readability in admin app (local DB)
- No sync issues (contract is source of truth for verification)
