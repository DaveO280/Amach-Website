# Check What Auth Server Actually Returns

## Critical Diagnostic

Since the page title shows "ZKsync SSO" but content is blank, the HTML is loading but empty or broken. Let's check what the server actually returns.

## Step 1: Check Network Response

When you open `https://auth-test.zksync.dev/confirm?origin=https://localhost:3000`:

1. **Open DevTools** (F12) **BEFORE** navigating
2. **Go to Network tab**
3. **Navigate to the URL**
4. **Click on the request** in the Network tab (should be the first one)
5. **Check:**

   - **Status Code:** What is it? (200, 400, 403, 500?)
   - **Response Headers:** Look for:
     - `Content-Type`
     - `Content-Length`
     - Any error headers
   - **Response Body:** What does it contain?
     - Is it completely empty?
     - Is there HTML but no body content?
     - Is there an error message?

## Step 2: Check Response Body Directly

Run this in your browser console **while on the blank page**:

```javascript
// Check if document has any content
console.log("Document title:", document.title);
console.log("Document body:", document.body);
console.log("Document HTML length:", document.documentElement.innerHTML.length);
console.log(
  "Document HTML (first 1000 chars):",
  document.documentElement.innerHTML.substring(0, 1000),
);

// Check for scripts
console.log("Scripts:", document.scripts.length);
Array.from(document.scripts).forEach((s, i) => {
  console.log(`Script ${i}:`, s.src || s.innerHTML.substring(0, 100));
});

// Check for any error messages in HTML
if (document.body) {
  console.log("Body innerHTML:", document.body.innerHTML);
}
```

## Step 3: Fetch the URL Directly

Run this in your console to see the raw response:

```javascript
fetch("https://auth-test.zksync.dev/confirm?origin=https://localhost:3000")
  .then(async (r) => {
    console.log("Status:", r.status);
    console.log("Status Text:", r.statusText);
    console.log("Headers:", [...r.headers.entries()]);

    const text = await r.text();
    console.log("Response length:", text.length);
    console.log("Response (first 2000 chars):", text.substring(0, 2000));
    console.log("Has DOCTYPE:", text.includes("<!DOCTYPE"));
    console.log("Has body tag:", text.includes("<body"));
    console.log("Has script tags:", text.includes("<script"));
  })
  .catch((e) => console.error("Error:", e));
```

## Step 4: Test Base Auth Server URL

Check if the base auth server URL works:

```javascript
fetch("https://auth-test.zksync.dev/")
  .then((r) => r.text())
  .then((html) => {
    console.log("Base URL response length:", html.length);
    console.log("Base URL has content:", html.length > 0);
  })
  .catch((e) => console.error("Base URL error:", e));
```

## What to Look For

Based on the results:

1. **If status is 200 but body is empty:**

   - Auth server is returning empty HTML
   - Could be a bug or server issue

2. **If status is 4xx (400, 403, etc.):**

   - Auth server is rejecting the request
   - Check response body for error message

3. **If status is 500:**

   - Auth server error
   - Check response body for details

4. **If HTML exists but no scripts load:**

   - CSP or security headers blocking resources
   - Check response headers for CSP directives

5. **If Network tab shows no request at all:**
   - Browser is blocking/caching
   - Try hard refresh (Ctrl+Shift+R)

## Share Results

Please share:

1. **Status code** from Network tab
2. **Response body content** (first 1000 chars)
3. **Any error messages** in the response
4. **Response headers** (especially Content-Type, Content-Length)

This will tell us what the auth server is actually returning.
