/**
 * Debug script to intercept window.open and see what URL is being opened
 *
 * Run this in browser console BEFORE clicking "Connect SSO Wallet"
 */

(function () {
  console.log("🔍 Installing popup URL interceptor...");

  const originalOpen = window.open;
  window.open = function (...args) {
    const url = args[0];
    const name = args[1];
    const features = args[2];

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🔍 POPUP OPEN INTERCEPTED");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("URL:", url);
    console.log("Name:", name);
    console.log("Features:", features);
    console.log("Full args:", args);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Check if URL is valid
    if (url) {
      try {
        const urlObj = new URL(url);
        console.log("✅ URL is valid");
        console.log("   Origin:", urlObj.origin);
        console.log("   Pathname:", urlObj.pathname);
        console.log("   Search:", urlObj.search);
        console.log(
          "   SearchParams:",
          Object.fromEntries(urlObj.searchParams),
        );
      } catch (e) {
        console.error("❌ URL is invalid:", e.message);
      }
    } else {
      console.error("❌ URL is undefined or null!");
    }

    // Try to open the popup
    const popup = originalOpen.apply(this, args);

    if (popup) {
      console.log("✅ Popup window created");

      // Monitor popup state
      const checkInterval = setInterval(() => {
        if (popup.closed) {
          console.log("⚠️ Popup was closed");
          clearInterval(checkInterval);
        } else {
          try {
            const popupUrl = popup.location.href;
            console.log("📍 Popup current URL:", popupUrl);

            // Check if popup navigated away from about:blank
            if (popupUrl && popupUrl !== "about:blank") {
              console.log("✅ Popup navigated to:", popupUrl);
              clearInterval(checkInterval);
            }
          } catch (e) {
            // Cross-origin error is normal - means popup navigated
            if (e.message.includes("cross-origin")) {
              console.log("✅ Popup navigated (cross-origin, cannot read URL)");
              clearInterval(checkInterval);
            } else {
              console.log(
                "⏳ Popup still at about:blank (waiting for navigation)...",
              );
            }
          }
        }
      }, 500);

      // Stop checking after 10 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        console.log("⏱️ Stopped monitoring popup after 10 seconds");
      }, 10000);
    } else {
      console.error("❌ Popup window creation failed! (blocked by browser)");
    }

    return popup;
  };

  console.log(
    '✅ Interceptor installed. Now click "Connect SSO Wallet" and watch the console.',
  );
})();
