# December 2025 Changelog

A summary of significant project changes and feature development during December 2025.

---

## December 2, 2025

### Wallet Service Migration to Privy

- Migrated from ZkSync SSO wallet to Privy authentication
- Added `useWalletService` hook for wallet service abstraction
- Added `networkConfig` for contract address management
- Fixed wallet encryption and weight storage
- Removed ZkSync SSO package conflicts
- Updated components to use new wallet service pattern
- Fixed server-side queries using viem instead of wagmi

### Storage & AI Infrastructure

- Added storage directory with Storj integration
- Added AI directory with `RelevanceScorer` and `ContextPreprocessor`

---

## December 3, 2025

### Health Profile Contract V3 Upgrade

- Upgraded production proxy to V3 with on-chain weight storage
- Key fix: Use `upgradeToAndCall()` instead of `upgradeTo()` (OpenZeppelin v5 change)
- Frontend now uses V3 functions: `createProfileWithWeight`, `updateProfileWithWeight`
- Weight data now stored on-chain instead of localStorage
- All existing profiles preserved during upgrade
- UUPS upgrade mechanism fully functional

### Security Updates

- Updated js-yaml to 4.1.1 to fix prototype pollution vulnerability
- Fixed 19+ vulnerabilities across dependencies
- Updated multiple vulnerable packages
- Added graceful handling for weight decryption failures

### UI Fixes

- Fixed mobile icon configuration to match desktop favicon
- Removed incorrect manifest property from metadata

---

## December 4, 2025

### Wallet Funding Improvements

- Added wallet funding diagnostics and multi-agent analysis improvements
- Handle already-funded wallets in wizard (skip funding if sufficient balance)

### Repository Cleanup

- Removed admin app from repository (should not be public)
- Set Vercel maxDuration to 60s for Hobby plan compatibility

---

## December 7, 2025

### Next.js 16 Upgrade

- Upgraded from Next.js 15.5.7 to 16.0.7 to fix critical RCE vulnerability
- Updated 500+ packages including Radix UI, TanStack Query, AWS SDK, and more
- Fixed TypeScript compatibility with Next.js 16 crypto.subtle API
- Added BufferSource type casts for AES-GCM encryption/decryption
- Fixed weight decryption and added coordinator debugging

---

## December 8, 2025

### Vercel Build Compatibility

- Fixed Turbopack build issues by removing turbopack config
- Externalized problematic packages for production builds
- Fixed Next.js 16 compatibility and production profile loading issues

---

## December 9, 2025

### Wallet Wizard Improvements

- Fixed step 6 completion detection
- Refresh allocation info before checking claim status
- Auto-detect when tokens already claimed
- Mark step 6 complete if tokens were previously claimed

---

## December 12, 2025

### V3 Timeline Events & Storj Integration

- **Fixed zkSync Transaction Failures**: Increased gas limit from 500k to 2M for pubdata overhead
- **Fixed V3 Contract Function Names**: Changed to proper Solidity mapping accessors
- **Fixed Storj Data Decryption**: Corrected API parameter passing for timeline events
- **Timeline UI Improvements**:
  - Hidden technical fields, priority fields displayed prominently
  - Nested data objects properly flattened and displayed
  - Fixed `[object Object]` display issue

### Storage Service Updates

- Added Storj bucket validation and access control
- Updated StorageService `retrieveHealthData` signature
- Exported Storj service factory functions
- Added missing Storj and health event type files

### Utility Updates

- Added missing `historicalStats` utility
- Added favicon files
- Updated Privy wallet service integration

---

## December 18, 2025

### Guide Popups & Message Limits

- Added guide popups pointing to Health Dashboard and Upload File features
- Implemented 10 message limit for users without wallet connection
- Show warning popup at 5 messages
- Show blocked popup with email link after 10 messages
- Removed Deep Historical Analysis boxes from chat UI
- Disabled multi-agent mode when wallet is not connected
- Fixed tooltip opacity issues for Goals and Timeline tabs
- Updated styling to match site theme (emerald/amber colors)

---

## December 19, 2025

### Production Stack Overflow Fixes

- Fixed circular reference causing stack overflow in AI service
- Aggregated metrics by day and replaced spread operator in Math.min/max
- Added aggressive metric sanitization to prevent circular references

### PDF & AI Accessibility

- Fixed PDF parsing issues
- Made AI accessible without wallet connection

### Production Build Fixes

- Patched viem to remove `createTestClient` and `testActions` exports
- Fixed module resolution issues with absolute path aliases
- Fixed Storj timeline production errors by externalizing AWS SDK
- Fixed crash when contentHash is undefined
- Added diagnostic logging for Storj credentials in production

### Mobile UI Improvements

- Improved mobile responsiveness for guide popups
- Fixed mobile popup centering in viewport without scrolling

---

## Summary

### Major Features Added

- ✅ Privy wallet integration (replacing ZkSync SSO)
- ✅ Health Profile Contract V3 with on-chain weight storage
- ✅ V3 Timeline Events with Storj data decryption
- ✅ Guide popups and message limits for non-wallet users
- ✅ Next.js 16 upgrade with security fixes

### Key Improvements

- 🔒 Multiple security vulnerability patches
- 🚀 Production stability and stack overflow fixes
- 📱 Mobile responsiveness improvements
- 🔧 Wallet wizard enhancements
- ⚡ Build and deployment optimizations
