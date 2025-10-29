"use client";

import { useZkSyncSsoWallet } from "../hooks/useZkSyncSsoWallet";

export default function GlobalWalletStatus(): JSX.Element | null {
  const { isConnected, activeSession } = useZkSyncSsoWallet();

  if (!isConnected) return null;

  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
      <span className="text-emerald-700 font-medium">Connected</span>
      {activeSession && <span className="text-emerald-600">•</span>}
    </div>
  );
}
