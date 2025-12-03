# Diagnose Auth Server Response

## Quick Diagnostic Script

Run this in your browser console **on a fresh page** (not the blank popup):

```javascript
// Diagnostic script to check what auth server returns
async function diagnoseAuthServer() {
  console.log("🔍 Diagnosing auth server response...\n");

  const url =
    "https://auth-test.zksync.dev/confirm?origin=https://localhost:3000";

  try {
    // Fetch the URL
    console.log("📡 Fetching:", url);
    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      mode: "cors",
    });

    console.log("\n📊 Response Status:");
    console.log("  Status:", response.status);
    console.log("  Status Text:", response.statusText);
    console.log("  OK:", response.ok);

    console.log("\n📋 Response Headers:");
    for (const [key, value] of response.headers.entries()) {
      console.log(`  ${key}: ${value}`);
    }

    const text = await response.text();
    console.log("\n📄 Response Body:");
    console.log("  Length:", text.length, "characters");
    console.log("  Is Empty:", text.length === 0);

    if (text.length > 0) {
      console.log("\n  First 500 characters:");
      console.log(text.substring(0, 500));

      console.log("\n  HTML Structure:");
      console.log("    Has DOCTYPE:", text.includes("<!DOCTYPE"));
      console.log("    Has <html>:", text.includes("<html"));
      console.log("    Has <head>:", text.includes("<head"));
      console.log("    Has <body>:", text.includes("<body"));
      console.log("    Has <script>:", text.includes("<script"));
      console.log('    Has "ZKsync":', text.includes("ZKsync"));

      // Look for error messages
      if (text.toLowerCase().includes("error")) {
        console.log('\n  ⚠️ Contains "error" keyword');
        const errorMatch = text.match(/error[^<]*/i);
        if (errorMatch)
          console.log("    Context:", errorMatch[0].substring(0, 100));
      }
    }

    // Also check base URL
    console.log("\n\n🔍 Checking base auth server URL...");
    const baseResponse = await fetch("https://auth-test.zksync.dev/", {
      method: "GET",
    });
    const baseText = await baseResponse.text();
    console.log("  Base URL status:", baseResponse.status);
    console.log("  Base URL has content:", baseText.length > 0);
  } catch (error) {
    console.error("❌ Error:", error);
    console.error("  Message:", error.message);
    console.error("  Stack:", error.stack);
  }
}

// Run it
diagnoseAuthServer();
```

## What This Will Tell Us

1. **Status code** - Is the server responding?
2. **Response headers** - Any security policies blocking?
3. **Response body** - What HTML/content is returned?
4. **Error messages** - Any clues in the response?

## Also Check Network Tab Manually

1. Open DevTools **before** navigating
2. Go to **Network tab**
3. Navigate to: `https://auth-test.zksync.dev/confirm?origin=https://localhost:3000`
4. **Refresh the Network tab** if it's empty (Ctrl+R)
5. Look for the request - it should appear
6. Click on it and check:
   - **Status code**
   - **Response tab** (what's in the body?)
   - **Headers tab** (any error headers?)

## Share the Results

Please run the script above and share:

1. The **status code**
2. The **response body length** and **first 500 characters**
3. Any **error messages** you see
4. What the **Network tab** shows (if anything)

This will tell us exactly what the auth server is returning and why it's blank.
