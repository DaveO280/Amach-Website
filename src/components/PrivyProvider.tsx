"use client";

import { PrivyProvider as PrivyProviderBase } from "@privy-io/react-auth";
import React from "react";
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

  // If appId is missing, show error instead of returning unwrapped children
  // This prevents hooks from being called outside the PrivyProvider context
  if (!appId || appId.trim() === "") {
    if (typeof window !== "undefined") {
      console.error(
        "❌ NEXT_PUBLIC_PRIVY_APP_ID not set. Please configure this environment variable.",
      );
    }
    return (
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
    );
  }

  // Get the active chain based on environment
  const activeChain = getActiveChain();

  // Per Privy docs: https://docs.privy.io/wallets/overview
  // PrivyProvider handles SSR automatically
  //
  // NOTE: Solana is NOT configured here. If you see Solana-related errors,
  // disable Solana in your Privy dashboard/app settings, not just in code.
  // Privy will auto-initialize any wallet types enabled in the dashboard.

  // Debug logging
  if (typeof window !== "undefined") {
    console.log("🔧 Privy Provider initializing with:", {
      appId: appId?.substring(0, 10) + "...",
      activeChain: activeChain.name,
      chainId: activeChain.id,
    });
  }

  return (
    <PrivyProviderBase
      appId={appId}
      config={{
        loginMethods: ["email", "wallet"],
        // Configure zkSync as the default chain
        defaultChain: activeChain,
        supportedChains: [zkSyncSepoliaTestnet, zkSyncMainnet],
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
        },
        // Custom branding to match Amach Health
        appearance: {
          theme: "light",
          accentColor: "#10B981", // emerald-500 - matches Amach green
          logo: "/icon.svg", // Your Amach logo
          showWalletLoginFirst: true,
          walletList: ["metamask", "coinbase_wallet", "wallet_connect"],
        },
        // Customize the login modal
        legal: {
          termsAndConditionsUrl: "https://amach.health/terms",
          privacyPolicyUrl: "https://amach.health/privacy",
        },
      }}
    >
      {children}
    </PrivyProviderBase>
  );
}
