"use client";

import {
  Activity,
  Coins,
  Droplet,
  FileCheck,
  Heart,
  Loader2,
  RefreshCw,
  ScanLine,
  Shield,
  Wallet,
} from "lucide-react";
import React, { useEffect } from "react";
import {
  AttestationTier,
  DATA_TYPE_LABELS,
  HealthDataType,
  TIER_LABELS,
  useAttestations,
} from "../hooks/useAttestations";
import { useWalletService } from "../hooks/useWalletService";
import { getTierFromScorePercent } from "../utils/attestationTier";

// Icon mapping for data types
const DATA_TYPE_ICONS: Record<HealthDataType, React.ReactNode> = {
  [HealthDataType.DEXA]: <ScanLine className="h-3 w-3" />,
  [HealthDataType.BLOODWORK]: <Droplet className="h-3 w-3" />,
  [HealthDataType.APPLE_HEALTH]: <Heart className="h-3 w-3" />,
  [HealthDataType.CGM]: <Activity className="h-3 w-3" />,
};

// Tier badge classes — hex values used to avoid amber-* class names
const TIER_COLORS: Record<AttestationTier, string> = {
  [AttestationTier.NONE]:
    "bg-[rgba(0,107,79,0.06)] text-[#6B8C7A] border-[rgba(0,107,79,0.15)]",
  [AttestationTier.BRONZE]:
    "bg-[#FEF3C7] text-[#92400E] border-[#FDE68A] dark:bg-[rgba(161,98,7,0.18)] dark:text-[#FCD34D] dark:border-[rgba(161,98,7,0.3)]",
  [AttestationTier.SILVER]:
    "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  [AttestationTier.GOLD]:
    "bg-[#FEFCE8] text-[#713F12] border-[#FEF08A] dark:bg-[rgba(202,138,4,0.18)] dark:text-[#FDE047] dark:border-[rgba(202,138,4,0.3)]",
};

export const WalletSummaryWidget: React.FC = () => {
  const { isConnected, address, balance, healthProfile, connect, getBalance } =
    useWalletService();
  const {
    attestations,
    isLoading: attestationsLoading,
    hasAnyAttestations,
  } = useAttestations(address);

  useEffect(() => {
    if (isConnected) {
      void getBalance();
    }
  }, [isConnected, getBalance]);

  const shortAddress = (addr?: string | null): string => {
    if (!addr) return "";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  if (!isConnected) {
    return (
      <div className="rounded-xl border bg-white dark:bg-[#0B140F] border-[rgba(0,107,79,0.12)] dark:border-[rgba(0,107,79,0.15)] p-6">
        <div className="flex items-center gap-2 mb-4">
          <Wallet className="h-5 w-5 text-[#006B4F]" />
          <h3 className="font-semibold text-[#0A1A0F] dark:text-[#F0F7F3]">
            Wallet
          </h3>
        </div>
        <button
          onClick={() => {
            void connect();
          }}
          className="w-full bg-[#006B4F] hover:bg-[#005A40] text-white rounded-lg px-4 py-2 font-medium transition-colors flex items-center justify-center gap-2"
          aria-label="Connect Wallet"
        >
          <Wallet className="h-4 w-4" />
          Connect Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white dark:bg-[#0B140F] border-[rgba(0,107,79,0.12)] dark:border-[rgba(0,107,79,0.15)] p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-[#006B4F]" />
          <h3 className="font-semibold text-[#0A1A0F] dark:text-[#F0F7F3]">
            Wallet
          </h3>
        </div>
        {healthProfile && (
          <span className="inline-flex items-center gap-1 bg-[rgba(0,107,79,0.1)] dark:bg-[rgba(0,107,79,0.15)] text-[#006B4F] dark:text-[#4ade80] text-xs font-medium px-2 py-0.5 rounded-full">
            <Shield className="h-3 w-3" />
            Profile On-Chain
          </span>
        )}
      </div>

      <div className="space-y-3">
        {/* Address */}
        <div>
          <div className="text-xs text-[#6B8C7A] mb-1">Address</div>
          <div className="font-mono text-sm font-medium text-[#0A1A0F] dark:text-[#F0F7F3] break-all">
            {shortAddress(address || "")}
          </div>
        </div>

        {/* ETH Balance */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-[#006B4F]" />
            <span className="text-sm text-[#6B8C7A]">ETH</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono font-medium text-sm text-[#0A1A0F] dark:text-[#F0F7F3]">
              {balance ? parseFloat(balance).toFixed(4) : "—"}
            </span>
            <button
              onClick={() => {
                void getBalance();
              }}
              className="p-1.5 rounded-lg border border-[rgba(0,107,79,0.30)] dark:border-[rgba(74,222,128,0.25)] text-[#006B4F] dark:text-[#4ade80] hover:bg-[rgba(0,107,79,0.07)] bg-transparent transition-colors"
              aria-label="Refresh balance"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Health Data Attestations */}
        {(hasAnyAttestations || attestationsLoading) && (
          <div className="mt-4 pt-3 border-t border-[rgba(0,107,79,0.12)] dark:border-[rgba(0,107,79,0.15)]">
            <div className="flex items-center gap-2 mb-2">
              <FileCheck className="h-4 w-4 text-[#006B4F]" />
              <span className="text-sm text-[#6B8C7A]">Verified Data</span>
            </div>
            {attestationsLoading ? (
              <div className="flex items-center gap-2 text-sm text-[#6B8C7A]">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading...
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {attestations.map((att) => {
                  const rawTier =
                    Number(att.highestTier) in TIER_COLORS
                      ? (Number(att.highestTier) as AttestationTier)
                      : AttestationTier.NONE;
                  const tierFromScore = getTierFromScorePercent(
                    att.highestScore,
                  );
                  const tier = (Math.max(rawTier, tierFromScore) ||
                    AttestationTier.NONE) as AttestationTier;
                  return (
                    <span
                      key={att.dataType}
                      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${TIER_COLORS[tier]}`}
                      title={`${DATA_TYPE_LABELS[att.dataType]}: ${att.highestScore}% complete (${TIER_LABELS[tier]} tier) - ${att.count} attestation${att.count > 1 ? "s" : ""}`}
                    >
                      {DATA_TYPE_ICONS[att.dataType]}
                      <span>{DATA_TYPE_LABELS[att.dataType]}</span>
                      {tier > AttestationTier.NONE && (
                        <span className="opacity-75">{TIER_LABELS[tier]}</span>
                      )}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default WalletSummaryWidget;
