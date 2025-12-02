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

  // If appId is missing, return children without PrivyProvider
  // This allows the app to work even if Privy isn't configured
  if (!appId || appId.trim() === "") {
    if (typeof window !== "undefined") {
      console.warn(
        "⚠️ NEXT_PUBLIC_PRIVY_APP_ID not set. Privy features will not work.",
      );
    }
    return children as JSX.Element;
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
