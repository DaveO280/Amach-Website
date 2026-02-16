"use client";

import { PrivyProvider as PrivyProviderBase } from "@privy-io/react-auth";
import React, { useMemo } from "react";
import {
  zkSyncSepoliaTestnet,
  zkSyncMainnet,
  getActiveChain,
} from "@/lib/networkConfig";

export default function PrivyProvider({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  // Get the active chain based on environment (call unconditionally to maintain hook order)
  // Memoize to ensure stable reference across renders
  const activeChain = useMemo(() => getActiveChain(), []);

  // Memoize config to ensure stable reference across renders
  // This prevents Privy from re-initializing when the signature modal appears
  const privyConfig = useMemo(
    () => ({
      loginMethods: ["email", "wallet"] as ("email" | "wallet")[],
      // Configure zkSync as the default chain
      defaultChain: activeChain,
      supportedChains: [zkSyncSepoliaTestnet, zkSyncMainnet],
      embeddedWallets: {
        ethereum: {
          createOnLogin: "users-without-wallets" as const,
        },
      },
      // Custom branding to match Amach Health
      appearance: {
        theme: "light" as const,
        accentColor: "#10B981" as `#${string}`, // emerald-500 - matches Amach green
        logo: "/icon.svg", // Your Amach logo
        showWalletLoginFirst: true,
        walletList: ["metamask", "coinbase_wallet", "wallet_connect"] as (
          | "metamask"
          | "coinbase_wallet"
          | "wallet_connect"
        )[],
      },
      // Customize the login modal
      legal: {
        termsAndConditionsUrl: "https://amach.health/terms",
        privacyPolicyUrl: "https://amach.health/privacy",
      },
    }),
    [activeChain],
  );

  // Debug logging (only in development, and only once)
  React.useEffect(() => {
    if (
      typeof window !== "undefined" &&
      process.env.NODE_ENV === "development"
    ) {
      console.log("🔧 Privy Provider initializing with:", {
        appId: appId?.substring(0, 10) + "...",
        activeChain: activeChain.name,
        chainId: activeChain.id,
      });
    }
  }, [appId, activeChain]);

  // Suppress React warnings about isActive prop from Privy's styled-components
  // This is a known issue with Privy's internal components that we can't fix
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const originalError = console.error;
      console.error = (...args: unknown[]): void => {
        // Filter out the isActive prop warning from Privy's styled-components
        if (
          typeof args[0] === "string" &&
          args[0].includes("isActive") &&
          args[0].includes("DOM element")
        ) {
          // Suppress this specific error - it's from Privy's internal code
          return;
        }
        originalError(...args);
      };

      return (): void => {
        console.error = originalError;
      };
    }
  }, []);

  // Always render PrivyProviderBase with the same structure to maintain hook order
  // Use the actual appId or skip rendering during build if missing
  // During static generation (SSG/ISR), we can't use Privy, so return children directly
  const isBuildTime = typeof window === "undefined" && !appId;

  if (isBuildTime) {
    // During build without app ID, just render children to allow static generation
     
    return children as JSX.Element;
  }

  const effectiveAppId =
    appId && appId.trim() !== "" ? appId : "placeholder-missing-app-id";

  // If appId is missing, show error but still render PrivyProviderBase to maintain component structure
  // This prevents "Rendered fewer hooks than expected" errors
  if (!appId || appId.trim() === "") {
    if (typeof window !== "undefined") {
      console.error(
        "❌ NEXT_PUBLIC_PRIVY_APP_ID not set. Please configure this environment variable.",
      );
    }
  }

  return (
    <PrivyProviderBase appId={effectiveAppId} config={privyConfig}>
      {appId && appId.trim() !== "" ? (
        children
      ) : (
        <div className="min-h-screen flex items-center justify-center bg-red-50">
          <div className="text-center p-8 bg-white rounded-lg shadow-lg max-w-md">
            <h1 className="text-2xl font-bold text-red-600 mb-4">
              Configuration Error
            </h1>
            <p className="text-gray-700 mb-2">
              The Privy App ID is not configured in environment variables.
            </p>
            <p className="text-sm text-gray-600">
              Please set{" "}
              <code className="bg-gray-100 px-2 py-1 rounded">
                NEXT_PUBLIC_PRIVY_APP_ID
              </code>{" "}
              and redeploy.
            </p>
          </div>
        </div>
      )}
    </PrivyProviderBase>
  );
}
