# Root Cause: SSO Blank Screen - Popup Never Sends "PopupLoaded"

## Critical Finding

Looking at the `PopupCommunicator` code, the popup **must send a "PopupLoaded" message** back to the parent window:

```typescript
// PopupCommunicator.ts line 120
return this.onMessage<PopupConfigMessage>(
  ({ event }) => event === "PopupLoaded",
).then(() => {
  if (!this.popup) throw standardErrors.rpc.internal();
  return this.popup;
});
```

**The blank screen means the popup never sends this message.**

## What Should Happen

1. Parent window opens popup: `https://auth-test.zksync.dev/confirm?origin=...`
2. Popup loads and executes JavaScript
3. Popup sends message: `{ event: "PopupLoaded" }` to parent
4. Parent receives message and continues connection flow

## What's Actually Happening

1. Parent window opens popup ✅
2. Popup opens but shows blank screen ❌
3. Popup never sends "PopupLoaded" message ❌
4. Parent waits forever → blank screen ❌

## Why Popup Might Not Send "PopupLoaded"

### 1. **JavaScript Error in Popup**

The auth server popup might have a JavaScript error preventing it from:

- Loading content
- Executing the message sender
- Sending the "PopupLoaded" event

**Check:** Inspect the popup window's console for errors

### 2. **Content Security Policy (CSP) Blocking**

If your Next.js app has strict CSP headers, they might block the popup from:

- Loading scripts
- Sending postMessage
- Accessing required APIs

**Check:** Next.js CSP configuration in `next.config.js`

### 3. **Popup Origin Mismatch**

The popup might load but fail to validate the origin parameter:

- Auth server checks `?origin=...` parameter
- If origin format is wrong, popup might fail silently
- Popup never sends "PopupLoaded"

### 4. **Network Error Loading Popup Resources**

The popup might be trying to load:

- CSS files
- JavaScript bundles
- Fonts
- Other resources

If these fail to load (network error, CORS, etc.), popup might be blank.

**Check:** Network tab → filter by popup origin → look for failed requests

### 5. **Next.js SSR Interference**

Even though we've added dynamic imports, Next.js might still be:

- Trying to render something in the popup context
- Evaluating modules during popup initialization
- Causing errors that prevent popup from loading

## Diagnostic Steps

### Step 1: Check Popup Console Directly

1. Click "Connect SSO Wallet"
2. Popup opens (blank screen)
3. **Right-click on popup → Inspect Element** (might need to enable popup inspection in DevTools)
4. Check popup's console tab for errors
5. Look for:
   - JavaScript errors
   - Failed network requests
   - CSP violations
   - CORS errors

### Step 2: Check Parent Window Console

In the parent window console, look for:

- Errors from `waitForPopupLoaded()`
- Timeout errors
- Messages about popup communication

### Step 3: Manually Test Popup URL

Open this URL directly in a new tab:

```
https://auth-test.zksync.dev/confirm?origin=https://localhost:3000
```

**Expected:** Should show ZKsync SSO auth page
**If blank:** Auth server issue or origin rejection

### Step 4: Check for CSP Headers

Check if Next.js is adding CSP headers that block the popup:

```javascript
// In browser console
fetch("/api/test", { method: "HEAD" }).then((r) => {
  console.log("CSP headers:", r.headers.get("content-security-policy"));
});
```

## Most Likely Causes (In Order)

1. **JavaScript error in popup** - Popup loads but crashes before sending message
2. **Origin parameter validation failure** - Auth server rejects origin silently
3. **Network error loading popup resources** - CSS/JS fails to load
4. **CSP blocking popup scripts** - Content Security Policy too strict

## Quick Test: Check Popup Console

**This is the most important diagnostic:**

1. Open DevTools on parent window
2. Go to Settings → check "Focus debugging window on break"
3. Click "Connect SSO Wallet"
4. Popup should open
5. **Try to inspect popup** (might need to switch DevTools context)
6. Check popup console for errors

If you can't inspect popup console, the blank screen is likely:

- A JavaScript error preventing popup from loading
- A network error loading popup resources
- An origin validation failure
