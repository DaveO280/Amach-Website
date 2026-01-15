"use client";

import { HealthProfileManager } from "../../components/HealthProfileManager";
import { CryptoWallet } from "../../components/CryptoWallet";
import { WalletSummaryWidget } from "../../components/WalletSummaryWidget";
import { WalletSetupWizard } from "../../components/WalletSetupWizard";
import HealthDashboardModal from "../../components/HealthDashboardModal";
import AiCompanionModal from "../../components/AiCompanionModal";
import { StorageManagementSection } from "../../components/storage/StorageManagementSection";
import { QuarterlyAggregateGenerator } from "../../components/health/QuarterlyAggregateGenerator";
import React, { useCallback, useEffect, useState } from "react";
import { useWalletService } from "../../hooks/useWalletService";
import { useHealthDataContext } from "../../components/HealthDataContextWrapper";
import { Button } from "../../components/ui/button";
import {
  Home,
  LayoutDashboard,
  Brain,
  LogOut,
  Menu,
  X,
  Wallet,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";

export default function WalletPage(): JSX.Element {
  const {
    isConnected,
    address,
    ready,
    getBalance,
    loadProfileFromBlockchain,
    refreshProfile,
    disconnect,
    getHealthProfile,
    signMessage,
    getWalletClient,
  } = useWalletService();
  const {
    isDashboardOpen,
    setIsDashboardOpen,
    isAiCompanionOpen,
    setIsAiCompanionOpen,
  } = useHealthDataContext();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showWalletWizard, setShowWalletWizard] = useState(false);
  const [hasCompletedSetup, setHasCompletedSetup] = useState(false);
  const [isCheckingSetup, setIsCheckingSetup] = useState(true);

  // Track last checked connection state to prevent duplicate checks
  const lastCheckedStateRef = React.useRef<string | null>(null);
  // Track if wizard just completed to prevent re-checking
  const wizardJustCompletedRef = React.useRef(false);

  // Check if user has completed wallet setup (only on mount and connection changes)
  useEffect(() => {
    let isMounted = true;

    const checkSetupStatus = async (): Promise<void> => {
      // Skip if wizard is open or wizard just completed
      if (!isMounted || showWalletWizard || wizardJustCompletedRef.current) {
        return;
      }

      // Create a state key to track if we've checked this specific state
      const stateKey = `${ready}-${isConnected}-${address || "no-address"}`;

      // Skip if we've already checked this exact state
      if (lastCheckedStateRef.current === stateKey) {
        return;
      }

      // Mark that we've checked this state
      lastCheckedStateRef.current = stateKey;

      setIsCheckingSetup(true);

      // Wait for Privy to be ready before making decisions
      if (!ready) {
        console.log("⏳ Waiting for Privy to be ready...");
        if (isMounted) {
          setIsCheckingSetup(false);
        }
        return;
      }

      // Check if wallet setup was completed (stored in localStorage)
      const walletSetupComplete = localStorage.getItem(
        "amach-wallet-setup-complete",
      );
      console.log("🔍 Setup check:", {
        ready,
        isConnected,
        address,
        walletSetupComplete,
      });

      // If wallet is connected, user has a wallet - show wallet interface
      // Health profile setup is separate and handled within the wallet interface
      if (isConnected && address) {
        try {
          const result = await loadProfileFromBlockchain();
          const healthProfile = getHealthProfile();

          console.log("🔍 Profile check:", {
            blockchainResult: result.success,
            hasHealthProfile: !!healthProfile,
          });

          if (!isMounted) return;

          // User has a wallet connected, so show wallet interface
          // Health profile can be set up later within the wallet interface
          console.log("✅ Wallet connected - showing wallet interface");
          setHasCompletedSetup(true);

          // Load wallet data
          void getBalance();
          if (result.success) refreshProfile();
        } catch (error) {
          if (!isMounted) return;
          console.log("Checking setup status:", error);
          // Even if profile loading fails, if wallet is connected, show interface
          setHasCompletedSetup(true);
          void getBalance();
        }
      } else {
        // Not connected - let user manually start wizard via button
        if (isMounted) {
          setHasCompletedSetup(false);
          // Don't auto-open wizard to prevent loops: setShowWalletWizard(true);
        }
      }

      if (isMounted) {
        setIsCheckingSetup(false);
      }
    };

    void checkSetupStatus();

    return (): void => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, isConnected, address]); // Run when Privy ready state or connection state changes

  const handleWizardComplete = useCallback((): void => {
    // Mark wizard as just completed to prevent useEffect from running
    wizardJustCompletedRef.current = true;

    setShowWalletWizard(false);
    setHasCompletedSetup(true);
    setIsCheckingSetup(false); // Stop the checking state immediately
    localStorage.setItem("amach-wallet-setup-complete", "true");

    // Defer data fetching to break the render cycle
    // Let the page's natural mount/update cycle handle data loading
    setTimeout(() => {
      if (isConnected) {
        void getBalance();
        void (async (): Promise<void> => {
          const result = await loadProfileFromBlockchain();
          if (result.success) refreshProfile();
        })();
      }

      // Reset the flag after data is loaded
      setTimeout(() => {
        wizardJustCompletedRef.current = false;
        lastCheckedStateRef.current = null; // Allow future checks
      }, 1000);
    }, 100); // Small delay to let state updates complete
  }, [isConnected, getBalance, loadProfileFromBlockchain, refreshProfile]);

  const handleCloseWizard = useCallback((): void => {
    setShowWalletWizard(false);
  }, []);

  const handleCloseDashboard = useCallback((): void => {
    setIsDashboardOpen(false);
  }, [setIsDashboardOpen]);

  const handleCloseAiCompanion = useCallback((): void => {
    setIsAiCompanionOpen(false);
  }, [setIsAiCompanionOpen]);

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
        {isCheckingSetup ? (
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4"></div>
              <p className="text-amber-900">Checking wallet status...</p>
            </div>
          </div>
        ) : !hasCompletedSetup ? (
          <div className="max-w-2xl mx-auto">
            <Card className="bg-white border-emerald-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-emerald-900">
                  <Wallet className="h-5 w-5" />
                  Wallet Setup Required
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-amber-800">
                  Please complete the wallet setup process to access your wallet
                  and health profile.
                </p>
                <Button
                  onClick={() => setShowWalletWizard(true)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Start Wallet Setup
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : (
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

              {/* Storage Management */}
              {address && signMessage && (
                <StorageManagementSection
                  userAddress={address}
                  signMessage={signMessage}
                  getWalletClient={getWalletClient}
                />
              )}

              {/* Quarterly Aggregate Generator */}
              {address && signMessage && (
                <QuarterlyAggregateGenerator
                  userAddress={address}
                  signMessage={signMessage}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Wallet Setup Wizard */}
      <WalletSetupWizard
        isOpen={showWalletWizard}
        onClose={handleCloseWizard}
        onComplete={handleWizardComplete}
      />

      {/* Modals */}
      <HealthDashboardModal
        isOpen={isDashboardOpen}
        onClose={handleCloseDashboard}
      />
      <AiCompanionModal
        isOpen={isAiCompanionOpen}
        onClose={handleCloseAiCompanion}
      />
    </div>
  );
}
