import { Activity, Bot, ChevronDown, Wallet } from "lucide-react";
import React, { useState } from "react";
import { useWalletConnection } from "../hooks/useWalletConnection";
import { Button } from "./ui/button";

interface WalletConnectButtonProps {
  onDashboardClick?: () => void;
  onAiCompanionClick?: () => void;
}

const WalletConnectButton: React.FC<WalletConnectButtonProps> = ({
  onDashboardClick,
  onAiCompanionClick,
}) => {
  const { isConnected, profile, error, connect, disconnect } =
    useWalletConnection();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const handleConnect = async (): Promise<void> => {
    try {
      await connect();
    } catch (err) {
      console.error("Connection failed:", err);
    }
  };

  const handleDisconnect = (): void => {
    disconnect();
    setIsDropdownOpen(false);
  };

  const dropdownItems = [
    {
      label: "Dashboard",
      action: onDashboardClick,
      icon: Activity,
      href: "#",
    },
    {
      label: "AI Agent",
      action: onAiCompanionClick,
      href: "#",
      icon: Bot,
    },
  ];

  return (
    <div className="wallet-connect-container">
      {error && (
        <div
          className="error-message"
          style={{ color: "red", marginBottom: "10px", fontSize: "12px" }}
        >
          {error}
        </div>
      )}

      {!isConnected ? (
        <Button
          variant="outline"
          className="text-amber-900 hover:text-emerald-600"
          onClick={handleConnect}
        >
          <Wallet className="h-4 w-4 mr-2" />
          Connect Wallet
          <ChevronDown className="h-4 w-4 ml-2" />
        </Button>
      ) : (
        <div className="relative group">
          <Button
            variant="outline"
            className="text-amber-900 hover:text-emerald-600"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
            <Wallet className="h-4 w-4 mr-2" />
            Connected
            <ChevronDown className="h-4 w-4 ml-2" />
          </Button>

          {/* Profile info tooltip */}
          {profile && (
            <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
              <div className="px-4 py-2 text-xs text-gray-600 border-b">
                <div>Age: {profile.age}</div>
                <div>Weight: {profile.weight}kg</div>
                <div>Height: {profile.height}cm</div>
                <div>Sex: {profile.biologicalSex}</div>
              </div>
            </div>
          )}

          {/* Dropdown menu */}
          <div
            className={`absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-md shadow-lg transition-all duration-200 z-50 ${
              isDropdownOpen ? "opacity-100 visible" : "opacity-0 invisible"
            }`}
          >
            {dropdownItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  onClick={() => {
                    setIsDropdownOpen(false);
                    if (item.action) {
                      item.action();
                    } else if (item.href && item.href !== "#") {
                      window.location.href = item.href;
                    }
                  }}
                  className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer"
                >
                  <Icon className="h-4 w-4 mr-2" />
                  {item.label}
                </button>
              );
            })}
            <div className="border-t">
              <button
                onClick={handleDisconnect}
                className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 cursor-pointer"
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WalletConnectButton;
