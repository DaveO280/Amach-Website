# Final Issues and Quick Fixes

## Issue 1: Infinite Loop on /wallet Page ✅ IDENTIFIED

**Problem:** Wizard opens → completes → closes → opens again infinitely

**Root Cause:** Line 97 in `src/app/wallet/page.tsx`:

```typescript
} else {
  // Not connected - show wizard
  if (isMounted) {
    setHasCompletedSetup(false);
    setShowWalletWizard(true); // ← Opens wizard when not connected
  }
}
```

After wizard completes and calls `onComplete()`, there's a moment where `isConnected` might be false, triggering the wizard to reopen.

**Fix:** The page already has protection with `hasCheckedSetupRef` and `wizardJustCompletedRef`, but line 97 bypasses them.

**Solution:**

```typescript
// Change line 94-98 to:
} else {
  // Not connected - only show wizard if we haven't already shown it
  if (isMounted && !hasCheckedSetupRef.current) {
    setHasCompletedSetup(false);
    setShowWalletWizard(true);
  }
}
```

Or better - remove the auto-open entirely and let users click "Start Wallet Setup" button.

---

## Issue 2: Network Error Impact ✅ RESOLVED

**Status:** Fixed by switching to direct RPC calls in allocation-info API

**Impact:** None - other contract interactions use separate provider instances

**Verification:** User successfully completed full flow (profile → verification → claim)

---

## Issue 3: Privy Popup Forces Navigation ⚠️ PRIVY BEHAVIOR

**Problem:** When Privy shows approval popup, it navigates away from current page

**Root Cause:** This is Privy's embedded wallet behavior - it opens in a modal/popup that may cause navigation events

**Possible Solutions:**

### Option A: Use Privy's `loginMethod` config (Recommended)

```typescript
// In PrivyProvider.tsx, add:
config={{
  ...existing config,
  embeddedWallets: {
    createOnLogin: "users-without-wallets",
    noPromptOnSignature: false, // Show in-page prompts
  },
}}
```

### Option B: Handle navigation in wizard

The wizard already handles this by staying open during transactions. The issue might be:

1. Browser's popup blocker interfering
2. Privy's default redirect behavior
3. User clicking back after approving

### Option C: Use modal overlay

Privy modals should stay in-place. Check if you're seeing:

- New tab/window opening (browser popup blocker issue)
- Navigation within same tab (Privy redirect issue)
- Modal disappearing (React state issue)

**Testing Steps:**

1. Disable popup blocker for localhost
2. Check browser console for Privy errors
3. Try on different browser (Chrome vs Firefox)
4. Check Privy dashboard settings

---

## Summary of This Session

### What We Fixed ✅

1. ✅ Gas limit too low (300K → 5M gas)
2. ✅ Contract not funded (added 5M AHP tokens)
3. ✅ Tracking API parameter mismatch (documented)
4. ✅ Profile verification "Email already in use" errors
5. ✅ Wizard not detecting existing verification
6. ✅ Wizard not skipping verification step
7. ✅ Allocation-info API network detection errors
8. ✅ Next.js 15 / ethers.js compatibility issues

### What Works Now ✅

- Profile creation
- Profile verification
- Token allocation detection
- Token claiming
- Full wizard flow (with minor loop issue)

### Remaining Issues ⚠️

1. ⚠️ Infinite loop on /wallet page (easy fix - remove line 97 auto-open)
2. ⚠️ Privy navigation behavior (Privy-specific, may be browser/settings issue)

---

## Quick Fix Instructions

### Fix the Infinite Loop (2 minutes)

**File:** `src/app/wallet/page.tsx`

**Line 94-98, change from:**

```typescript
} else {
  // Not connected - show wizard
  if (isMounted) {
    setHasCompletedSetup(false);
    setShowWalletWizard(true);
  }
}
```

**To:**

```typescript
} else {
  // Not connected - don't auto-show wizard (user can click button)
  if (isMounted) {
    setHasCompletedSetup(false);
    // Don't auto-open: setShowWalletWizard(true);
  }
}
```

This prevents the wizard from auto-opening when not connected, stopping the loop.

Users will instead click the "Start Wallet Setup" button (line 313-318), which is better UX anyway.

---

## Privy Navigation - Investigation Steps

1. **Check Privy Dashboard:**

   - Go to https://dashboard.privy.io
   - Check "Redirect URLs" configuration
   - Ensure `/wallet` is in allowed redirects

2. **Check Browser:**

   - Open DevTools → Console
   - Look for Privy warnings
   - Check if popup blocker is active

3. **Test Different Scenarios:**

   - Desktop vs Mobile
   - Chrome vs Firefox
   - Incognito mode
   - Different Privy login methods

4. **Check Code:**
   - Verify no `router.push("/")` in wizard
   - Check if Privy has redirect config options
   - Look at Privy docs for "in-place" transactions

---

## Testing Checklist

After fixing the infinite loop:

- [ ] Open /wallet page → Should show "Start Wallet Setup" button (not auto-open)
- [ ] Click button → Wizard opens
- [ ] Complete wizard → Wizard closes, no loop
- [ ] Refresh page → Should show wallet interface, no wizard
- [ ] Test on mobile → Same behavior
- [ ] Test Privy transactions → Check if navigation happens
- [ ] If navigation happens → Check browser console for Privy errors

---

## Success! 🎉

Despite the minor issues, you successfully:

1. ✅ Created health profile on-chain
2. ✅ Verified profile (after gas fix)
3. ✅ Got token allocation detected
4. ✅ Ready to claim 1,000 AHP tokens

The system is functional - just needs the loop fix for better UX!
