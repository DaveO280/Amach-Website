import { ChevronDown, Wallet, LayoutDashboard, Brain } from "lucide-react";
import React, { useState } from "react";
import { useWalletService } from "../hooks/useWalletService";
import { Button } from "./ui/button";

interface WalletConnectButtonProps {
  onDashboardClick?: () => void;
  onAiCompanionClick?: () => void;
}

const WalletConnectButton: React.FC<WalletConnectButtonProps> = ({
  onDashboardClick,
  onAiCompanionClick,
}) => {
  const { isConnected, address, connect, disconnect } = useWalletService();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const handleConnect = async (): Promise<void> => {
    try {
      await connect();
    } catch (err) {
      console.error("Connection failed:", err);
    }
  };

  const handleDisconnect = async (): Promise<void> => {
    await disconnect();
    setIsDropdownOpen(false);
  };

  const handleNavigateToWallet = (e?: React.MouseEvent): void => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setIsDropdownOpen(false);
    // Use window.location for reliable navigation
    window.location.href = "/wallet";
  };

  const dropdownItems = [
    {
      label: "Wallet",
      action: handleNavigateToWallet,
      icon: Wallet,
    },
    {
      label: "Dashboard",
      action: onDashboardClick,
      icon: LayoutDashboard,
    },
    {
      label: "AI Companion",
      action: onAiCompanionClick,
      icon: Brain,
    },
  ];

  const shortAddress = (addr: string | null | undefined): string => {
    if (!addr) return "";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <div className="wallet-connect-container">
      {!isConnected ? (
        <Button
          variant="outline"
          className="text-amber-900 hover:text-emerald-600 border-amber-300 hover:border-emerald-600"
          onClick={handleConnect}
        >
          <Wallet className="h-4 w-4 mr-2" />
          Connect Wallet
        </Button>
      ) : (
        <div className="relative">
          <Button
            variant="outline"
            className="text-amber-900 hover:text-emerald-600 border-amber-300 hover:border-emerald-600"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
            <Wallet className="h-4 w-4 mr-2" />
            {shortAddress(address)}
            <ChevronDown className="h-4 w-4 ml-2" />
          </Button>

          {/* Dropdown menu */}
          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white border border-amber-200 rounded-md shadow-lg z-50">
              {dropdownItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDropdownOpen(false);
                      if (item.action) {
                        item.action(e);
                      }
                    }}
                    className="flex items-center w-full px-4 py-2 text-sm text-amber-900 hover:bg-emerald-50 cursor-pointer transition-colors"
                  >
                    <Icon className="h-4 w-4 mr-2" />
                    {item.label}
                  </button>
                );
              })}
              <div className="border-t border-amber-200">
                <button
                  onClick={handleDisconnect}
                  className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 cursor-pointer transition-colors"
                >
                  Disconnect
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WalletConnectButton;
