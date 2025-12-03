# Testing Auth Server Directly - Blank Screen Issue

## Problem

When opening the auth server URL directly:

```
https://auth-test.zksync.dev/confirm?origin=https://localhost:3000
```

The page shows a **blank screen**. This means the auth server is either:

1. Rejecting the origin parameter
2. Returning an empty response
3. Redirecting to a blank page

## Diagnostic Steps

### Step 1: Check Network Tab When Opening Directly

1. **Open DevTools** (F12) before navigating
2. **Go to Network tab**
3. **Navigate to:** `https://auth-test.zksync.dev/confirm?origin=https://localhost:3000`
4. **Check what requests are made:**
   - Is there a response? What status code?
   - Is there a redirect?
   - What does the response body contain?

### Step 2: Try Different Origin Formats

Test these URLs one by one:

```javascript
// Test 1: With trailing slash in origin
window.open(
  "https://auth-test.zksync.dev/confirm?origin=https://localhost:3000/",
  "test1",
);

// Test 2: URL-encoded differently
window.open(
  "https://auth-test.zksync.dev/confirm?origin=https%3A%2F%2Flocalhost%3A3000",
  "test2",
);

// Test 3: Without port (might not work for localhost)
window.open(
  "https://auth-test.zksync.dev/confirm?origin=https://localhost",
  "test3",
);

// Test 4: With different port
window.open(
  "https://auth-test.zksync.dev/confirm?origin=https://127.0.0.1:3000",
  "test4",
);
```

### Step 3: Check Response Headers

Open DevTools → Network, then navigate to the URL and check:

- **Status Code** (should be 200, not 4xx or 5xx)
- **Response Headers** - Look for:
  - `X-Frame-Options` (might block popups)
  - `Content-Security-Policy` (might block content)
  - Any error messages in response body

### Step 4: Check if Domain Needs Authorization

The auth server might require the origin to be pre-authorized. Check:

1. Visit: https://portal.zksync.io/
2. Connect your wallet
3. Navigate to SSO/Applications section
4. **Verify `https://localhost:3000` is in the authorized domains list**
5. Try removing and re-adding it

### Step 5: Test with Browser DevTools Console

Open the blank page, then in DevTools console, check:

```javascript
// Check if there's any content
console.log("Document body:", document.body);
console.log("Document HTML:", document.documentElement.innerHTML);

// Check for errors
window.addEventListener("error", (e) => console.error("Error:", e));

// Check if there's a script trying to run
console.log("Scripts:", document.scripts);

// Check network requests
performance.getEntriesByType("resource").forEach((r) => {
  console.log(r.name, r.responseStatus);
});
```

## Possible Causes

### 1. Origin Not Authorized (Most Likely)

If `https://localhost:3000` is not in your authorized domains list in the ZKsync Portal, the auth server might:

- Return a blank page
- Return an error page (but blank due to CSP/security)
- Redirect to a blank error page

**Fix:** Add `https://localhost:3000` to authorized domains in portal.zksync.io

### 2. Auth Server Bug with localhost

The auth server might have issues with `localhost` origins.

**Test:** Try with `127.0.0.1:3000` instead:

```
https://auth-test.zksync.dev/confirm?origin=https://127.0.0.1:3000
```

### 3. CORS/Security Policy Blocking

The response might have headers that prevent it from displaying.

**Check:** Network tab → Response Headers

### 4. Auth Server Down or Returning Error

The auth server might be having issues.

**Test:** Check if the base URL loads:

```
https://auth-test.zksync.dev/
```

If this is also blank, the auth server might be down.

## Quick Test Script

Run this in your browser console to test multiple scenarios:

```javascript
async function testAuthServer(origin) {
  console.log(`\n🔍 Testing origin: ${origin}`);

  const url = `https://auth-test.zksync.dev/confirm?origin=${encodeURIComponent(origin)}`;
  console.log(`URL: ${url}`);

  try {
    const response = await fetch(url, { method: "GET", mode: "no-cors" });
    console.log("Response status:", response.status);
    console.log("Response type:", response.type);
  } catch (e) {
    console.log("Fetch error (expected with no-cors):", e.message);
  }

  // Open in popup to see what happens
  const popup = window.open(url, "test", "width=800,height=600");

  setTimeout(() => {
    if (popup && !popup.closed) {
      try {
        const hasContent =
          popup.document &&
          popup.document.body &&
          popup.document.body.innerHTML;
        console.log("✅ Popup has content:", hasContent ? "Yes" : "No (blank)");
        if (!hasContent) {
          console.log("⚠️ Blank screen - origin likely not authorized");
        }
      } catch (e) {
        console.log("⚠️ Cannot access popup content (cross-origin - normal)");
      }
      popup.close();
    }
  }, 2000);
}

// Test different origin formats
await testAuthServer("https://localhost:3000");
await testAuthServer("https://localhost:3000/");
await testAuthServer("https://127.0.0.1:3000");
```

## Next Steps

1. **Check if origin is authorized** in portal.zksync.io
2. **Check Network tab** when opening the URL directly
3. **Try 127.0.0.1 instead of localhost**
4. **Check auth server status** - try visiting https://auth-test.zksync.dev/ directly
