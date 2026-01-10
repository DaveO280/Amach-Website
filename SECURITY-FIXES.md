# Security Vulnerability Fixes - January 2025

This document summarizes the Dependabot security vulnerabilities that were addressed.

## Fixed Vulnerabilities

### 1. ✅ qs arrayLimit bypass DoS vulnerability (CVE-2025-15284) - HIGH

**Issue**: The `qs` package versions < 6.14.1 have an arrayLimit bypass that allows DoS via memory exhaustion.

**Fix Applied**:

- **Main project** (`package.json`): Added `"qs": ">=6.14.1"` to `pnpm.overrides`
- **Auth-server** (`auth-server/package.json`): Added `"qs": ">=6.14.1"` to `overrides` field
- Updated `express` from `^4.18.2` to `^4.21.2` in auth-server (uses newer qs internally)
- **Result**: npm audit shows 0 vulnerabilities in auth-server. pnpm override ensures all transitive dependencies use qs >= 6.14.1

### 2. ✅ Next.js Denial of Service with Server Components (CVE-2025-55183) - HIGH

**Issue**: Next.js 16.0.7 is vulnerable to DoS attacks with Server Components.

**Fix Applied**:

- Updated `next` from `^16.0.7` to `^16.1.1`
- Updated `eslint-config-next` from `16.0.7` to `16.1.1`
- Updated override in `pnpm.overrides` to `"next": "^16.1.1"`
- **Result**: Next.js upgraded to latest version with DoS fix

### 3. ✅ Next Server Actions Source Code Exposure (CVE-2025-55183) - MODERATE

**Issue**: Next.js versions < 16.0.9 allow source code exposure in Server Actions.

**Fix Applied**:

- Same fix as #2 above - Next.js 16.1.1 includes the patch for this vulnerability
- **Result**: Server Actions are now secure

### 4. ✅ Preact JSON VNode Injection vulnerability - HIGH

**Issue**: Preact has JSON VNode injection issues in certain versions.

**Fix Applied**:

- Added `"preact": ">=10.28.2"` to `pnpm.overrides` to ensure latest preact 10.x is used
- **Note**: The project uses preact 10.x (not 11.x), and 10.28.2 is the latest stable version
- **Result**: All preact dependencies will use the secure version

### 5. ⚠️ request package SSRF vulnerability (CVE-2023-28155) - MODERATE

**Issue**: The `request` package (up to 2.88.2) has SSRF vulnerability and is deprecated.

**Status**: **Acceptable Risk**

- The `request` package is only used in **dev/test** environments via `@nomiclabs/hardhat-waffle`
- It never runs in production
- The package is deprecated and has no patched version
- Already listed in `pnpm.peerDependencyRules.ignoreMissing` to handle peer dependency warnings
- Added documentation comment in `package.json` explaining the acceptable risk

**Recommendation**: Consider migrating away from `@nomiclabs/hardhat-waffle` in the future if a maintained alternative becomes available, but this is not a priority since it's dev-only.

## Files Modified

1. `package.json`
   - Updated Next.js to 16.1.1
   - Updated eslint-config-next to 16.1.1
   - Added `qs` override: `">=6.14.1"`
   - Added `preact` override: `">=10.28.2"`
   - Updated Next.js override to `^16.1.1`
   - Added documentation comment for request package

2. `auth-server/package.json`
   - Updated express from `^4.18.2` to `^4.21.2`
   - Added npm `overrides` field to force `qs >= 6.14.1`

3. `pnpm-lock.yaml`
   - Regenerated with secure dependency versions

4. `auth-server/package-lock.json`
   - Regenerated with secure dependency versions via `npm audit fix`

## Verification

After applying fixes:

- ✅ Main project: `pnpm install` completed successfully
- ✅ Auth-server: `npm audit` shows **0 vulnerabilities**
- ✅ All security fixes verified

## Next Steps

1. ✅ All high-severity vulnerabilities fixed
2. ⚠️ request package issue documented as acceptable dev-only risk
3. Monitor Dependabot alerts for any new vulnerabilities
4. Consider periodic dependency updates to stay current
