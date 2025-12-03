"use client";

import { Shield, Wallet, X } from "lucide-react";
import dynamic from "next/dynamic";
import React, { useEffect, useRef, useState } from "react";
import { useWalletService } from "../hooks/useWalletService";
import { Badge } from "./ui/badge";

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
  const modalRef = useRef<HTMLDivElement>(null);
  const { isConnected, healthProfile } = useWalletService();

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
    <div className="fixed inset-0 z-[100] overflow-hidden bg-black/40 backdrop-blur-sm flex justify-center items-center p-2">
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
          {/* Title row */}
          <div className="px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-base sm:text-xl font-black text-emerald-900">
                Amach Health
              </h2>
              {isConnected && (
                <Badge
                  variant="default"
                  className="bg-emerald-100 text-emerald-700"
                >
                  <Wallet className="h-3 w-3 mr-1" />
                  Connected
                </Badge>
              )}
              {healthProfile && (
                <Badge
                  variant="default"
                  className="bg-amber-100 text-amber-800"
                >
                  <Shield className="h-3 w-3 mr-1" />
                  Profile On-Chain
                </Badge>
              )}
            </div>
            <button
              onClick={props.onClose}
              className="rounded-full p-2 text-amber-900 hover:text-emerald-600 hover:bg-emerald-50 transition-colors sm:hidden"
              aria-label="Close dashboard"
            >
              <X className="h-5 w-5" />
            </button>
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
