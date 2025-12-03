# Testing ZKsync SSO Auth Server

This guide shows you how to verify that the ZKsync SSO auth server is working correctly.

## Quick Test: Browser Console

**Method 1: Use the exposed window function (Easiest)**

After the page loads, open your browser console (F12) and you should see:

```
✅ SSO Diagnostics available!
   Run: await window.testZKsyncSSO()
   Or access: window.zksyncSSODiagnostics
```

Then run:

```javascript
// Run full diagnostics (prints to console)
await window.testZKsyncSSO();
```

Or access individual functions:

```javascript
// Access all diagnostic functions
const diag = window.zksyncSSODiagnostics;

// Run full diagnostics
await diag.printSsoDiagnostics();

// Test just the auth server
await diag.testAuthServerAccess("testnet");

// Check local configuration
diag.checkLocalSsoConfiguration();

// Run all diagnostics and get results
const results = await diag.getAllSsoDiagnostics();
console.log(results);
```

**Method 2: Use the test page**

Navigate to: `https://localhost:3000/test-sso`

This provides a UI with buttons to run all diagnostic tests with visual results.

This will test:

- ✅ Auth server accessibility (testnet and mainnet)
- ✅ Local configuration (HTTPS, origin, etc.)
- ✅ Network status information
- ✅ Overall health status

## Manual Tests

### 1. Check Auth Server Status Page

Visit the ZKsync Network Status page:

- **URL:** https://zksync-network.statuspage.io/
- Check for any reported issues with the auth server

### 2. Test Auth Server Access

The ZKsync SSO uses hosted auth servers:

- **Testnet:** `https://auth-test.zksync.dev`
- **Mainnet:** `https://auth.zksync.dev`

You can test if they're accessible by opening these URLs in your browser. They should load (even if they show an error page, that means the server is responding).

### 3. Check Your Local Configuration

In browser console, run:

```javascript
// Check if you're on HTTPS
console.log("Protocol:", window.location.protocol); // Should be "https:"
console.log("Origin:", window.location.origin); // Should be "https://localhost:3000"

// Check if domain is authorized
// Visit: https://portal.zksync.io/
// Go to SSO/Applications section
// Verify your domain is in the authorized list
```

### 4. Test SSO Connection

When you click "Connect SSO Wallet", check:

1. **Network Tab (F12 → Network):**

   - Look for requests to `auth-test.zksync.dev`
   - Check if they return successful responses (status 200)

2. **Console Logs:**

   - Should see: `🔐 Connecting to ZKsync SSO wallet...`
   - Should see: `🌐 Current origin: https://localhost:3000`
   - Should see: `✅ Origin validated as HTTPS: https://localhost:3000`

3. **SSO Popup:**
   - Should open and show the ZKsync SSO authentication page
   - Should NOT be blank
   - URL should be: `https://auth-test.zksync.dev/confirm?origin=https%3A%2F%2Flocalhost%3A3000`

## Common Issues

### Auth Server Not Responding

If the auth server is not accessible:

- Check your internet connection
- Check ZKsync status page for outages
- Try again later (might be temporary)

### Blank Screen in SSO Popup

If the SSO popup opens but shows a blank screen:

- Check that you're using HTTPS (not HTTP)
- Verify domain is authorized at portal.zksync.io
- Clear browser storage (see FIX_SSO_BLANK_SCREEN.md)
- Check browser console for errors

### CORS Errors

CORS errors when testing the auth server directly are **normal and expected**. The auth server only accepts requests from authorized origins.

## Using the Diagnostic Functions

The diagnostic utilities are available in `src/utils/zksyncSsoDiagnostics.ts`. You can:

```typescript
import {
  testAuthServerAccess,
  checkLocalSsoConfiguration,
  runSsoDiagnostics,
  getAllSsoDiagnostics,
  printSsoDiagnostics,
} from "@/utils/zksyncSsoDiagnostics";

// Test just the auth server
const result = await testAuthServerAccess("testnet");
console.log(result);

// Check local config
const config = checkLocalSsoConfiguration();
console.log(config);

// Run all diagnostics
await printSsoDiagnostics();
```

## Integration with Your Service

You can also add diagnostics to your SSO service. For example, add a method to `ZkSyncSsoWalletService`:

```typescript
async runDiagnostics() {
  const { getAllSsoDiagnostics } = await import('../utils/zksyncSsoDiagnostics');
  return await getAllSsoDiagnostics();
}
```

Then call it from browser console:

```javascript
const service = window.zkSyncSsoWalletService; // if exposed
const diagnostics = await service.runDiagnostics();
console.log(diagnostics);
```

## What to Look For

When running diagnostics, you should see:

✅ **All tests passing:**

- Auth server is accessible
- Local configuration is valid (HTTPS, correct origin)
- Overall status: HEALTHY

❌ **If tests fail:**

- Check the error messages
- Follow the troubleshooting steps
- Verify domain authorization
- Check ZKsync status page

## References

- [ZKsync Network Status](https://zksync-network.statuspage.io/)
- [ZKsync SSO Documentation](https://docs.zksync.io/zksync-network/unique-features/zksync-sso/auth-server)
- [ZKsync Portal](https://portal.zksync.io/)
