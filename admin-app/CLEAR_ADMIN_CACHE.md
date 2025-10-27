# Clear Admin Dashboard Cache

If you're seeing old/cached data in the admin dashboard, follow these steps:

## Method 1: Hard Refresh (Easiest)

1. Open `http://localhost:3001`
2. Press `Ctrl + Shift + Delete` (Windows) or `Cmd + Shift + Delete` (Mac)
3. Select:
   - ✅ Cookies and other site data
   - ✅ Cached images and files
   - ✅ Time range: "All time"
4. Click "Clear data"
5. Close the browser completely
6. Reopen and go to `http://localhost:3001`

## Method 2: DevTools Clear (Most Thorough)

1. Open `http://localhost:3001`
2. Press `F12` to open DevTools
3. Go to **Application** tab (Chrome) or **Storage** tab (Firefox)
4. Under **Storage**, right-click on `http://localhost:3001` and select **"Clear site data"**
5. Manually verify each storage is empty:
   - Local Storage → Should show 0 items
   - Session Storage → Should show 0 items
   - IndexedDB → Should show 0 databases
   - Cache Storage → Should show 0 caches
6. Go to **Network** tab
7. Click **"Disable cache"** checkbox
8. Hard refresh: `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (Mac)

## Method 3: Incognito/Private Window (Cleanest)

1. Open a new **Incognito/Private** window
2. Go to `http://localhost:3001`
3. This will load with completely fresh state

## Verify Clean State

After clearing, the admin dashboard should show:

- ✅ **0 Whitelisted Emails**
- ✅ **0 Verified Users**
- ✅ **0 Allocations**
- ✅ **0 Token Claims**

Then you can add your first email to the whitelist!

## Why This Happens

The admin dashboard uses React state management which can cache data in:

- Browser localStorage
- Browser sessionStorage
- React component state (cleared on page refresh)
- Service worker cache (if enabled)

A hard refresh ensures all of these are cleared.
