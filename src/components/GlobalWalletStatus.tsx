"use client";

import { useWalletService } from "../hooks/useWalletService";

export default function GlobalWalletStatus(): JSX.Element | null {
  const { isConnected } = useWalletService();

  if (!isConnected) return null;

  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
      <span className="text-emerald-700 font-medium">Connected</span>
    </div>
  );
}
