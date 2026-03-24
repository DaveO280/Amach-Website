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
      if (isConnected && address) {
        try {
          const result = await loadProfileFromBlockchain();
          const healthProfile = getHealthProfile();

          console.log("🔍 Profile check:", {
            blockchainResult: result.success,
            hasHealthProfile: !!healthProfile,
          });

          if (!isMounted) return;

          console.log("✅ Wallet connected - showing wallet interface");
          setHasCompletedSetup(true);

          void getBalance();
          if (result.success) refreshProfile();
        } catch (error) {
          if (!isMounted) return;
          console.log("Checking setup status:", error);
          setHasCompletedSetup(true);
          void getBalance();
        }
      } else {
        if (isMounted) {
          setHasCompletedSetup(false);
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
  }, [ready, isConnected, address]);

  const handleWizardComplete = useCallback((): void => {
    wizardJustCompletedRef.current = true;

    setShowWalletWizard(false);
    setHasCompletedSetup(true);
    setIsCheckingSetup(false);
    localStorage.setItem("amach-wallet-setup-complete", "true");

    setTimeout(() => {
      if (isConnected) {
        void getBalance();
        void (async (): Promise<void> => {
          const result = await loadProfileFromBlockchain();
          if (result.success) refreshProfile();
        })();
      }

      setTimeout(() => {
        wizardJustCompletedRef.current = false;
        lastCheckedStateRef.current = null;
      }, 1000);
    }, 100);
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
    <div className="min-h-screen bg-white dark:bg-[#050A07]">
      {/* Navigation Bar */}
      <nav className="sticky top-0 z-50 border-b border-[rgba(0,107,79,0.12)] dark:border-[rgba(0,107,79,0.15)] backdrop-blur-md bg-white/[.93] dark:bg-[rgba(5,10,7,0.93)]">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Mobile Menu Button */}
            <button
              className="md:hidden p-2 rounded-lg text-[#006B4F] hover:bg-[rgba(0,107,79,0.08)] transition-colors"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-1 w-full">
              {/* Amach Health wordmark */}
              <div className="amach-wordmark-wrap leading-[1.1] gap-[1px] mr-3">
                <span className="amach-wordmark-line text-[11px] tracking-[0.28em]">
                  Amach
                </span>
                <span className="amach-wordmark-line text-[11px] tracking-[0.28em]">
                  Health
                </span>
              </div>

              <button
                onClick={handleNavigateHome}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-[#006B4F] hover:bg-[rgba(0,107,79,0.08)] font-medium text-sm transition-colors"
              >
                <Home className="h-4 w-4" />
                <span>Home</span>
              </button>
              <button
                onClick={handleNavigateDashboard}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-[#006B4F] hover:bg-[rgba(0,107,79,0.08)] font-medium text-sm transition-colors"
              >
                <LayoutDashboard className="h-4 w-4" />
                <span>Dashboard</span>
              </button>
              <button
                onClick={handleNavigateAICompanion}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-[#006B4F] hover:bg-[rgba(0,107,79,0.08)] font-medium text-sm transition-colors"
              >
                <Brain className="h-4 w-4" />
                <span>AI Companion</span>
              </button>
              <div className="ml-auto">
                <button
                  onClick={handleDisconnect}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-red-600 dark:text-[#F87171] border border-red-200 dark:border-[rgba(248,113,113,0.3)] hover:bg-red-50 dark:hover:bg-[rgba(248,113,113,0.08)] font-medium text-sm transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Disconnect</span>
                </button>
              </div>
            </div>

            {/* Page Title - Mobile */}
            <h1 className="text-lg font-bold md:hidden text-[#0A1A0F] dark:text-[#F0F7F3]">
              Wallet
            </h1>

            {/* Disconnect Button - Mobile */}
            {!isMobileMenuOpen && (
              <button
                onClick={handleDisconnect}
                className="md:hidden flex items-center gap-1 px-3 py-1.5 rounded-lg text-red-600 dark:text-[#F87171] border border-red-200 dark:border-[rgba(248,113,113,0.3)] hover:bg-red-50 dark:hover:bg-[rgba(248,113,113,0.08)] font-medium text-sm transition-colors"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Disconnect</span>
              </button>
            )}
          </div>

          {/* Mobile Menu Dropdown */}
          {isMobileMenuOpen && (
            <div className="md:hidden mt-3 pb-2 space-y-1 border-t border-[rgba(0,107,79,0.12)] pt-3">
              <button
                onClick={handleNavigateHome}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[#006B4F] hover:bg-[rgba(0,107,79,0.08)] font-medium text-sm transition-colors"
              >
                <Home className="h-5 w-5" />
                <span>Home</span>
              </button>
              <button
                onClick={handleNavigateDashboard}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[#006B4F] hover:bg-[rgba(0,107,79,0.08)] font-medium text-sm transition-colors"
              >
                <LayoutDashboard className="h-5 w-5" />
                <span>Dashboard</span>
              </button>
              <button
                onClick={handleNavigateAICompanion}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[#006B4F] hover:bg-[rgba(0,107,79,0.08)] font-medium text-sm transition-colors"
              >
                <Brain className="h-5 w-5" />
                <span>AI Companion</span>
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        {isCheckingSetup ? (
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#006B4F] mx-auto mb-4" />
              <p className="text-[#6B8C7A]">Checking wallet status...</p>
            </div>
          </div>
        ) : !hasCompletedSetup ? (
          <div className="max-w-2xl mx-auto">
            <div className="rounded-xl border bg-white dark:bg-[#0B140F] border-[rgba(0,107,79,0.12)] dark:border-[rgba(0,107,79,0.15)] p-6">
              <div className="flex items-center gap-2 mb-4">
                <Wallet className="h-5 w-5 text-[#006B4F]" />
                <h2 className="text-lg font-semibold text-[#0A1A0F] dark:text-[#F0F7F3]">
                  Wallet Setup Required
                </h2>
              </div>
              <p className="text-[#6B8C7A] mb-4">
                Please complete the wallet setup process to access your wallet
                and health profile.
              </p>
              <button
                onClick={() => setShowWalletWizard(true)}
                className="w-full bg-[#006B4F] hover:bg-[#005A40] text-white rounded-lg px-4 py-2 font-medium transition-colors"
              >
                Start Wallet Setup
              </button>
            </div>
          </div>
        ) : (
          <>
            <h1 className="flex items-center gap-[10px] text-[22px] font-bold text-[#0A1A0F] dark:text-[#F0F7F3] mb-7">
              <Wallet className="h-[22px] w-[22px] text-[#006B4F]" />
              Wallet
            </h1>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-4 space-y-6">
                <WalletSummaryWidget />
                <CryptoWallet />
              </div>

              <div className="lg:col-span-8 space-y-6">
                <HealthProfileManager />

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
          </>
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
