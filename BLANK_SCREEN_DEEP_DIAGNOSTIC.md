# Deep Diagnostic: Blank Screen Without Session Config

Since the blank screen persists even with **NO session configuration**, this means the issue happens **BEFORE** contract authorization - during the initial SSO connection/authentication phase.

## Root Cause Analysis

### What Happens When You Click "Connect SSO Wallet"

1. **Service calls `connect()`** → `ZkSyncSsoWalletService.connect()`
2. **Gets SSO connector** → `getSsoConnector()`
3. **Calls wagmi `connect()`** → `connect(freshWagmiConfig, { connector: freshSsoConnector, chainId: 300 })`
4. **SSO connector opens popup** → Redirects to `https://auth-test.zksync.dev/confirm?origin=...`
5. **Blank screen** → Popup opens but shows nothing

### Why Blank Screen Happens (Most Likely Causes)

#### 1. **Domain Not Authorized in Production** ⚠️ MOST LIKELY

The production domain needs to be authorized in ZKsync Portal:

**Check Production Domain:**

```javascript
// In browser console on production site
console.log("Origin:", window.location.origin);
console.log("Protocol:", window.location.protocol);
```

**Action Required:**

1. Visit: https://portal.zksync.io/
2. Connect wallet
3. Go to "SSO" or "Applications"
4. Add your **production domain** (e.g., `https://yourdomain.com`)
5. Ensure it's HTTPS, not HTTP

#### 2. **Production URL Mismatch**

The domain in production might be different from what's authorized:

**Check:**

- What domain is production running on?
- Is it authorized in ZKsync Portal?
- Is there a trailing slash mismatch? (`https://domain.com` vs `https://domain.com/`)

#### 3. **Browser Blocking Popup**

Modern browsers block popups if:

- Popup opens without user interaction
- Popup is opened from async code
- Popup opener window is redirected

**Check Browser Console for:**

```
Blocked popup
Popup blocked
```

#### 4. **CORS / Origin Validation Failure**

The ZKsync auth server might be rejecting the origin:

**Check Network Tab:**

1. Open DevTools → Network
2. Click "Connect SSO Wallet"
3. Look for requests to `auth-test.zksync.dev`
4. Check response status codes
5. Check response headers for CORS errors

#### 5. **Auth Server Configuration Issue**

The SSO connector might not be reading the origin correctly:

**The connector uses:**

```typescript
window.location.origin;
```

**But production might have:**

- Proxy/load balancer changing headers
- CDN modifying origin
- Multiple domains/redirects

## Diagnostic Steps

### Step 1: Check What Origin is Being Sent

Add logging to see what origin is actually being sent:

**In browser console before connecting:**

```javascript
// Check current origin
console.log("Current origin:", window.location.origin);
console.log("Current protocol:", window.location.protocol);
console.log("Current hostname:", window.location.hostname);
console.log("Current port:", window.location.port);
console.log("Full URL:", window.location.href);
```

### Step 2: Inspect the Popup URL

When the popup opens, check its URL:

**Method 1: Browser Console**

```javascript
// Before clicking connect, run this
window.addEventListener("message", (e) => {
  console.log("Popup message:", e);
  console.log("Popup origin:", e.origin);
});
```

**Method 2: Check Popup Window**

1. Click "Connect SSO Wallet"
2. Popup opens (even if blank)
3. Right-click on popup → Inspect (if possible)
4. Check the popup's URL bar
5. Check popup's console for errors

### Step 3: Check Network Requests

1. Open DevTools → Network tab
2. Filter by: `auth-test.zksync.dev` or `zksync`
3. Click "Connect SSO Wallet"
4. Watch for requests:
   - Request URL
   - Request headers (especially `origin` header)
   - Response status
   - Response body

**Look for:**

- 403 Forbidden → Domain not authorized
- 400 Bad Request → Invalid origin parameter
- CORS errors → Origin mismatch
- 500 Internal Server Error → Auth server issue

### Step 4: Check Production Environment Variables

**In production, verify:**

- No hardcoded `localhost` URLs
- Domain matches authorized domain
- HTTPS is properly configured
- No mixed content (HTTP resources on HTTPS page)

### Step 5: Test with Minimal SSO Config

Try creating an absolute minimal connector to isolate the issue:

**Test Page** (`src/app/test-minimal-sso/page.tsx`):

```typescript
"use client";
import { zksyncSsoConnector } from "zksync-sso/connector";
import { createConfig } from "@wagmi/core";
import { defineChain, http } from "viem";

const chain = defineChain({
  id: 300,
  name: "zkSync Era Sepolia Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia.era.zksync.dev"] } },
});

const connector = zksyncSsoConnector({
  // ABSOLUTE MINIMAL - no metadata, no session, nothing
});

const config = createConfig({
  connectors: [connector],
  chains: [chain],
  transports: { [300]: http() },
});

// Test connection
import { connect } from "@wagmi/core";
connect(config, { connector, chainId: 300 })
  .then(console.log)
  .catch(console.error);
```

## Most Likely Fix

Since this happens in production too and no code was pushed, **99% chance it's domain authorization**:

1. **Check production domain** (what URL is the production site running on?)
2. **Authorize it in ZKsync Portal**: https://portal.zksync.io/
3. **Ensure exact match** (including https://, no trailing slash)
4. **Clear browser cache** after authorizing
5. **Test again**

## Quick Production Domain Check Script

Run this in production browser console:

```javascript
(async () => {
  const origin = window.location.origin.replace(/\/$/, "");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔍 PRODUCTION DOMAIN DIAGNOSTIC");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log("📍 Production Origin:", origin);
  console.log("🔒 Protocol:", window.location.protocol);
  console.log("🌐 Hostname:", window.location.hostname);
  console.log("🔌 Port:", window.location.port || "(default)");
  console.log("");
  console.log("⚠️  ACTION REQUIRED:");
  console.log("   1. Copy the origin above");
  console.log("   2. Visit: https://portal.zksync.io/");
  console.log("   3. Go to SSO/Applications");
  console.log("   4. Ensure this EXACT origin is authorized");
  console.log("   5. Check for trailing slash mismatch");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
})();
```
