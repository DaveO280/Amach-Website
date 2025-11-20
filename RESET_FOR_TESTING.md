# 🔄 Reset for Testing - Fresh Start

## Quick Reset Steps

### 1. Clear Browser Storage

Open browser console and run:

```javascript
// Clear all local storage
localStorage.clear();

// Clear IndexedDB
indexedDB.databases().then((dbs) => {
  dbs.forEach((db) => indexedDB.deleteDatabase(db.name));
});

// Refresh page
location.reload();
```

### 2. Disconnect ZKsync SSO Wallet

- Click "Disconnect" in the app
- Or clear session storage:

```javascript
sessionStorage.clear();
```

### 3. Fresh Start Options

**Option A: Same Wallet (Recommended for testing)**

- Just clear storage (steps above)
- Profile already exists on blockchain (will skip to step 5)
- Can test the "existing profile" flow

**Option B: New Test Wallet**

- Create a new Google/Apple account for SSO
- Completely fresh wallet
- Can test full onboarding flow

**Option C: Delete On-Chain Profile (Advanced)**

- Would need to call `deactivateProfile()` on contract
- Or just use Option A/B

---

## Current State

### What's On-Chain (Permanent)

- ✅ Profile exists at: `0x12cA85740d223982D04867266aD9F66A95dAb500`
- ✅ Health data encrypted and stored
- ⚠️ Verification status: Not active (decryption issue)

### What's In Browser (Can Reset)

- ❌ localStorage: Potentially corrupted encrypted data
- ❌ IndexedDB: Health data cache
- ❌ Session: ZKsync SSO connection

---

## Recommended Test Flow

### For Existing Profile Testing:

```bash
1. Clear storage (Option A above)
2. Refresh page
3. Click "Set Up Wallet"
4. Connect with same Google account
5. Should skip directly to "Verify Profile" ✅
6. Test verification step
7. Test token claim
```

### For New User Testing:

```bash
1. Use incognito/private window
2. Create profile from scratch
3. Test full wizard flow
```

---

## The Decryption Error Explained

```
❌ Failed to sync blockchain data to localStorage: OperationError
```

**Root Cause:**

- Profile was created multiple times (from the loops)
- Each creation used a different `nonce` for encryption
- Trying to decrypt with wrong nonce → OperationError
- This only affects localStorage sync, not blockchain data

**Why It's Okay:**

- Blockchain data is intact ✅
- Next profile update will fix localStorage ✅
- Just need to start wizard fresh

---

## Files to Check After Reset

### 1. Browser Console

```javascript
// Check if storage is clear
console.log("localStorage:", Object.keys(localStorage));
console.log("sessionStorage:", Object.keys(sessionStorage));
```

### 2. Wizard Behavior

- Should detect existing profile
- Should skip to verification
- Should check allocation eligibility
- Should NOT loop anymore ✅

---

## Testing Checklist

- [ ] Storage cleared
- [ ] Wallet disconnected
- [ ] Page refreshed
- [ ] Wizard opens fresh
- [ ] No loops detected
- [ ] Profile detection works
- [ ] Allocation check runs once
- [ ] Can complete wizard

---

**Ready when you are! Just run the localStorage.clear() command in console and let's start fresh.** 🚀
