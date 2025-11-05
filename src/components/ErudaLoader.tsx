"use client";

import { useEffect } from "react";

// Type declaration for Eruda
declare global {
  interface Window {
    eruda?: {
      init: () => void;
      destroy: () => void;
    };
  }
}

/**
 * Eruda Mobile Debug Console Loader
 *
 * Loads Eruda when:
 * - URL has ?eruda=true parameter, OR
 * - localStorage has 'eruda-enabled' = 'true'
 *
 * Usage:
 * - Add ?eruda=true to any URL to enable for that session
 * - Set localStorage.setItem('eruda-enabled', 'true') to enable permanently
 * - Set localStorage.removeItem('eruda-enabled') to disable
 */
export default function ErudaLoader(): null {
  useEffect(() => {
    // Only load on client side
    if (typeof window === "undefined") return;

    const urlParams = new URLSearchParams(window.location.search);
    const isProd = process.env.NODE_ENV === "production";
    const allowLocalStorageInProd =
      process.env.NEXT_PUBLIC_ENABLE_ERUDA_IN_PROD === "true";

    // In production: only enable via URL (?eruda=true) by default.
    // Optionally allow localStorage toggle in prod with NEXT_PUBLIC_ENABLE_ERUDA_IN_PROD=true
    const enabledViaUrl = urlParams.get("eruda") === "true";
    const enabledViaLocalStorage =
      !isProd || allowLocalStorageInProd
        ? localStorage.getItem("eruda-enabled") === "true"
        : false;

    const isEnabled = enabledViaUrl || enabledViaLocalStorage;

    if (!isEnabled) return;

    // Check if Eruda is already loaded
    if (window.eruda) {
      return;
    }

    // Load Eruda from CDN
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/eruda@3.0.1/eruda.js";
    script.async = true;
    script.onload = (): void => {
      if (typeof window.eruda !== "undefined") {
        window.eruda.init();
        console.log("✅ Eruda debug console loaded");
      }
    };
    script.onerror = (): void => {
      console.error("❌ Failed to load Eruda");
    };
    document.head.appendChild(script);

    // Cleanup on unmount
    return (): void => {
      if (window.eruda) {
        window.eruda.destroy();
      }
    };
  }, []);

  return null;
}
