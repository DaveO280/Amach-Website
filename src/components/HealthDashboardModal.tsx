"use client";

import { X } from "lucide-react";
import dynamic from "next/dynamic";
import React, { useEffect, useRef, useState } from "react";

// Import the actual components instead of the page
// This way we can wrap them in the providers ourselves
const HealthDataSelector = dynamic(
  () => import("../my-health-app/components/HealthDataSelector"),
  {
    ssr: false,
    loading: () => (
      <div className="flex justify-center items-center min-h-[200px]">
        <div className="animate-pulse-slow rounded-full h-8 w-8 border-t-2 border-b-2 border-emerald-600"></div>
      </div>
    ),
  },
);

const HealthDashboard = dynamic(
  () => import("../my-health-app/components/dashboard/HealthDashboard"),
  {
    ssr: false,
    loading: () => (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="animate-pulse-slow rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-600"></div>
      </div>
    ),
  },
);

// Import the providers directly to ensure they're available
const SelectionProvider = dynamic(
  () =>
    import("../my-health-app/store/selectionStore/provider").then(
      (mod) => mod.SelectionProvider,
    ),
  {
    ssr: false,
  },
);

const HealthDataProvider = dynamic(
  () =>
    import("../my-health-app/store/healthDataStore/provider").then(
      (mod) => mod.HealthDataProvider,
    ),
  {
    ssr: false,
  },
);

interface HealthDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const HealthDashboardModal: React.FC<HealthDashboardModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [isMobile, setIsMobile] = useState(false);
  const [activeTab, setActiveTab] = useState<"selector" | "dashboard">(
    "selector",
  );

  // Create a reference to track dropdown menus
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Check viewport size to adjust UI accordingly
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    // Initial check
    handleResize();

    // Listen for resize events
    window.addEventListener("resize", handleResize);

    // Clean up listener
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Force close any dropdowns when tab changes
  const handleTabChange = (tab: "selector" | "dashboard") => {
    setActiveTab(tab);

    // This will close any open Radix UI dropdowns by simulating a click outside
    // It works by dispatching a click event to the document body
    const clickEvent = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      view: window,
    });
    document.body.dispatchEvent(clickEvent);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-sm flex justify-center items-center p-2">
      <div
        ref={dropdownRef}
        className={`relative w-full rounded-lg shadow-xl overflow-hidden animate-in fade-in duration-300 ${
          isMobile
            ? "max-w-full max-h-[95vh]" // Full width on mobile with slight padding
            : "max-w-[95vw] max-h-[90vh]" // 95% width on desktop
        }`}
        style={{
          background:
            "linear-gradient(to bottom right, #FFE3B4, #ffffff, #CAF2DD)",
        }}
      >
        <div className="sticky top-0 z-10 flex flex-col sm:flex-row sm:items-center justify-between border-b border-amber-100 px-4 py-3 sm:px-6 sm:py-4 bg-white/80 backdrop-blur-sm">
          <div className="flex items-center justify-between w-full sm:w-auto">
            <h2 className="text-lg sm:text-xl md:text-2xl font-black text-emerald-900 truncate mr-2">
              Amach Health Dashboard
            </h2>
            <button
              onClick={onClose}
              className="rounded-full p-2 text-amber-900 hover:text-emerald-600 hover:bg-emerald-50 transition-colors sm:hidden"
              aria-label="Close dashboard"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-2 sm:mt-0 flex w-full sm:w-auto justify-between sm:justify-end">
            {/* Tabs for switching between selector and dashboard */}
            <div className="flex space-x-2 flex-1 sm:flex-auto">
              <button
                onClick={() => handleTabChange("selector")}
                className={`flex-1 sm:flex-auto px-4 py-2 text-sm rounded-lg transition-colors ${
                  activeTab === "selector"
                    ? "bg-[#006B4F] text-white border-b-2 border-[#005540]"
                    : "bg-transparent text-[#006B4F] hover:bg-[#E8F5F0] border border-[#006B4F]/30"
                }`}
              >
                Data Selector
              </button>
              <button
                onClick={() => handleTabChange("dashboard")}
                className={`flex-1 sm:flex-auto px-4 py-2 text-sm rounded-lg transition-colors ${
                  activeTab === "dashboard"
                    ? "bg-[#006B4F] text-white border-b-2 border-[#005540]"
                    : "bg-transparent text-[#006B4F] hover:bg-[#E8F5F0] border border-[#006B4F]/30"
                }`}
              >
                Visualizations
              </button>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-2 ml-4 text-amber-900 hover:text-emerald-600 hover:bg-emerald-50 transition-colors hidden sm:block"
              aria-label="Close dashboard"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div
          className="p-2 sm:p-4 md:p-6 overflow-auto"
          style={{ maxHeight: "calc(90vh - 64px)" }}
          onClick={(e) => e.stopPropagation()} // Prevent clicks from closing the modal
        >
          {/* Make sure we wrap the components in their required providers */}
          <SelectionProvider>
            <HealthDataProvider>
              {activeTab === "selector" ? (
                <HealthDataSelector />
              ) : (
                <HealthDashboard />
              )}
            </HealthDataProvider>
          </SelectionProvider>
        </div>
      </div>
    </div>
  );
};

export default HealthDashboardModal;
