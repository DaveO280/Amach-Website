"use client";

import React, { useState, useEffect } from "react";
import { Activity, Bot, Loader2, User, Wallet } from "lucide-react";
import { useZkSyncSsoWallet } from "../hooks/useZkSyncSsoWallet";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface ZkSyncSsoWalletButtonProps {
  onDashboardClick?: () => void;
  onAiCompanionClick?: () => void;
  onWalletClick?: () => void;
}

export const ZkSyncSsoWalletButton: React.FC<ZkSyncSsoWalletButtonProps> = ({
  onDashboardClick,
  onAiCompanionClick,
  onWalletClick,
}) => {
  const {
    isConnected,
    isConnecting,
    address,
    healthProfile,
    activeSession,
    connect,
    disconnect,
    createHealthDataSession,
    endSession,
    error,
    clearError,
  } = useZkSyncSsoWallet();

  // Debug logging (only when there are issues)
  if (error) {
    console.log("🔍 ZkSyncSsoWalletButton error state:", {
      isConnected,
      isConnecting,
      address,
      hasHealthProfile: !!healthProfile,
      hasActiveSession: !!activeSession,
      error,
    });
  }

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [hoverTimeout, setHoverTimeout] = useState<NodeJS.Timeout | null>(null);

  const handleConnect = async (): Promise<void> => {
    try {
      const result = await connect();
      if (!result.success) {
        console.error("Connection failed:", result.error);
      }
    } catch (err) {
      console.error("Connection error:", err);
    }
  };

  const handleDisconnect = (): void => {
    disconnect();
    setIsDropdownOpen(false);
  };

  const handleCreateSession = async (): Promise<void> => {
    setIsCreatingSession(true);
    try {
      const result = await createHealthDataSession(["read", "write"]);
      if (result.success) {
        console.log("Health data session created:", result.session);
      } else {
        console.error("Failed to create session:", result.error);
      }
    } catch (err) {
      console.error("Session creation error:", err);
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleEndSession = (): void => {
    endSession();
  };

  const handleMouseEnter = (): void => {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      setHoverTimeout(null);
    }
    setIsDropdownOpen(true);
  };

  const handleMouseLeave = (): void => {
    const timeout = setTimeout(() => {
      setIsDropdownOpen(false);
    }, 300); // Longer delay to allow movement between button and dropdown
    setHoverTimeout(timeout);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return (): void => {
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
      }
    };
  }, [hoverTimeout]);

  const dropdownItems = [
    {
      label: "Wallet",
      action: (): void => {
        if (onWalletClick) onWalletClick();
        else window.location.href = "/wallet";
      },
      icon: Wallet,
      href: "/wallet",
    },
    {
      label: "Dashboard",
      action: onDashboardClick,
      icon: Activity,
      href: "#",
    },
    {
      label: "AI Companion",
      action: onAiCompanionClick,
      href: "#",
      icon: Bot,
    },
  ];

  // Format address for display
  const formatAddress = (addr: string | null): string => {
    if (!addr) return "";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  if (!isConnected) {
    return (
      <div className="wallet-connect-container p-4 border border-emerald-100 rounded-lg bg-white">
        <h3 className="text-lg font-semibold mb-2 text-amber-900">
          ZKsync SSO Wallet
        </h3>
        <Button
          onClick={handleConnect}
          disabled={isConnecting}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-medium transition-colors duration-200 shadow-sm w-full leading-tight"
        >
          {isConnecting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <Wallet className="h-4 w-4 mr-2" />
              <div className="flex flex-col items-center">
                <span>Connect</span>
                <span className="text-xs whitespace-nowrap">ZKsync SSO</span>
              </div>
            </>
          )}
        </Button>

        {error && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
            <button
              onClick={clearError}
              className="ml-2 text-red-800 hover:text-red-900"
            >
              ×
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="wallet-connect-container p-4 border rounded-lg bg-white border-emerald-100">
      <div className="flex items-center space-x-4">
        {/* Profile Status */}
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-emerald-600">
              <User className="h-4 w-4 text-white" />
            </div>
            <div className="text-sm">
              <div className="font-medium text-amber-900">
                {formatAddress(address)}
              </div>
              <div className="text-amber-800/80">ZKsync SSO</div>
            </div>
          </div>

          {/* Health Profile Status */}
          {healthProfile && (
            <Badge variant="outline" className="bg-amber-100 text-amber-800">
              Profile On-Chain
            </Badge>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2">
          {/* Create Session Button */}
          {!activeSession && (
            <Button
              onClick={handleCreateSession}
              disabled={isCreatingSession}
              variant="outline"
              size="sm"
              className="border-emerald-600 text-emerald-700 hover:bg-emerald-50"
            >
              {isCreatingSession ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Create Session
            </Button>
          )}

          {/* End Session Button */}
          {activeSession && (
            <Button
              onClick={handleEndSession}
              variant="outline"
              size="sm"
              className="border-amber-500 text-amber-800 hover:bg-amber-50"
            >
              End Session
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
          <button
            onClick={clearError}
            className="ml-2 text-red-800 hover:text-red-900"
          >
            ×
          </button>
        </div>
      )}

      {/* Move Wallet connected indicator to bottom with stable hover */}
      <div className="mt-3 flex items-center justify-end">
        <div
          className="relative"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="border-emerald-600 text-emerald-700 hover:bg-emerald-50"
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-600" />
                  <span>Wallet connected</span>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {dropdownItems.map((item, index) => (
                <DropdownMenuItem
                  key={index}
                  onClick={() => {
                    item.action?.();
                    setIsDropdownOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <item.icon className="h-4 w-4 mr-2" />
                  {item.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem
                onClick={handleDisconnect}
                className="text-red-600 cursor-pointer"
              >
                <Wallet className="h-4 w-4 mr-2" />
                Disconnect
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
};
