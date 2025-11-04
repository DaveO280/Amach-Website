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
    const isEnabled =
      urlParams.get("eruda") === "true" ||
      localStorage.getItem("eruda-enabled") === "true";

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
