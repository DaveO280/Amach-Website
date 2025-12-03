"use client";

import { useEffect } from "react";

// Type declarations for window
declare global {
  interface Window {
    testZKsyncSSO?: () => Promise<void>;
    zksyncSSODiagnostics?: {
      printSsoDiagnostics: () => Promise<void>;
      testAuthServerAccess: (
        network: "testnet" | "mainnet",
      ) => Promise<unknown>;
      checkLocalSsoConfiguration: () => unknown;
      runSsoDiagnostics: () => Promise<unknown>;
      getAllSsoDiagnostics: () => Promise<unknown>;
    };
  }
}

/**
 * Loads SSO diagnostics and exposes them to window object for browser console access
 *
 * After this loads, you can run in browser console:
 * - window.testZKsyncSSO() - Run full diagnostics
 * - window.zksyncSSODiagnostics - Access all diagnostic functions
 */
export default function SsoDiagnosticsLoader(): null {
  useEffect(() => {
    // Only run on client side
    if (typeof window === "undefined") return;

    import("@/utils/zksyncSsoDiagnostics")
      .then((diagnostics) => {
        // Expose diagnostic functions to window for console access
        window.testZKsyncSSO = diagnostics.printSsoDiagnostics;
        window.zksyncSSODiagnostics = diagnostics;
        console.log("✅ SSO Diagnostics available!");
        console.log("   Run: await window.testZKsyncSSO()");
        console.log("   Or access: window.zksyncSSODiagnostics");
      })
      .catch((error) => {
        console.warn("⚠️ Could not load SSO diagnostics:", error);
      });
  }, []);

  return null;
}
