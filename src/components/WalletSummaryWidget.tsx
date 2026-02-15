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
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

// Icon mapping for data types
const DATA_TYPE_ICONS: Record<HealthDataType, React.ReactNode> = {
  [HealthDataType.DEXA]: <ScanLine className="h-3 w-3" />,
  [HealthDataType.BLOODWORK]: <Droplet className="h-3 w-3" />,
  [HealthDataType.APPLE_HEALTH]: <Heart className="h-3 w-3" />,
  [HealthDataType.CGM]: <Activity className="h-3 w-3" />,
};

// Tier colors
const TIER_COLORS: Record<AttestationTier, string> = {
  [AttestationTier.NONE]: "bg-gray-100 text-gray-600",
  [AttestationTier.BRONZE]: "bg-amber-100 text-amber-700",
  [AttestationTier.SILVER]: "bg-slate-200 text-slate-700",
  [AttestationTier.GOLD]: "bg-yellow-100 text-yellow-700",
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
      <Card className="bg-white border-emerald-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-900">
            <Wallet className="h-5 w-5 text-emerald-600" />
            Wallet
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => {
              void connect();
            }}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
            aria-label="Connect Wallet"
          >
            {false ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Wallet className="h-4 w-4 mr-2" />
                Connect Wallet
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white border-emerald-100">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-amber-900">
          <span className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-emerald-600" />
            Wallet
          </span>
          {healthProfile && (
            <Badge variant="default" className="bg-amber-100 text-amber-800">
              <Shield className="h-3 w-3 mr-1" />
              Profile On-Chain
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="text-sm text-amber-800/80">Address</div>
          <div className="font-mono text-sm text-amber-900 break-all">
            {shortAddress(address || "")}
          </div>
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-emerald-600" />
              <div className="text-sm text-amber-800/80">ETH</div>
            </div>
            <div className="text-base font-semibold text-amber-900">
              {balance ? `${parseFloat(balance).toFixed(4)}` : "—"}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void getBalance();
              }}
              className="border-emerald-600 text-emerald-700 hover:bg-emerald-50"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {/* Health Data Attestations */}
          {(hasAnyAttestations || attestationsLoading) && (
            <div className="mt-4 pt-3 border-t border-emerald-100">
              <div className="flex items-center gap-2 mb-2">
                <FileCheck className="h-4 w-4 text-emerald-600" />
                <span className="text-sm text-amber-800/80">Verified Data</span>
              </div>
              {attestationsLoading ? (
                <div className="flex items-center gap-2 text-sm text-amber-600">
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
                    // Widget-level fallback: derive from score so tier color always shows (Badge default variant was overriding colors)
                    const tierNum =
                      rawTier !== AttestationTier.NONE
                        ? rawTier
                        : getTierFromScorePercent(att.highestScore);
                    const tier = tierNum as AttestationTier;
                    return (
                      <Badge
                        key={att.dataType}
                        variant="outline"
                        className={`${TIER_COLORS[tier]} flex items-center gap-1 border`}
                        title={`${DATA_TYPE_LABELS[att.dataType]}: ${att.highestScore}% complete (${TIER_LABELS[tier]} tier) - ${att.count} attestation${att.count > 1 ? "s" : ""}`}
                      >
                        {DATA_TYPE_ICONS[att.dataType]}
                        <span>{DATA_TYPE_LABELS[att.dataType]}</span>
                        {tier > AttestationTier.NONE && (
                          <span className="text-xs opacity-75">
                            {TIER_LABELS[tier]}
                          </span>
                        )}
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default WalletSummaryWidget;
