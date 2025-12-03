# Fix ZKsync SSO Blank Screen Issue

## Root Cause

The blank screen occurs because the ZKsync SSO connector is passing an **HTTP origin** (`http://localhost:3000`) to the auth server, even though your page is running on HTTPS.

According to the [ZKsync SSO documentation](https://docs.zksync.io/zksync-network/unique-features/zksync-sso/auth-server):

- The auth server validates the `origin` parameter to know which domain is making the request
- Passkeys require HTTPS origins
- The auth server rejects HTTP origins, causing a blank screen

## The Problem

The SSO popup URL shows:

```
https://auth-test.zksync.dev/confirm?origin=http%3A%2F%2Flocalhost%3A3000
```

Notice the `origin=http://localhost:3000` (HTTP), not `https://localhost:3000` (HTTPS).

## Solution Steps

### Step 1: Clear ALL Browser Storage

The SSO connector might have cached the HTTP origin. Clear everything:

1. **Open Browser Console** (F12)
2. **Run this script:**

```javascript
// Clear ALL storage
localStorage.clear();
sessionStorage.clear();

// Clear IndexedDB (wagmi uses this)
indexedDB.databases().then((dbs) => {
  dbs.forEach((db) => indexedDB.deleteDatabase(db.name));
});

// Clear cache
if ("caches" in window) {
  caches.keys().then((names) => {
    names.forEach((name) => caches.delete(name));
  });
}

console.log(
  "✅ Storage cleared! Now close this tab completely and open a fresh one.",
);
```

3. **Close the browser tab completely** (don't just refresh)
4. **Open a NEW tab**
5. **Navigate directly to:** `https://localhost:3000` (NOT http://)

### Step 2: Verify Domain Authorization

The domain must be authorized in the ZKsync Portal:

1. Visit: https://portal.zksync.io/
2. Connect your wallet
3. Navigate to "SSO" or "Applications"
4. **Ensure** `https://localhost:3000` (HTTPS) is in the authorized domains list
5. If you only have `http://localhost:3000`, remove it and add the HTTPS version

### Step 3: Delete Old Passkeys

If you created passkeys on HTTP, delete them:

1. **Chrome:** Go to `chrome://settings/passkeys`
2. **Find** any ZKsync SSO passkeys for `localhost`
3. **Delete** all of them
4. They will be recreated on HTTPS when you connect

### Step 4: Verify You're on HTTPS

Before connecting, check:

1. URL bar shows `https://localhost:3000` (with the lock icon)
2. Browser console shows: `Protocol: https:`
3. No redirects from HTTP to HTTPS (should load HTTPS directly)

### Step 5: Connect Fresh

1. After clearing storage and ensuring HTTPS
2. Click "Connect SSO Wallet"
3. The origin should now be `https://localhost:3000`

## Code Changes Made

We've added validation to ensure:

- ✅ HTTPS protocol check before connecting
- ✅ Origin validation to ensure it's HTTPS
- ✅ Better error messages if origin is wrong
- ✅ Improved cleanup function to clear all storage including IndexedDB

## Why This Happens

The ZKsync SSO connector uses `window.location.origin` to tell the auth server which domain is making the request. If:

- The page was initially loaded on HTTP
- Browser storage cached the HTTP origin
- The connector was initialized before the page fully loaded on HTTPS

Then the connector might use the cached HTTP origin instead of reading the current HTTPS origin.

## Still Having Issues?

Check the browser console when connecting. You should see:

- `🌐 Current origin: https://localhost:3000`
- `🔒 Protocol: https:`
- `✅ Origin validated as HTTPS: https://localhost:3000`

If you see HTTP in any of these logs, the storage wasn't fully cleared. Repeat Step 1.

## References

- [ZKsync SSO Auth Server Docs](https://docs.zksync.io/zksync-network/unique-features/zksync-sso/auth-server)
- [ZKsync SSO Passkeys Docs](https://docs.zksync.io/zksync-network/unique-features/zksync-sso/passkeys)
