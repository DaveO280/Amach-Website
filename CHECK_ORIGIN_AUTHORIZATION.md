# Fix: Auth Server Returns Blank Page (Title Shows "ZKsync SSO")

## Critical Finding

The popup shows:

- ✅ **Page title: "ZKsync SSO"** - Auth server is responding
- ❌ **Blank content** - Page is empty
- ❌ **Empty Network tab** - No resources loading

This indicates the **auth server is rejecting the origin** and returning an empty page.

## Root Cause

The ZKsync auth server requires your origin (`https://localhost:3000`) to be **pre-authorized** in the ZKsync Portal. If it's not authorized, the server returns a blank page.

## Solution: Authorize Domain in ZKsync Portal

### Step 1: Go to ZKsync Portal

1. **Visit:** https://portal.zksync.io/
2. **Connect your wallet** (same wallet you'll use for SSO)
3. **Navigate to SSO Settings:**
   - Look for "SSO" or "Applications" section
   - Or "Authorized Domains" or "Trusted Origins"

### Step 2: Add Your Domain

1. **Add:** `https://localhost:3000`

   - Must be **HTTPS** (not HTTP)
   - Must be **exact match** (no trailing slash)
   - Case-sensitive

2. **Save the changes**

3. **Wait a few seconds** for the changes to propagate

### Step 3: Clear Browser Cache

After authorizing:

1. **Clear browser cache** or use **Incognito mode**
2. **Close all tabs** with the auth server
3. **Try connecting SSO again**

## Alternative: Check if Domain is Already Authorized

If you think it's already authorized:

1. **Check the exact domain** in portal.zksync.io

   - Must match exactly: `https://localhost:3000`
   - Not: `http://localhost:3000`
   - Not: `https://localhost:3000/`

2. **Remove and re-add** if there's any doubt

3. **Check multiple wallets** - Authorization is per-wallet

## Quick Test: Check Authorization Status

Unfortunately, there's no direct API to check if a domain is authorized. You'll need to:

1. **Check in the portal manually**
2. **Or try connecting** - if it works, it's authorized

## Why This Happens

The ZKsync SSO auth server:

1. Receives the `origin` parameter from your app
2. Checks if that origin is in the authorized list for your wallet
3. **If authorized:** Returns the authentication page
4. **If NOT authorized:** Returns a blank page (no error message for security)

## Troubleshooting

### Still Blank After Authorizing?

1. **Wait 30-60 seconds** - Changes might take time to propagate
2. **Clear all browser storage:**
   ```javascript
   localStorage.clear();
   sessionStorage.clear();
   ```
3. **Use a different browser** - Rule out cache issues
4. **Check the exact origin format:**
   ```javascript
   console.log("Origin:", window.location.origin);
   // Should output: https://localhost:3000 (exact)
   ```

### Different Error?

If you see a different error (not blank):

- **403 Forbidden:** Domain not authorized (same fix as above)
- **400 Bad Request:** Invalid origin parameter format
- **500 Internal Server Error:** Auth server issue (report to ZKsync)

## Next Steps

1. ✅ **Authorize `https://localhost:3000` in portal.zksync.io**
2. ✅ **Wait 30 seconds**
3. ✅ **Clear browser cache/storage**
4. ✅ **Try connecting SSO again**
5. ✅ **Should work now!**
