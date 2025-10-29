"use client";

import {
  AlertCircle,
  CheckCircle,
  Coins,
  Gift,
  Loader2,
  RefreshCw,
  Send,
  Wallet,
} from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { useZkSyncSsoWallet } from "../hooks/useZkSyncSsoWallet";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export const CryptoWallet: React.FC = () => {
  const {
    isConnected,
    address,
    balance,
    tokens,
    getBalance,
    getTokenBalances,
    sendETH,
    error,
    clearError,
  } = useZkSyncSsoWallet();

  const [isLoading, setIsLoading] = useState(false);
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [allocationInfo, setAllocationInfo] = useState<{
    hasAllocation: boolean;
    allocationAmount: number;
    hasClaimed: boolean;
    isVerified: boolean;
  } | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isLoadingAllocation, setIsLoadingAllocation] = useState(false);
  const [ahpTokenBalance, setAhpTokenBalance] = useState<string>("0");
  const [isLoadingTokenBalance, setIsLoadingTokenBalance] = useState(false);

  const loadBalances = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      await Promise.all([getBalance(), getTokenBalances()]);
    } finally {
      setIsLoading(false);
    }
  }, [getBalance, getTokenBalances]);

  const loadAllocationInfo = useCallback(async (): Promise<void> => {
    if (!isConnected || !address) {
      console.log(
        "❌ Cannot load allocation: wallet not connected or no address",
      );
      return;
    }

    setIsLoadingAllocation(true);
    console.log("🔄 Loading allocation info for wallet:", address);

    try {
      // Use the allocation-info API endpoint with wallet address parameter
      const response = await fetch(
        `/api/verification/allocation-info?wallet=${address}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (response.ok) {
        const data = await response.json();
        console.log("📋 Allocation API response:", data);

        // Check if this wallet has an allocation
        if (data.userAllocation) {
          const allocationAmount = parseFloat(
            data.userAllocation.allocationAmount,
          );
          console.log("✅ Found allocation for wallet:", {
            hasAllocation: allocationAmount > 0,
            allocationAmount: allocationAmount,
            hasClaimed: data.userAllocation.hasClaimed,
            isVerified: data.userAllocation.isVerified,
          });

          setAllocationInfo({
            hasAllocation: allocationAmount > 0,
            allocationAmount: allocationAmount,
            hasClaimed: data.userAllocation.hasClaimed,
            isVerified: data.userAllocation.isVerified,
          });
        } else {
          console.log("❌ No allocation found for this wallet");
          setAllocationInfo({
            hasAllocation: false,
            allocationAmount: 0,
            hasClaimed: false,
            isVerified: false,
          });
        }
      } else {
        console.error(
          "❌ Allocation API failed:",
          response.status,
          response.statusText,
        );
        setAllocationInfo({
          hasAllocation: false,
          allocationAmount: 0,
          hasClaimed: false,
          isVerified: false,
        });
      }
    } catch (error) {
      console.error("❌ Failed to load allocation info:", error);
      setAllocationInfo({
        hasAllocation: false,
        allocationAmount: 0,
        hasClaimed: false,
        isVerified: false,
      });
    } finally {
      setIsLoadingAllocation(false);
    }
  }, [isConnected, address]);

  const handleClaimAllocation = async (): Promise<void> => {
    if (!isConnected) {
      setSuccessMessage("Please connect your wallet first");
      return;
    }

    if (!allocationInfo?.hasAllocation || allocationInfo.hasClaimed) {
      setSuccessMessage("No allocation available to claim");
      return;
    }

    setIsClaiming(true);
    setSuccessMessage(null);

    try {
      // Import the service and call claim allocation
      const { zkSyncSsoWalletService } = await import(
        "@/services/ZkSyncSsoWalletService"
      );
      const result = await zkSyncSsoWalletService.claimAllocation();

      if (result.success) {
        setSuccessMessage(
          `Allocation claimed successfully! Transaction: ${result.txHash}`,
        );
        // Refresh allocation info and token balance
        await Promise.all([loadAllocationInfo(), loadAhpTokenBalance()]);
      } else {
        setSuccessMessage(`Claim failed: ${result.error}`);
      }
    } catch (err) {
      setSuccessMessage(
        `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setIsClaiming(false);
    }
  };

  const loadAhpTokenBalance = useCallback(async (): Promise<void> => {
    if (!isConnected || !address) return;

    setIsLoadingTokenBalance(true);
    try {
      // Call the token contract to get balance
      const { readContract } = await import("@wagmi/core");
      const { wagmiConfig } = await import("@/lib/zksync-sso-config");
      const { formatUnits } = await import("viem");

      const balance = await readContract(wagmiConfig, {
        address: "0x057df807987f284b55ba6A9ab89d089fd8398B99", // HealthToken address (Clean Slate)
        abi: [
          {
            inputs: [{ name: "account", type: "address" }],
            name: "balanceOf",
            outputs: [{ name: "", type: "uint256" }],
            stateMutability: "view",
            type: "function",
          },
        ],
        functionName: "balanceOf",
        args: [address as `0x${string}`],
      });

      setAhpTokenBalance(formatUnits(balance, 18)); // Assuming 18 decimals
    } catch (error) {
      console.error("Failed to load AHP token balance:", error);
      setAhpTokenBalance("0");
    } finally {
      setIsLoadingTokenBalance(false);
    }
  }, [isConnected, address]);

  // Load balances and allocation info when connected
  useEffect(() => {
    if (isConnected) {
      loadBalances();
      loadAllocationInfo();
      loadAhpTokenBalance();
    }
  }, [isConnected, loadBalances, loadAllocationInfo, loadAhpTokenBalance]);

  const handleSendETH = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();

    if (!isConnected) {
      setSuccessMessage("Please connect your wallet first");
      return;
    }

    if (!sendTo || !sendAmount) {
      setSuccessMessage("Please fill in all fields");
      return;
    }

    setIsSending(true);
    setSuccessMessage(null);

    try {
      const result = await sendETH(sendTo, sendAmount);

      if (result.success) {
        setSuccessMessage(`Transaction sent! Hash: ${result.txHash}`);
        setSendTo("");
        setSendAmount("");
        // Refresh balances
        await loadBalances();
      } else {
        setSuccessMessage(`Send failed: ${result.error}`);
      }
    } catch (err) {
      setSuccessMessage(
        `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setIsSending(false);
    }
  };

  // Clear success message after 5 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return (): void => {
        clearTimeout(timer);
      };
    }
  }, [successMessage]);

  if (!isConnected) {
    return (
      <Card className="bg-white border-emerald-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-900">
            <Wallet className="h-5 w-5 text-emerald-600" />
            Crypto Wallet
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <AlertCircle className="h-12 w-12 text-[#9CA3AF] mx-auto mb-4" />
            <p className="text-[#6B7280]">
              Please connect your ZKsync SSO wallet to view crypto balances
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white border-emerald-100">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-900">
          <Wallet className="h-5 w-5 text-emerald-600" />
          Crypto Wallet
          <Badge variant="default" className="bg-emerald-100 text-emerald-700">
            <CheckCircle className="h-3 w-3 mr-1" />
            Connected
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Wallet Address */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-[#6B7280]">
              Wallet Address
            </Label>
            <p className="text-sm font-mono text-[#6B7280] break-all">
              {address}
            </p>
          </div>

          {/* ETH Balance */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium text-amber-800/80">
                ETH Balance
              </Label>
              <Button
                variant="outline"
                size="sm"
                onClick={loadBalances}
                disabled={isLoading}
                className="border-emerald-600 text-emerald-700 hover:bg-emerald-50"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-emerald-600" />
              <span className="text-lg font-semibold">
                {balance
                  ? `${parseFloat(balance).toFixed(4)} ETH`
                  : "Loading..."}
              </span>
            </div>
          </div>

          {/* AHP Token Balance */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium text-emerald-800/80">
                $AHP Balance
              </Label>
              <Button
                variant="outline"
                size="sm"
                onClick={loadAhpTokenBalance}
                disabled={isLoadingTokenBalance}
                className="border-emerald-600 text-emerald-700 hover:bg-emerald-50"
              >
                {isLoadingTokenBalance ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-emerald-600" />
              <span className="text-lg font-semibold">
                {isLoadingTokenBalance
                  ? "Loading..."
                  : `${parseFloat(ahpTokenBalance).toFixed(2)} $AHP`}
              </span>
            </div>
          </div>

          {/* Token Balances */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-[#6B7280]">
              Token Balances
            </Label>
            {tokens && tokens.length > 0 ? (
              <div className="space-y-2">
                {tokens.map((token, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 bg-[#F3F4F6] rounded"
                  >
                    <span className="font-medium">{token.symbol}</span>
                    <span className="text-sm text-[#6B7280]">
                      {token.balance}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#6B7280]">No tokens found</p>
            )}
          </div>

          {/* Token Allocation */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium text-[#6B7280]">
                Token Allocation
              </Label>
              <Button
                variant="outline"
                size="sm"
                onClick={loadAllocationInfo}
                disabled={isLoadingAllocation}
                className="border-emerald-600 text-emerald-700 hover:bg-emerald-50"
              >
                {isLoadingAllocation ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>

            {allocationInfo ? (
              <div className="space-y-3">
                {allocationInfo.isVerified ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="h-4 w-4 text-emerald-600" />
                      <span className="text-sm font-medium text-emerald-800">
                        Profile Verified
                      </span>
                    </div>

                    {allocationInfo.hasAllocation ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-emerald-700">
                            Allocation Amount:
                          </span>
                          <span className="font-semibold text-emerald-800">
                            {allocationInfo.allocationAmount} $AHP
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-sm text-emerald-700">
                            Status:
                          </span>
                          <Badge
                            variant={
                              allocationInfo.hasClaimed
                                ? "secondary"
                                : "default"
                            }
                            className={
                              allocationInfo.hasClaimed
                                ? "bg-gray-100 text-gray-700"
                                : "bg-emerald-100 text-emerald-700"
                            }
                          >
                            {allocationInfo.hasClaimed
                              ? "Claimed"
                              : "Available"}
                          </Badge>
                        </div>

                        {!allocationInfo.hasClaimed && (
                          <Button
                            onClick={handleClaimAllocation}
                            disabled={isClaiming}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            {isClaiming ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Claiming...
                              </>
                            ) : (
                              <>
                                <Gift className="h-4 w-4 mr-2" />
                                Claim Allocation
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-emerald-700">
                        No allocation available
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-600" />
                      <span className="text-sm text-amber-800">
                        Profile not verified
                      </span>
                    </div>
                    <p className="text-xs text-amber-700 mt-1">
                      Verify your profile to receive token allocation
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-[#6B7280]">
                Loading allocation info...
              </p>
            )}
          </div>

          {/* Send ETH Form */}
          <div className="pt-4 border-t">
            <h4 className="font-medium mb-3">Send ETH</h4>
            <form onSubmit={handleSendETH} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sendTo">To Address</Label>
                <Input
                  id="sendTo"
                  type="text"
                  value={sendTo}
                  onChange={(e) => setSendTo(e.target.value)}
                  placeholder="0x..."
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sendAmount">Amount (ETH)</Label>
                <Input
                  id="sendAmount"
                  type="number"
                  step="0.0001"
                  value={sendAmount}
                  onChange={(e) => setSendAmount(e.target.value)}
                  placeholder="0.001"
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={isSending || isLoading}
                className="w-full bg-[#10B981] hover:bg-[#059669] text-white"
              >
                {isSending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send ETH
                  </>
                )}
              </Button>
            </form>
          </div>
        </div>

        {/* Success/Error Messages */}
        {successMessage && (
          <div
            className={`mt-4 p-3 rounded-md ${
              successMessage.includes("sent!") ||
              successMessage.includes("success")
                ? "bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0]"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            <div className="flex items-center gap-2">
              {successMessage.includes("sent!") ||
              successMessage.includes("success") ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              {successMessage}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-red-50 text-red-800 border border-red-200 rounded-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
              <button
                onClick={clearError}
                className="text-red-600 hover:text-red-800"
              >
                ×
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
