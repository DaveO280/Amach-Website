"use client";

import { HealthProfileManager } from "../../components/HealthProfileManager";
import { CryptoWallet } from "../../components/CryptoWallet";
import { WalletSummaryWidget } from "../../components/WalletSummaryWidget";
import { useEffect } from "react";
import { useZkSyncSsoWallet } from "../../hooks/useZkSyncSsoWallet";

export default function WalletPage(): JSX.Element {
  const { isConnected, getBalance, loadProfileFromBlockchain, refreshProfile } =
    useZkSyncSsoWallet();

  // Auto-load wallet data when visiting this page if already connected
  useEffect((): void => {
    if (!isConnected) return;
    void getBalance();
    void (async (): Promise<void> => {
      const result = await loadProfileFromBlockchain();
      if (result.success) refreshProfile();
    })();
  }, [isConnected, getBalance, loadProfileFromBlockchain, refreshProfile]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-6">
          <WalletSummaryWidget />
          <div className="p-4 border border-gray-200 rounded-lg bg-white">
            <CryptoWallet />
          </div>
        </div>

        <div className="lg:col-span-8 space-y-6">
          <div className="p-4 border border-gray-200 rounded-lg bg-white">
            <HealthProfileManager />
          </div>
        </div>
      </div>
    </div>
  );
}
