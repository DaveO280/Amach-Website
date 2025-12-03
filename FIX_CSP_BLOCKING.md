# Fix: Content Security Policy Blocking Auth Server

## Root Cause Found!

The error shows:

```
Connecting to 'https://auth-test.zksync.dev/...' violates the following Content Security Policy directive: "connect-src chrome://resources chrome://theme 'self'"
```

This CSP is **NOT from your Next.js app** - it's from a **Chrome extension** that's injecting a restrictive Content Security Policy. This CSP only allows:

- `chrome://resources`
- `chrome://theme`
- `'self'` (same origin only)

**This is blocking ALL external connections**, including the auth server!

## Solution 1: Disable the Security Extension (Recommended)

The `security.laikalabs.ai` error earlier confirms you have a security extension installed (likely Laika Labs DApp Security Scanner or similar).

1. **Click the extensions icon** (puzzle piece) in your browser toolbar
2. **Find security/DApp scanner extensions:**
   - Laika Labs Security Scanner
   - DApp Security tools
   - Any extension with "security" or "scanner" in the name
3. **Disable all of them** temporarily
4. **Reload your page** (`https://localhost:3000`)
5. **Try connecting SSO again**

## Solution 2: Configure Extension to Allow ZKsync Domains

If you want to keep the extension enabled:

1. **Open the extension's settings**
2. **Look for "Allowed Domains" or "Whitelist"**
3. **Add:**
   - `https://localhost:3000`
   - `https://auth-test.zksync.dev`
   - `https://auth.zksync.dev`
   - `https://portal.zksync.io`
4. **Save and reload**

## Solution 3: Check All Extensions

Some extensions inject CSP headers. Check:

1. **All browser extensions** (especially security-related)
2. **Disable them one by one** to find the culprit
3. **Test SSO after each disable**

## Solution 4: Use Incognito Mode (Temporary Fix)

Incognito mode disables most extensions:

1. **Open Incognito window** (Ctrl+Shift+N)
2. **Navigate to** `https://localhost:3000`
3. **Accept the self-signed certificate**
4. **Try connecting SSO**

If it works in incognito, it's definitely an extension issue.

## Verify the Fix

After disabling extensions, run this again:

```javascript
fetch("https://auth-test.zksync.dev/confirm?origin=https://localhost:3000")
  .then((r) => r.text())
  .then((text) => {
    console.log("✅ Success! Response length:", text.length);
    console.log("Response preview:", text.substring(0, 500));
  })
  .catch((e) => console.error("❌ Still blocked:", e));
```

If this works, the SSO popup should also work now!
