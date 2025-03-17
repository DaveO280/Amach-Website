"use client";

import { useHealthData } from "@/my-health-app/store/healthDataStore/provider";
import { AiProvider } from "@/store/aiStore";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import CosaintChatUI from "./ai/CosaintChatUI";
import { HealthSummaryProvider } from "./ai/HealthDataProvider";
import HealthStatCards from "./ai/HealthStatCards";

interface AiCompanionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AiCompanionModal: React.FC<AiCompanionModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [isMobile, setIsMobile] = useState(false);
  const [showStats, setShowStats] = useState(true);
  const modalRef = useRef<HTMLDivElement>(null);

  // Access the health data provider to check for available data
  const healthData = useHealthData();

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

  // Add diagnostic logging for component mounting
  useEffect(() => {
    if (isOpen) {
      console.log("[AiCompanionModal] opened, data status:", {
        hasData: healthData?.hasData() || false,
        metrics: Object.keys(healthData?.metricData || {}).length,
      });
    }
  }, [isOpen, healthData]);

  // Prevent clicks on the modal from closing it
  const handleModalClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  if (!isOpen) return null;

  // Check if health data is available
  const hasHealthData = healthData?.hasData() || false;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-sm flex justify-center items-center p-2">
      <div
        ref={modalRef}
        className={`relative w-full rounded-lg shadow-xl overflow-hidden animate-in fade-in duration-300 ${
          isMobile ? "max-w-full max-h-[95vh]" : "max-w-[95vw] max-h-[90vh]"
        }`}
        style={{
          background:
            "linear-gradient(to bottom right, #FFE3B4, #ffffff, #CAF2DD)",
        }}
        onClick={handleModalClick}
      >
        {/* Header */}
        <header className="sticky top-0 z-10 w-full bg-white/90 border-b border-amber-100 backdrop-blur-sm">
          <div className="px-3 py-2 flex items-center justify-between">
            <h2 className="text-base sm:text-xl font-black text-emerald-900">
              Cosaint AI Health Companion
            </h2>
            <button
              onClick={onClose}
              className="rounded-full p-2 text-amber-900 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
              aria-label="Close companion"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div
          className="p-2 sm:p-4 md:p-6 overflow-auto"
          style={{ maxHeight: "calc(90vh - 60px)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <HealthSummaryProvider>
            {/* Health Stats Section with Toggle */}
            {hasHealthData && (
              <div className="mb-4">
                <div
                  className="flex items-center justify-between cursor-pointer bg-white/60 p-3 rounded-lg shadow-sm mb-2"
                  onClick={() => setShowStats(!showStats)}
                >
                  <h3 className="font-semibold text-emerald-800">
                    Your Health Overview
                  </h3>
                  <button className="text-emerald-600 hover:text-emerald-700">
                    {showStats ? (
                      <ChevronUp className="h-5 w-5" />
                    ) : (
                      <ChevronDown className="h-5 w-5" />
                    )}
                  </button>
                </div>

                {showStats && <HealthStatCards />}
              </div>
            )}

            {/* Data status indicator */}
            {!hasHealthData && (
              <div className="mb-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
                <p className="text-amber-800">
                  No health data available yet. Process your data in the Health
                  Dashboard for personalized insights.
                </p>
              </div>
            )}

            {/* AI chat component with necessary providers */}
            <AiProvider>
              <div className="bg-white/70 p-4 rounded-lg shadow-sm border border-emerald-50">
                <CosaintChatUI />
              </div>
            </AiProvider>
          </HealthSummaryProvider>
        </div>
      </div>
    </div>
  );
};

export default AiCompanionModal;
