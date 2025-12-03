# Privy Browser Console Test

## Quick Test (Copy-Paste into Browser Console)

1. Navigate to any page in your app (e.g., `http://localhost:3000`)
2. Open browser console (F12)
3. Connect Privy wallet if not already connected
4. Copy and paste this script:

```javascript
(async function testPrivy() {
  console.log("\n🧪 TESTING PRIVY SIGNATURE DETERMINISM...\n");

  try {
    // Import Privy hooks
    const { useWallets, usePrivy } = await import("@privy-io/react-auth");

    // Note: This won't work directly in console because hooks need React context
    // Instead, we'll access Privy through the window object if available

    // Check if Privy is available
    if (typeof window.__PRIVY__ === "undefined") {
      console.error(
        "❌ Privy not loaded. Make sure you have PrivyProvider set up.",
      );
      console.log(
        "\nTIP: Use the PrivyTestWidget component or test-privy page instead.",
      );
      return;
    }

    // Alternative: Access wallets through Privy's internal state
    // This requires Privy to be initialized
    console.log("✅ Privy is loaded");
    console.log(
      "⚠️  Note: For full testing, use the test page or widget component",
    );
    console.log("   Navigate to: http://localhost:3000/test-privy");
  } catch (error) {
    console.error("❌ Error:", error);
    console.log("\n💡 Use one of these alternatives:");
    console.log("   1. Navigate to /test-privy page");
    console.log("   2. Add PrivyTestWidget to any page");
    console.log("   3. Check browser console on /test-privy for detailed logs");
  }
})();
```

## Better Alternative: Use the Test Widget

Instead of console testing, you can add the `PrivyTestWidget` component to any page:

```tsx
import PrivyTestWidget from "@/components/PrivyTestWidget";

// Add to any page:
<PrivyTestWidget />;
```

## Recommended: Use the Test Page

The easiest way is to navigate to:
**http://localhost:3000/test-privy**

This page has full functionality and error handling.
