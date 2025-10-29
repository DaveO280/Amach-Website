"use client";

import { X, Home, Wallet, Brain, LogOut, Menu } from "lucide-react";
import dynamic from "next/dynamic";
import React, { useEffect, useRef, useState } from "react";
import { useZkSyncSsoWallet } from "../hooks/useZkSyncSsoWallet";
import { useHealthDataContext } from "./HealthDataContextWrapper";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Wallet as WalletIcon } from "lucide-react";
import { useRouter } from "next/navigation";

// Import the actual components directly to avoid chunk loading errors
const HealthDataSelector = dynamic(() => import("./HealthDataSelector"), {
  ssr: false,
  loading: () => (
    <div className="flex justify-center items-center min-h-[200px]">
      <div className="animate-pulse-slow rounded-full h-8 w-8 border-t-2 border-b-2 border-emerald-600"></div>
    </div>
  ),
});

const HealthDashboard = dynamic(() => import("./dashboard/HealthDashboard"), {
  ssr: false,
  loading: () => (
    <div className="flex justify-center items-center min-h-[400px]">
      <div className="animate-pulse-slow rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-600"></div>
    </div>
  ),
});

// Error boundary component for dynamic imports
const ErrorBoundary: React.FC<{
  children: React.ReactNode;
  fallback?: React.ReactNode;
}> = ({
  children,
  fallback = (
    <div className="flex justify-center items-center min-h-[200px] p-4">
      <div className="text-center">
        <div className="text-red-600 mb-2">⚠️ Component failed to load</div>
        <div className="text-sm text-gray-600">
          Please refresh the page to try again
        </div>
      </div>
    </div>
  ),
}): JSX.Element => {
  const [hasError, setHasError] = React.useState(false);

  React.useEffect((): (() => void) => {
    const handleError = (): void => setHasError(true);
    window.addEventListener("error", handleError);
    return (): void => {
      window.removeEventListener("error", handleError);
    };
  }, []);

  if (hasError) {
    return <div>{fallback}</div>;
  }

  return <div>{children}</div>;
};

interface HealthDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const HealthDashboardModal: React.FC<HealthDashboardModalProps> = (props) => {
  const [isMobile, setIsMobile] = useState(false);
  const [activeTab, setActiveTab] = useState<"selector" | "dashboard">(
    "selector",
  );
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const { isConnected, disconnect } = useZkSyncSsoWallet();
  const { setIsAiCompanionOpen } = useHealthDataContext();
  const router = useRouter();

  // Check viewport size to adjust UI accordingly
  useEffect(() => {
    const handleResize = (): void => {
      setIsMobile(window.innerWidth < 768);
    };

    // Initial check
    handleResize();

    // Listen for resize events
    window.addEventListener("resize", handleResize);

    // Clean up listener
    return (): void => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Force close any dropdowns when tab changes
  const handleTabChange = (tab: "selector" | "dashboard"): void => {
    setActiveTab(tab);

    // This will close any open Radix UI dropdowns by simulating a click outside
    const clickEvent = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      view: window,
    });
    document.body.dispatchEvent(clickEvent);
  };

  // Prevent clicks on the modal from closing it
  const handleModalClick = (e: React.MouseEvent): void => {
    e.stopPropagation();
  };

  if (!props.isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-sm flex justify-center items-center p-2">
      <div
        ref={modalRef}
        className={`relative w-full rounded-lg shadow-xl overflow-hidden animate-in fade-in duration-300 ${
          isMobile
            ? "max-w-full max-h-[95vh]" // Full width on mobile with slight padding
            : "max-w-[95vw] max-h-[90vh]" // 95% width on desktop
        }`}
        style={{
          background:
            "linear-gradient(to bottom right, #FFE3B4, #ffffff, #CAF2DD)",
        }}
        onClick={handleModalClick}
      >
        {/* Adaptive header structure for both mobile and desktop */}
        <header className="sticky top-0 z-10 w-full bg-white/90 border-b border-amber-100 backdrop-blur-sm">
          {/* Title row with navigation */}
          <div className="px-3 py-2">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {/* Mobile Nav Button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="md:hidden p-1"
                  onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
                >
                  <Menu className="h-4 w-4" />
                </Button>
                <h2 className="text-base sm:text-xl font-black text-emerald-900 truncate">
                  Dashboard
                </h2>
                {isConnected && (
                  <Badge
                    variant="default"
                    className="bg-emerald-100 text-emerald-700 hidden sm:flex"
                  >
                    <WalletIcon className="h-3 w-3 mr-1" />
                    Connected
                  </Badge>
                )}
              </div>
              {/* Desktop Navigation */}
              <div className="hidden md:flex items-center gap-1 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    props.onClose();
                    router.push("/");
                  }}
                  className="text-emerald-700 hover:bg-emerald-50 h-7 px-2"
                >
                  <Home className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    props.onClose();
                    router.push("/wallet");
                  }}
                  className="text-emerald-700 hover:bg-emerald-50 h-7 px-2"
                >
                  <Wallet className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    props.onClose();
                    setIsAiCompanionOpen(true);
                  }}
                  className="text-emerald-700 hover:bg-emerald-50 h-7 px-2"
                >
                  <Brain className="h-3 w-3" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    disconnect();
                    props.onClose();
                    router.push("/");
                  }}
                  className="text-red-600 border-red-300 hover:bg-red-50 h-7 px-2 ml-1"
                >
                  <LogOut className="h-3 w-3" />
                </Button>
              </div>
              <button
                onClick={props.onClose}
                className="rounded-full p-2 text-amber-900 hover:text-emerald-600 hover:bg-emerald-50 transition-colors sm:hidden ml-2"
                aria-label="Close dashboard"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Mobile Navigation Dropdown */}
            {isMobileNavOpen && (
              <div className="md:hidden py-2 border-t border-amber-100 space-y-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    props.onClose();
                    router.push("/");
                    setIsMobileNavOpen(false);
                  }}
                  className="w-full justify-start text-emerald-700 hover:bg-emerald-50"
                >
                  <Home className="h-4 w-4 mr-2" />
                  Home
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    props.onClose();
                    router.push("/wallet");
                    setIsMobileNavOpen(false);
                  }}
                  className="w-full justify-start text-emerald-700 hover:bg-emerald-50"
                >
                  <Wallet className="h-4 w-4 mr-2" />
                  Wallet
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    props.onClose();
                    setIsAiCompanionOpen(true);
                    setIsMobileNavOpen(false);
                  }}
                  className="w-full justify-start text-emerald-700 hover:bg-emerald-50"
                >
                  <Brain className="h-4 w-4 mr-2" />
                  AI Companion
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    disconnect();
                    props.onClose();
                    router.push("/");
                    setIsMobileNavOpen(false);
                  }}
                  className="w-full justify-start text-red-600 border-red-300 hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Disconnect
                </Button>
              </div>
            )}
          </div>

          {/* Tabs in a separate div with improved desktop layout */}
          <div className="px-3 pb-2">
            <div
              className={`flex space-x-2 ${!isMobile ? "max-w-md mx-auto" : ""}`}
            >
              <button
                onClick={() => handleTabChange("selector")}
                className={`flex-1 px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-colors ${
                  activeTab === "selector"
                    ? "bg-[#006B4F] text-white border-b border-[#005540]"
                    : "bg-white text-[#006B4F] hover:bg-[#E8F5F0] border border-[#006B4F]/30"
                }`}
              >
                Data Selector
              </button>
              <button
                onClick={() => handleTabChange("dashboard")}
                className={`flex-1 px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-colors ${
                  activeTab === "dashboard"
                    ? "bg-[#006B4F] text-white border-b border-[#005540]"
                    : "bg-white text-[#006B4F] hover:bg-[#E8F5F0] border border-[#006B4F]/30"
                }`}
              >
                Visualizations
              </button>
            </div>
            <button
              onClick={props.onClose}
              className="absolute right-3 top-2 rounded-full p-2 text-amber-900 hover:text-emerald-600 hover:bg-emerald-50 transition-colors hidden sm:block"
              aria-label="Close dashboard"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div
          className="p-2 sm:p-4 md:p-6 overflow-auto"
          style={{ maxHeight: "calc(90vh - 110px)" }}
          onClick={(e) => e.stopPropagation()} // Prevent clicks from closing the modal
        >
          {/* Dashboard modal shows only data tabs (no wallet components) */}
          {activeTab === "selector" ? (
            <ErrorBoundary>
              <HealthDataSelector />
            </ErrorBoundary>
          ) : (
            <ErrorBoundary>
              <HealthDashboard />
            </ErrorBoundary>
          )}
        </div>
      </div>
    </div>
  );
};

export default HealthDashboardModal;
