# Test Auth Server Response - Blank Page Investigation

## Problem

- ✅ Popup opens successfully
- ✅ Page title shows "ZKsync SSO" (auth server responding)
- ❌ Page content is completely blank
- ❌ Network tab shows no requests
- ❌ Happens even in incognito mode
- ✅ Localhost should work by default per ZKsync docs

## Diagnostic: Check What the Auth Server Actually Returns

### Test 1: Check Response Headers and Body

Open DevTools → Network tab, then navigate to:

```
https://auth-test.zksync.dev/confirm?origin=https://localhost:3000
```

Look for:

1. **Status code** (should be 200)
2. **Response headers:**
   - `Content-Type` (should be `text/html`)
   - `Content-Length` (if 0, server returned empty response)
   - Any CSP or security headers
3. **Response body:**
   - Is it completely empty?
   - Does it have HTML but no scripts?
   - Does it have an error message?

### Test 2: Check if Auth Server URL is Correct

The default auth server might be wrong. Check what the connector is using:

```javascript
// In browser console
import("zksync-sso/connector").then((module) => {
  // The default URL should be visible in the source
  console.log("Checking auth server URL...");
});
```

### Test 3: Try Different Auth Server Endpoints

Test these URLs directly:

```javascript
// Test base URL
window.open("https://auth-test.zksync.dev/", "test1");

// Test without origin parameter
window.open("https://auth-test.zksync.dev/confirm", "test2");

// Test with different origin format
window.open(
  "https://auth-test.zksync.dev/confirm?origin=http://localhost:3000",
  "test3",
);

// Test with 127.0.0.1
window.open(
  "https://auth-test.zksync.dev/confirm?origin=https://127.0.0.1:3000",
  "test4",
);
```

### Test 4: Check if Auth Server is Down

```javascript
fetch("https://auth-test.zksync.dev/", { method: "HEAD" })
  .then((r) => {
    console.log("Auth server status:", r.status);
    console.log("Auth server headers:", [...r.headers.entries()]);
  })
  .catch((e) => console.error("Cannot reach auth server:", e));
```

### Test 5: Manual HTTP Request

Use curl or fetch to see raw response:

```javascript
fetch("https://auth-test.zksync.dev/confirm?origin=https://localhost:3000")
  .then((r) => r.text())
  .then((html) => {
    console.log("Response length:", html.length);
    console.log("First 500 chars:", html.substring(0, 500));
    console.log("Has DOCTYPE:", html.includes("<!DOCTYPE"));
    console.log("Has body:", html.includes("<body"));
    console.log("Has scripts:", html.includes("<script"));
  });
```

## Possible Causes (Non-Authorization)

### 1. Auth Server Bug or Down

The auth server might be having issues or returning empty responses.

**Check:** Test base URL and check ZKsync status page

### 2. Wrong Auth Server URL

Maybe the connector is using the wrong endpoint.

**Check:** Verify the default auth server URL in the connector source

### 3. Origin Parameter Format Issue

The auth server might be rejecting the origin format even for localhost.

**Test:** Try different origin formats (with/without port, http vs https, etc.)

### 4. Testnet vs Mainnet

Maybe the testnet auth server has different requirements.

**Check:** Try mainnet auth server: `https://auth.zksync.dev/confirm?origin=...`

### 5. JavaScript Loading Issue

The HTML loads (title shows) but JavaScript fails to load/execute, leaving blank page.

**Check:** Response body - does it have `<script>` tags that should load content?

### 6. CSP or Security Headers Blocking

Content Security Policy might be blocking all resources.

**Check:** Response headers for CSP directives

## Next Steps

1. **Check the Network tab response body** when navigating directly
2. **Try the test script above** to see raw response
3. **Check if auth server base URL loads** (without /confirm)
4. **Try different origin parameter formats**
5. **Check ZKsync status** or GitHub issues
