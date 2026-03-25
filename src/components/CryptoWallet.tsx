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
import { useWalletService } from "../hooks/useWalletService";

export const CryptoWallet: React.FC = () => {
  const {
    isConnected,
    address,
    balance,
    tokens,
    getBalance,
    getTokenBalances,
    sendETH,
    claimAllocation,
    error,
    clearError,
  } = useWalletService();

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
    } catch (err) {
      console.error("❌ Failed to load allocation info:", err);
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
      // Call claim allocation using wallet service
      const result = await claimAllocation();

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
      // Call the token contract to get balance using viem
      const { createPublicClient, http, formatUnits } = await import("viem");
      const { getActiveChain } = await import("@/lib/networkConfig");

      const publicClient = createPublicClient({
        chain: getActiveChain(),
        transport: http(),
      });

      const tokenBalance = await publicClient.readContract({
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

      setAhpTokenBalance(formatUnits(tokenBalance, 18)); // Assuming 18 decimals
    } catch (err) {
      console.error("Failed to load AHP token balance:", err);
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
      <div className="rounded-xl border bg-white dark:bg-[#0B140F] border-[rgba(0,107,79,0.12)] dark:border-[rgba(0,107,79,0.15)] p-[22px]">
        <div className="flex items-center gap-2 mb-[18px]">
          <Wallet className="h-4 w-4 text-[#006B4F] flex-shrink-0" />
          <h3 className="text-[#0A1A0F] dark:text-[#F0F7F3] font-semibold text-base">
            Crypto Wallet
          </h3>
        </div>
        <div className="text-center py-8">
          <AlertCircle className="h-12 w-12 text-[#6B8C7A] mx-auto mb-4" />
          <p className="text-sm text-[#6B8C7A]">
            Please connect your ZKsync SSO wallet to view crypto balances
          </p>
        </div>
      </div>
    );
  }

  const isSuccessMessage =
    successMessage?.includes("sent!") || successMessage?.includes("success");

  return (
    <div className="rounded-xl border bg-white dark:bg-[#0B140F] border-[rgba(0,107,79,0.12)] dark:border-[rgba(0,107,79,0.15)] p-[22px]">
      {/* Card Header */}
      <div className="flex items-center justify-between mb-[18px]">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-[#006B4F] flex-shrink-0" />
          <h3 className="text-[#0A1A0F] dark:text-[#F0F7F3] font-semibold text-base">
            Crypto Wallet
          </h3>
        </div>
        <span className="inline-flex items-center gap-1 bg-[rgba(0,107,79,0.10)] dark:bg-[rgba(0,107,79,0.15)] text-[#006B4F] dark:text-[#6B8C7A] text-[11px] font-semibold px-[10px] py-[3px] rounded-full">
          <CheckCircle className="h-[10px] w-[10px]" />
          Connected
        </span>
      </div>

      {/* Wallet Address */}
      <div className="mb-[14px]">
        <div className="text-[11px] text-[#6B8C7A] mb-[3px]">
          Wallet Address
        </div>
        <div className="font-mono text-[11px] text-[#6B8C7A] break-all">
          {address}
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-[rgba(0,107,79,0.08)] my-4" />

      {/* ETH Balance */}
      <div className="flex items-center justify-between mb-[6px]">
        <span className="text-xs font-medium text-[#6B8C7A]">ETH Balance</span>
        <button
          onClick={loadBalances}
          disabled={isLoading}
          aria-label="Refresh ETH balance"
          className="p-1.5 rounded-lg border border-[rgba(0,107,79,0.30)] dark:border-[rgba(74,222,128,0.25)] text-[#006B4F] dark:text-[#4ade80] hover:bg-[rgba(0,107,79,0.07)] bg-transparent transition-colors"
        >
          {isLoading ? (
            <Loader2 className="h-[11px] w-[11px] animate-spin" />
          ) : (
            <RefreshCw className="h-[11px] w-[11px]" />
          )}
        </button>
      </div>
      <div className="flex items-center gap-2 font-mono text-[22px] font-medium text-[#0A1A0F] dark:text-[#F0F7F3] mb-4">
        <Coins className="h-[18px] w-[18px] text-[#006B4F] flex-shrink-0" />
        {balance ? `${parseFloat(balance).toFixed(4)} ETH` : "Loading..."}
      </div>

      {/* AHP Balance */}
      <div className="flex items-center justify-between mb-[6px]">
        <span className="text-xs font-medium text-[#6B8C7A]">$AHP Balance</span>
        <button
          onClick={loadAhpTokenBalance}
          disabled={isLoadingTokenBalance}
          aria-label="Refresh AHP balance"
          className="p-1.5 rounded-lg border border-[rgba(0,107,79,0.30)] dark:border-[rgba(74,222,128,0.25)] text-[#006B4F] dark:text-[#4ade80] hover:bg-[rgba(0,107,79,0.07)] bg-transparent transition-colors"
        >
          {isLoadingTokenBalance ? (
            <Loader2 className="h-[11px] w-[11px] animate-spin" />
          ) : (
            <RefreshCw className="h-[11px] w-[11px]" />
          )}
        </button>
      </div>
      <div className="flex items-center gap-2 font-mono text-[22px] font-medium text-[#059669] dark:text-[#4ade80] mb-4">
        <Gift className="h-[18px] w-[18px] text-[#059669] dark:text-[#4ade80] flex-shrink-0" />
        {isLoadingTokenBalance
          ? "Loading..."
          : `${parseFloat(ahpTokenBalance).toFixed(2)} $AHP`}
      </div>

      {/* Token Allocation */}
      {allocationInfo ? (
        allocationInfo.isVerified ? (
          <div className="rounded-[10px] bg-[rgba(0,107,79,0.10)] dark:bg-[rgba(0,107,79,0.15)] border border-[rgba(0,107,79,0.12)] dark:border-[rgba(0,107,79,0.15)] p-[14px]">
            <div className="flex items-center gap-[6px] text-[13px] font-semibold text-[#006B4F] dark:text-[#4ade80] mb-[10px]">
              <CheckCircle className="h-[13px] w-[13px]" />
              Profile Verified
            </div>

            {allocationInfo.hasAllocation ? (
              <>
                <div className="flex items-center justify-between text-xs text-[#6B8C7A] mb-[6px]">
                  <span>Allocation Amount</span>
                  <span className="font-medium font-mono text-[#0A1A0F] dark:text-[#F0F7F3]">
                    {allocationInfo.allocationAmount} $AHP
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-[#6B8C7A] mb-[6px]">
                  <span>Status</span>
                  <span className="inline-flex items-center gap-1 bg-[rgba(0,107,79,0.10)] dark:bg-[rgba(0,107,79,0.15)] text-[#006B4F] dark:text-[#4ade80] text-[10px] font-semibold px-2 py-0.5 rounded-full">
                    {allocationInfo.hasClaimed ? "Claimed" : "Available"}
                  </span>
                </div>
                {!allocationInfo.hasClaimed && (
                  <button
                    onClick={handleClaimAllocation}
                    disabled={isClaiming}
                    className="w-full mt-3 bg-[#006B4F] hover:bg-[#005A40] text-white rounded-lg px-4 py-2 text-[12px] font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {isClaiming ? (
                      <>
                        <Loader2 className="h-[13px] w-[13px] animate-spin" />
                        Claiming...
                      </>
                    ) : (
                      <>
                        <Gift className="h-[13px] w-[13px]" />
                        Claim Allocation
                      </>
                    )}
                  </button>
                )}
              </>
            ) : (
              <p className="text-xs text-[#6B8C7A]">No allocation available</p>
            )}
          </div>
        ) : (
          <div className="rounded-lg bg-[rgba(0,107,79,0.05)] dark:bg-[rgba(0,107,79,0.08)] border border-[rgba(0,107,79,0.12)] dark:border-[rgba(0,107,79,0.15)] p-[12px]">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-[#6B8C7A]" />
              <span className="text-sm text-[#6B8C7A]">
                Profile not verified
              </span>
            </div>
            <p className="text-xs text-[#6B8C7A] mt-1">
              Verify your profile to receive token allocation
            </p>
          </div>
        )
      ) : (
        <p className="text-sm text-[#6B8C7A]">Loading allocation info...</p>
      )}

      {/* Token Balances (fallback list) */}
      {tokens && tokens.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="text-xs font-medium text-[#6B8C7A]">
            Token Balances
          </div>
          {tokens.map((token, index) => (
            <div
              key={index}
              className="flex items-center justify-between px-3 py-2 rounded-lg bg-[rgba(0,107,79,0.05)] dark:bg-[rgba(0,107,79,0.08)] border border-[rgba(0,107,79,0.10)] dark:border-[rgba(0,107,79,0.12)]"
            >
              <span className="text-sm font-medium text-[#0A1A0F] dark:text-[#F0F7F3]">
                {token.symbol}
              </span>
              <span className="text-sm font-mono text-[#6B8C7A]">
                {token.balance}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Allocation Refresh */}
      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs font-medium text-[#6B8C7A]">
          Token Allocation
        </span>
        <button
          onClick={loadAllocationInfo}
          disabled={isLoadingAllocation}
          aria-label="Refresh allocation"
          className="p-1.5 rounded-lg border border-[rgba(0,107,79,0.30)] dark:border-[rgba(74,222,128,0.25)] text-[#006B4F] dark:text-[#4ade80] hover:bg-[rgba(0,107,79,0.07)] bg-transparent transition-colors"
        >
          {isLoadingAllocation ? (
            <Loader2 className="h-[11px] w-[11px] animate-spin" />
          ) : (
            <RefreshCw className="h-[11px] w-[11px]" />
          )}
        </button>
      </div>

      {/* Send ETH Form */}
      <div className="mt-[18px] pt-[16px] border-t border-[rgba(0,107,79,0.08)]">
        <div className="flex items-center gap-[6px] text-[13px] font-semibold text-[#0A1A0F] dark:text-[#F0F7F3] mb-[12px]">
          <Send className="h-[13px] w-[13px] text-[#006B4F]" />
          Send ETH
        </div>
        <form onSubmit={handleSendETH} className="space-y-3">
          <div>
            <label
              htmlFor="sendTo"
              className="block text-xs font-medium text-[#6B8C7A] mb-[5px]"
            >
              To Address
            </label>
            <input
              id="sendTo"
              type="text"
              value={sendTo}
              onChange={(e) => setSendTo(e.target.value)}
              placeholder="0x…"
              required
              className="w-full px-3 py-2 rounded-lg border border-[rgba(0,107,79,0.20)] dark:border-[rgba(0,107,79,0.25)] bg-[#F9FAFB] dark:bg-[#0C120E] text-[#0A1A0F] dark:text-[#F0F7F3] text-[13px] outline-none transition-colors focus:border-[rgba(0,107,79,0.50)] dark:focus:border-[rgba(74,222,128,0.45)]"
            />
          </div>
          <div>
            <label
              htmlFor="sendAmount"
              className="block text-xs font-medium text-[#6B8C7A] mb-[5px]"
            >
              Amount (ETH)
            </label>
            <input
              id="sendAmount"
              type="number"
              step="0.0001"
              value={sendAmount}
              onChange={(e) => setSendAmount(e.target.value)}
              placeholder="0.001"
              required
              className="w-full px-3 py-2 rounded-lg border border-[rgba(0,107,79,0.20)] dark:border-[rgba(0,107,79,0.25)] bg-[#F9FAFB] dark:bg-[#0C120E] text-[#0A1A0F] dark:text-[#F0F7F3] text-[13px] outline-none transition-colors focus:border-[rgba(0,107,79,0.50)] dark:focus:border-[rgba(74,222,128,0.45)]"
            />
          </div>
          <button
            type="submit"
            disabled={isSending || isLoading}
            className="w-full bg-[#006B4F] hover:bg-[#005A40] text-white rounded-lg px-4 py-2 font-medium text-[13px] transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {isSending ? (
              <>
                <Loader2 className="h-[13px] w-[13px] animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-[13px] w-[13px]" />
                Send ETH
              </>
            )}
          </button>
        </form>
      </div>

      {/* Success/Error Messages */}
      {successMessage && (
        <div
          className={`mt-4 p-3 rounded-lg text-sm ${
            isSuccessMessage
              ? "bg-[#ECFDF5] dark:bg-[rgba(0,107,79,0.12)] text-[#065F46] dark:text-[#4ade80] border border-[#A7F3D0] dark:border-[rgba(0,107,79,0.3)]"
              : "bg-[#FEF2F2] dark:bg-[rgba(248,113,113,0.08)] text-[#DC2626] dark:text-[#F87171] border border-[#FECACA] dark:border-[rgba(248,113,113,0.3)]"
          }`}
        >
          <div className="flex items-center gap-2">
            {isSuccessMessage ? (
              <CheckCircle className="h-4 w-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
            )}
            {successMessage}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 rounded-lg text-sm bg-[#FEF2F2] dark:bg-[rgba(248,113,113,0.08)] text-[#DC2626] dark:text-[#F87171] border border-[#FECACA] dark:border-[rgba(248,113,113,0.3)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
            <button
              onClick={clearError}
              className="text-[#DC2626] dark:text-[#F87171] hover:opacity-70 ml-2"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
