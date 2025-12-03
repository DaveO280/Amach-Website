# Diagnose Network Issue - ERR_FAILED

## Problem

Even in incognito mode (no extensions), fetching the auth server returns `ERR_FAILED`. This suggests a network-level issue, not a browser extension.

## Diagnostic Steps

### Step 1: Test Base Auth Server URL

Check if the auth server is reachable at all:

```javascript
// Test base URL
fetch("https://auth-test.zksync.dev/")
  .then((r) => {
    console.log("✅ Base URL accessible");
    console.log("Status:", r.status);
    return r.text();
  })
  .then((text) => console.log("Content length:", text.length))
  .catch((e) => {
    console.error("❌ Base URL failed:", e.message);
    console.error("Error type:", e.name);
  });
```

### Step 2: Check DNS Resolution

Test if the domain resolves:

```javascript
// This won't work in browser, but try:
console.log("Testing DNS...");
fetch("https://auth-test.zksync.dev/", { method: "HEAD" })
  .then(() => console.log("✅ DNS resolves"))
  .catch((e) => console.error("❌ DNS/Network error:", e.message));
```

### Step 3: Test from Command Line

Open PowerShell/Command Prompt and run:

```powershell
# Test if server is reachable
curl -I https://auth-test.zksync.dev/

# Or with full URL
curl -I "https://auth-test.zksync.dev/confirm?origin=https://localhost:3000"
```

If curl also fails, it's a network/firewall issue, not a browser issue.

### Step 4: Check SSL Certificate

The auth server might have SSL certificate issues:

1. Open a new tab
2. Navigate directly to: `https://auth-test.zksync.dev/`
3. Check for SSL certificate warnings
4. Check if the page loads at all

### Step 5: Check Firewall/Proxy

Your firewall or corporate proxy might be blocking:

1. **Check Windows Firewall** settings
2. **Check if you're behind a corporate proxy**
3. **Try a different network** (mobile hotspot, etc.)

### Step 6: Try Different URLs

Test if it's specific to the `/confirm` endpoint:

```javascript
// Test 1: Base URL
fetch("https://auth-test.zksync.dev/")
  .then((r) => console.log("Base URL status:", r.status))
  .catch((e) => console.error("Base URL error:", e.message));

// Test 2: Different endpoint
fetch("https://auth-test.zksync.dev/health")
  .then((r) => console.log("Health endpoint status:", r.status))
  .catch((e) => console.error("Health endpoint error:", e.message));

// Test 3: Without query params
fetch("https://auth-test.zksync.dev/confirm")
  .then((r) => console.log("Confirm (no params) status:", r.status))
  .catch((e) => console.error("Confirm (no params) error:", e.message));
```

## Possible Causes

### 1. Auth Server is Down

The ZKsync testnet auth server might be temporarily unavailable.

**Check:** Try accessing https://auth-test.zksync.dev/ in a browser - does it load?

### 2. Network/Firewall Blocking

Your network or firewall might be blocking connections to `*.zksync.dev`.

**Test:** Try from a different network (mobile hotspot)

### 3. DNS Resolution Issue

Your DNS might not be resolving `auth-test.zksync.dev`.

**Fix:** Try using a different DNS (like 8.8.8.8)

### 4. SSL Certificate Issue

The auth server might have certificate problems.

**Check:** Open the URL in browser and check certificate

### 5. Corporate Proxy

If you're behind a corporate proxy, it might be blocking blockchain-related domains.

**Fix:** Configure proxy exceptions or use VPN

## Quick Test: Check Server Status

Visit these URLs directly in your browser:

1. **Base auth server:** `https://auth-test.zksync.dev/`

   - Should load something (even if just an error page)

2. **ZKsync status page:** Check if ZKsync services are up

3. **Try mainnet auth server:** `https://auth.zksync.dev/`
   - Test if it's a testnet-specific issue

## Next Steps

Run the tests above and share:

1. Does the base URL (`https://auth-test.zksync.dev/`) load in your browser?
2. What does curl return from command line?
3. Are you behind a corporate firewall/proxy?
4. Can you access other ZKsync services (like portal.zksync.io)?
