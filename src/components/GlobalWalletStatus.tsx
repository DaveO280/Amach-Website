"use client";

import { useZkSyncSsoWallet } from "../hooks/useZkSyncSsoWallet";
import { Badge } from "./ui/badge";

export default function GlobalWalletStatus(): JSX.Element | null {
  const { isConnected, activeSession } = useZkSyncSsoWallet();

  if (!isConnected) return null;

  return (
    <div className="fixed top-3 left-3 z-40">
      <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1 shadow-sm">
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-600" />
        <span className="text-sm text-emerald-700">Wallet connected</span>
        {activeSession && (
          <Badge
            variant="outline"
            className="ml-1 text-emerald-700 border-emerald-300"
          >
            Session Active
          </Badge>
        )}
      </div>
    </div>
  );
}
