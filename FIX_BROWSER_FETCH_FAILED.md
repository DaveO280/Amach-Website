# Fix: Browser Fetch Fails But curl Works

## Finding

- ✅ **curl works:** Returns HTTP 200 OK with content
- ❌ **Browser fetch fails:** `ERR_FAILED` error
- ✅ **DNS resolves:** Server is reachable

This indicates a **browser-specific security issue**, not a network problem.

## Root Cause

The browser might be blocking the connection due to:

1. **CORS policy** (though this shouldn't cause ERR_FAILED)
2. **Mixed content security** (HTTPS page trying to fetch from different HTTPS domain)
3. **Browser security settings** blocking external connections
4. **The fetch happening in a restricted context**

## Solution: Test Direct Navigation

Since curl works, the server is fine. The issue is with browser fetch() from your page.

### Test 1: Open URL Directly in Browser

1. **Open a new tab**
2. **Navigate to:** `https://auth-test.zksync.dev/confirm?origin=https://localhost:3000`
3. **Does the page load?** (even if blank, does it show "ZKsync SSO" title?)

If the page loads when navigating directly but fetch() fails, it's a CORS/browser security issue with programmatic access.

### Test 2: Check Browser Security Settings

Your browser might have strict security blocking external connections:

**Chrome/Edge:**

1. Settings → Privacy and security → Security
2. Check if "Enhanced protection" or strict mode is enabled
3. Temporarily disable and test

### Test 3: Test Without CORS

Try fetching without CORS mode:

```javascript
// Test without CORS (this will fail with CORS error if server doesn't allow it)
fetch("https://auth-test.zksync.dev/confirm?origin=https://localhost:3000", {
  method: "GET",
  mode: "no-cors", // This bypasses CORS but you can't read response
})
  .then((r) =>
    console.log("✅ Request sent (can't read response with no-cors)"),
  )
  .catch((e) => console.error("❌ Failed:", e));
```

### Test 4: Check Browser Console for Actual Error

The `ERR_FAILED` is generic. Check the full error:

```javascript
fetch("https://auth-test.zksync.dev/confirm?origin=https://localhost:3000")
  .then((r) => console.log("Success:", r))
  .catch((e) => {
    console.error("Full error:", e);
    console.error("Error name:", e.name);
    console.error("Error message:", e.message);
    console.error("Error stack:", e.stack);
  });
```

## Most Likely Fix

Since curl works, **the popup should work too** when opened via `window.open()`. The issue is that `fetch()` from your page context is blocked, but the popup itself might work fine.

**Try opening the popup via SSO connector** - it uses `window.open()` which might work even though `fetch()` is blocked.

The blank screen might be a different issue than the fetch failure. Let's test if the popup actually loads when opened via window.open() in the SSO flow.
