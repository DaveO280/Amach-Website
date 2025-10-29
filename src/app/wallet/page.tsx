"use client";

import { HealthProfileManager } from "../../components/HealthProfileManager";
import { CryptoWallet } from "../../components/CryptoWallet";
import { WalletSummaryWidget } from "../../components/WalletSummaryWidget";
import HealthDashboardModal from "../../components/HealthDashboardModal";
import AiCompanionModal from "../../components/AiCompanionModal";
import { useEffect, useState } from "react";
import { useZkSyncSsoWallet } from "../../hooks/useZkSyncSsoWallet";
import { useHealthDataContext } from "../../components/HealthDataContextWrapper";
import { Button } from "../../components/ui/button";
import { Home, LayoutDashboard, Brain, LogOut, Menu, X } from "lucide-react";
import { useRouter } from "next/navigation";

export default function WalletPage(): JSX.Element {
  const {
    isConnected,
    getBalance,
    loadProfileFromBlockchain,
    refreshProfile,
    disconnect,
  } = useZkSyncSsoWallet();
  const {
    isDashboardOpen,
    setIsDashboardOpen,
    isAiCompanionOpen,
    setIsAiCompanionOpen,
  } = useHealthDataContext();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Auto-load wallet data when visiting this page if already connected
  useEffect((): void => {
    if (!isConnected) return;
    void getBalance();
    void (async (): Promise<void> => {
      const result = await loadProfileFromBlockchain();
      if (result.success) refreshProfile();
    })();
  }, [isConnected, getBalance, loadProfileFromBlockchain, refreshProfile]);

  const handleNavigateHome = (): void => {
    router.push("/");
    setIsMobileMenuOpen(false);
  };

  const handleNavigateDashboard = (): void => {
    setIsDashboardOpen(true);
    setIsMobileMenuOpen(false);
  };

  const handleNavigateAICompanion = (): void => {
    setIsAiCompanionOpen(true);
    setIsMobileMenuOpen(false);
  };

  const handleDisconnect = async (): Promise<void> => {
    disconnect();
    setIsMobileMenuOpen(false);
    router.push("/");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-emerald-50">
      {/* Navigation Bar - Mobile Optimized */}
      <nav className="sticky top-0 z-50 bg-white border-b border-amber-100 shadow-sm">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Mobile Menu Button */}
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-2 w-full">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNavigateHome}
                className="flex items-center gap-2 text-emerald-700 hover:bg-emerald-50"
              >
                <Home className="h-4 w-4" />
                <span>Home</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNavigateDashboard}
                className="flex items-center gap-2 text-emerald-700 hover:bg-emerald-50"
              >
                <LayoutDashboard className="h-4 w-4" />
                <span>Dashboard</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNavigateAICompanion}
                className="flex items-center gap-2 text-emerald-700 hover:bg-emerald-50"
              >
                <Brain className="h-4 w-4" />
                <span>AI Companion</span>
              </Button>
              <div className="ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDisconnect}
                  className="flex items-center gap-2 text-red-600 border-red-300 hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Disconnect</span>
                </Button>
              </div>
            </div>

            {/* Page Title - Mobile */}
            <h1 className="text-lg font-bold text-emerald-900 md:hidden">
              Wallet
            </h1>

            {/* Disconnect Button - Mobile (when menu closed) */}
            {!isMobileMenuOpen && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                className="md:hidden flex items-center gap-1 text-red-600 border-red-300 hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Disconnect</span>
              </Button>
            )}
          </div>

          {/* Mobile Menu Dropdown */}
          {isMobileMenuOpen && (
            <div className="md:hidden mt-4 pb-2 space-y-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNavigateHome}
                className="w-full justify-start flex items-center gap-3 text-emerald-700 hover:bg-emerald-50"
              >
                <Home className="h-5 w-5" />
                <span>Home</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNavigateDashboard}
                className="w-full justify-start flex items-center gap-3 text-emerald-700 hover:bg-emerald-50"
              >
                <LayoutDashboard className="h-5 w-5" />
                <span>Dashboard</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNavigateAICompanion}
                className="w-full justify-start flex items-center gap-3 text-emerald-700 hover:bg-emerald-50"
              >
                <Brain className="h-5 w-5" />
                <span>AI Companion</span>
              </Button>
            </div>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-6">
            <WalletSummaryWidget />
            <div className="p-4 border border-gray-200 rounded-lg bg-white">
              <CryptoWallet />
            </div>
          </div>

          <div className="lg:col-span-8 space-y-6">
            <div className="p-4 border border-gray-200 rounded-lg bg-white">
              <HealthProfileManager />
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <HealthDashboardModal
        isOpen={isDashboardOpen}
        onClose={() => setIsDashboardOpen(false)}
      />
      <AiCompanionModal
        isOpen={isAiCompanionOpen}
        onClose={() => setIsAiCompanionOpen(false)}
      />
    </div>
  );
}
