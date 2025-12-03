# Fix: Injected Wallet Connector Conflict

## Issue

The error you're seeing:

```javascript
Gb.type = "injected";
Gb = function(t = {}) { ... }
```

This is **Wagmi automatically detecting and adding injected wallet connectors** (like MetaMask, Coinbase Wallet, etc.) from browser extensions.

## Problem

When Wagmi's `createConfig` is called, it automatically:

1. Detects browser wallet extensions (MetaMask, Coinbase, etc.)
2. Tries to add them as connectors
3. Initializes them with `type = "injected"`
4. This initialization can fail if the extension isn't properly loaded
5. The error crashes **before** the SSO popup can initialize

## Solution

We need to **explicitly disable auto-injection** of browser wallets, since we only want the SSO connector.

### Option 1: Explicitly Pass Empty Connectors (Recommended)

Wagmi v2 allows passing `ssr: true` and explicit connector management:

```typescript
_wagmiConfig = createConfig({
  connectors: [connector], // Only SSO connector
  chains: [zkSyncSepoliaTestnet],
  transports: {
    [zkSyncSepoliaTestnet.id]: http("https://sepolia.era.zksync.dev"),
  },
  ssr: false, // Disable SSR (client-side only)
});
```

### Option 2: Check Wagmi v2 Configuration Options

Wagmi v2 might have options to disable auto-injection. Check the Wagmi docs for:

- `autoConnect` option
- `injectConnectors` option
- Ways to prevent automatic connector detection

## Why This Causes Blank Popup

1. Wagmi tries to initialize injected connectors
2. Connector initialization fails with "Cannot set properties of undefined"
3. Error crashes before SSO connector can initialize
4. Popup never receives the initialization signal
5. Blank screen

## Next Steps

1. Check Wagmi v2 documentation for disabling auto-injection
2. Update `createConfig` to explicitly prevent injected connectors
3. Only use the SSO connector explicitly
