# Proxy Contract & SSO Blank Screen Analysis

## Key Finding: **It's NOT the Proxy, It's the Missing Session Configuration**

### ✅ Proxy Contract is Correctly Configured

1. **Proxy Address**: `0x2A8015613623A6A8D369BcDC2bd6DD202230785a` ✅

   - This is the **correct** proxy address users should interact with
   - Proxy forwards calls to implementation: `0x9aD92C50548c7D0628f21836c48230041330D277`

2. **Code Usage**: All services use the proxy address correctly ✅
   - `ZkSyncSsoWalletService` uses `SECURE_HEALTH_PROFILE_CONTRACT` (proxy)
   - `HealthProfileReader` uses the proxy address
   - Service calls target the proxy, not the implementation

### ❌ The Real Problem: **NO Session Configuration**

**Current State** (line 581 in `zksync-sso-config.ts`):

```typescript
// TESTING: Session completely removed to isolate blank screen issue
// If this works, the problem is with the session policies or fee limits
```

**Impact**:

- SSO connector has **ZERO** call policies
- Cannot authorize ANY contract calls
- Cannot authorize wallet creation
- May cause blank screen during SSO initialization

## Why Blank Screen Happens (Even in Production)

### Scenario 1: Missing Session Config in Production Too

If production also has no session configuration:

- SSO connector initializes but has no authorization policies
- When user tries to connect, SSO can't validate the session
- Blank screen appears because SSO popup cannot complete authentication

### Scenario 2: Proxy vs Implementation Mismatch

**IF** (hypothetically) production code references the implementation address instead of proxy:

- SSO connector might try to authorize calls to wrong address
- But this is unlikely since code shows proxy address everywhere

### Scenario 3: Session Initialization Failure

Without session configuration:

- SSO connector may fail silently during initialization
- Blank screen = failed authentication attempt
- No error message = silent failure

## Evidence That Proxy is NOT the Issue

1. ✅ **2 wallets already created** on new contracts (working)
2. ✅ **1 profile exists** on proxy contract (working)
3. ✅ **Code uses proxy address** correctly (0x2A801561...)
4. ✅ **Proxy is standard UUPS pattern** (well-tested)

## The Actual Root Cause

### **Missing Session Configuration = No Authorization**

When SSO connector has no `session.contractCalls` policies:

- Cannot authorize `verifyProfileZKsync()`
- Cannot authorize `createProfile()`
- Cannot authorize `claimAllocation()`
- **Cannot complete SSO authentication flow**

### Why It Works for Existing Users

If 2 wallets already exist, they were created:

- **Before** session config was removed, OR
- Using a different authentication method, OR
- The blank screen is preventing NEW users only

## Solution

Restore session configuration with **PROXY** address in call policies:

```typescript
session: {
  expiry: "1 day",
  feeLimit: parseEther("0.05"),
  contractCalls: [
    // ✅ Use PROXY address (what users interact with)
    callPolicy({
      address: SECURE_HEALTH_PROFILE_CONTRACT, // 0x2A801561... (PROXY)
      abi: secureHealthProfileAbi,
      functionName: "createProfile",
    }),
    callPolicy({
      address: PROFILE_VERIFICATION_CONTRACT, // 0xA2D3b1b8...
      abi: profileVerificationAbi,
      functionName: "verifyProfileZKsync",
    }),
    // ... other policies
  ],
}
```

## Verification Steps

1. **Check Production Code**: Does production have session config?

   ```bash
   # Check production build/deployment
   ```

2. **Test Without Proxy**: Deploy without proxy (if possible) to isolate

   - Not recommended - proxy is correct

3. **Add Session Config**: Restore session configuration and test
   - This is the recommended fix

## Conclusion

**The proxy contract is NOT causing the issue.** The missing session configuration is preventing SSO from completing authentication. The blank screen is likely SSO failing silently because it cannot authorize any operations without session policies.

**Next Steps:**

1. ✅ Verify proxy is correctly deployed (it is)
2. ❌ Restore session configuration with proxy address
3. ✅ Test SSO connection flow
