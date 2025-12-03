"use client";

import React, { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Wallet, Shield, Loader2, RefreshCw, Coins } from "lucide-react";
import { useWalletService } from "../hooks/useWalletService";

export const WalletSummaryWidget: React.FC = () => {
  const { isConnected, address, balance, healthProfile, connect, getBalance } =
    useWalletService();

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
        </div>
      </CardContent>
    </Card>
  );
};

export default WalletSummaryWidget;
