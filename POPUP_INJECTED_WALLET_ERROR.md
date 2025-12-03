# Popup Error: Injected Wallet Connector Conflict

## Error Pattern

The error you're seeing:

```javascript
Gb.type = "injected";
Gb = function(t = {}) {
    const { shimDisconnect: e = true, unstable_shimAsyncInject: n } = t;
```

This is minified code trying to set `type = "injected"` on a connector object **before** it's defined, causing:

```
Uncaught (in promise) TypeError: Cannot set properties of undefined (setting 'type')
```

## Root Cause

This code is **NOT from your application**. It's from:

1. **Browser Extensions**: Wallet extensions (MetaMask, Coinbase, etc.) trying to inject connectors
2. **Wagmi Library**: Internal connector initialization code
3. **ZKsync SSO Library**: Popup initialization code

The error happens **inside the popup window** (`auth-test.zksync.dev`), which we cannot control.

## Why It Causes Blank Screen

1. Popup opens successfully
2. Popup's JavaScript tries to initialize wallet connectors
3. Connector initialization fails with "Cannot set properties of undefined"
4. JavaScript error crashes the popup's initialization
5. Popup never sends "PopupLoaded" message to parent
6. Parent window waits indefinitely → **Blank screen**

## Current Fix

We've ensured your app **only uses the SSO connector explicitly**:

```typescript
_wagmiConfig = createConfig({
  connectors: [connector], // ONLY SSO connector - no injected wallets
  chains: [zkSyncSepoliaTestnet],
  transports: {
    [zkSyncSepoliaTestnet.id]: http("https://sepolia.era.zksync.dev"),
  },
});
```

However, this doesn't fix the popup's own JavaScript, which might be trying to initialize injected connectors.

## Potential Solutions

### 1. Browser Extension Conflict (Most Likely)

**Try disabling wallet extensions temporarily:**

- Disable MetaMask, Coinbase Wallet, etc.
- Test SSO connection again
- If it works, the extension is injecting connectors that conflict

### 2. ZKsync SSO Library Issue

The error is in the popup's JavaScript, which is served by ZKsync's auth server. This could be:

- A bug in the ZKsync SSO library
- A version mismatch between your app and the auth server
- The auth server trying to auto-detect injected wallets

### 3. Browser Security/CSP

We already identified CSP issues from browser extensions. Make sure:

- Extensions are disabled or configured to allow ZKsync domains
- Test in incognito mode (extensions disabled)

## Next Steps

1. **Test with all wallet extensions disabled**
2. **Check if the error still occurs in incognito mode**
3. **Check ZKsync SSO library version** - ensure it matches the auth server
4. **Report to ZKsync** if the issue persists - this appears to be a library bug

## References

- Error: `Cannot set properties of undefined (setting 'type')`
- Location: Popup window (`auth-test.zksync.dev`)
- Code pattern: `Gb.type = "injected"` before `Gb` is defined
- Impact: Popup JavaScript crashes before initialization completes
