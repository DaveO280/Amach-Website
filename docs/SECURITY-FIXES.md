# Security Vulnerability Fixes - January 2025

This document summarizes the Dependabot security vulnerabilities that were addressed.

## Fixed Vulnerabilities

### 1. ✅ qs arrayLimit bypass DoS vulnerability (CVE-2025-15284) - HIGH

**Fix**: Added `"qs": ">=6.14.1"` to `pnpm.overrides` in `package.json`.

### 2. ✅ Next.js Denial of Service with Server Components (CVE-2025-55183) - HIGH

**Fix**: Updated `next` from `^16.0.7` to `^16.1.1` and updated override accordingly.

### 3. ✅ Next Server Actions Source Code Exposure (CVE-2025-55183) - MODERATE

**Fix**: Same as #2 — Next.js 16.1.1 includes the patch.

### 4. ✅ Preact JSON VNode Injection vulnerability - HIGH

**Fix**: Added `"preact": ">=10.28.2"` to `pnpm.overrides`.

### 5. ⚠️ request package SSRF vulnerability (CVE-2023-28155) - MODERATE

**Status**: Acceptable risk — `request` package is only used in dev/test environments via `@nomiclabs/hardhat-waffle`. Never runs in production. No patched version available.

## Verification

- ✅ Main project: `pnpm install` completed successfully
- ✅ Auth-server: `npm audit` shows **0 vulnerabilities**
- ✅ All high-severity vulnerabilities fixed
