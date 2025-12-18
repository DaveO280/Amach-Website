"use client";

import HealthStatCards from "@/components/ai/HealthStatCards";
import { useHealthDataContext } from "@/components/HealthDataContextWrapper";
import { useWalletService } from "@/hooks/useWalletService";
import AiProvider from "@/store/aiStore";
import {
  normalizeUserProfile,
  type NormalizedUserProfile,
  type RawUserProfileInput,
} from "@/utils/userProfileUtils";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import CosaintChatUI from "./ai/CosaintChatUI";
import GoalsTab from "./ai/GoalsTab";
import HealthTimelineTab from "./ai/HealthTimelineTab";
import ProfileInputModal from "./ai/ProfileInputModal";
import { GuidePopup } from "./ui/GuidePopup";

interface AiCompanionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AiCompanionModal: React.FC<AiCompanionModalProps> = (props) => {
  const [isMobile, setIsMobile] = useState(false);
  const [showStats, setShowStats] = useState(true);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "goals" | "timeline">(
    "chat",
  );
  const [showWalletBanner, setShowWalletBanner] = useState(true);

  // Popup state management
  const [showHealthDashboardPopup, setShowHealthDashboardPopup] =
    useState(false);
  const [showUploadFilePopup, setShowUploadFilePopup] = useState(false);
  const healthDashboardRef = useRef<HTMLButtonElement>(null);
  const uploadFileRef = useRef<HTMLButtonElement>(null);

  // Track if we've already populated profile to prevent infinite loops
  const hasPopulatedProfileRef = useRef(false);

  // Access the health data provider to check for available data
  const {
    metricData,
    userProfile,
    setUserProfile,
    setProfile,
    setIsDashboardOpen,
  } = useHealthDataContext();

  // Get wallet data
  const { isConnected, getDecryptedProfile, loadProfileFromBlockchain } =
    useWalletService();

  // Check if health data is available
  const hasHealthData = Object.keys(metricData).length > 0;

  // Reset the populated flag when modal closes
  useEffect(() => {
    if (!props.isOpen) {
      hasPopulatedProfileRef.current = false;
    }
  }, [props.isOpen]);

  // Load banner dismissal state from localStorage
  useEffect(() => {
    const dismissed = localStorage.getItem("amach-wallet-banner-dismissed");
    if (dismissed === "true") {
      setShowWalletBanner(false);
    }
  }, []);

  // Check if popups should be shown when modal opens
  useEffect(() => {
    if (!props.isOpen) {
      setShowHealthDashboardPopup(false);
      setShowUploadFilePopup(false);
      return;
    }

    // Check if popups have been dismissed
    const healthDashboardDismissed = localStorage.getItem(
      "amach-health-dashboard-popup-dismissed",
    );
    const uploadFileDismissed = localStorage.getItem(
      "amach-upload-file-popup-dismissed",
    );

    // Show first popup if not dismissed, after a delay to ensure DOM is ready
    // Only show if Health Dashboard link is visible (no health data)
    if (!healthDashboardDismissed && !hasHealthData) {
      // Retry mechanism to wait for element to appear
      let timeoutId: NodeJS.Timeout;
      const checkAndShow = (attempts = 0): void => {
        // Check if element exists and is visible
        if (
          healthDashboardRef.current &&
          healthDashboardRef.current.offsetParent !== null
        ) {
          // Scroll element into view if needed
          healthDashboardRef.current.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "center",
          });

          // Wait for scroll to complete before showing popup
          timeoutId = setTimeout(() => {
            setShowHealthDashboardPopup(true);
          }, 600);
          return;
        }
        if (attempts < 20) {
          timeoutId = setTimeout(() => checkAndShow(attempts + 1), 150);
        } else {
          console.warn("Health Dashboard element not found after retries");
        }
      };
      const timer = setTimeout(() => checkAndShow(), 500);
      return () => {
        clearTimeout(timer);
        if (timeoutId) clearTimeout(timeoutId);
      };
    } else if (!uploadFileDismissed) {
      // If first popup was dismissed/not applicable, show second popup
      // Retry mechanism to wait for element to appear
      let timeoutId: NodeJS.Timeout;
      const checkAndShow = (attempts = 0): void => {
        // Check if element exists and is visible
        if (
          uploadFileRef.current &&
          uploadFileRef.current.offsetParent !== null
        ) {
          // Scroll element into view if needed
          uploadFileRef.current.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "center",
          });

          // Wait for scroll to complete before showing popup
          timeoutId = setTimeout(() => {
            setShowUploadFilePopup(true);
          }, 600);
          return;
        }
        if (attempts < 20) {
          timeoutId = setTimeout(() => checkAndShow(attempts + 1), 150);
        } else {
          console.warn("Upload File element not found after retries");
        }
      };
      const timer = setTimeout(
        () => checkAndShow(),
        healthDashboardDismissed || hasHealthData ? 500 : 1000,
      );
      return () => {
        clearTimeout(timer);
        if (timeoutId) clearTimeout(timeoutId);
      };
    }
  }, [props.isOpen, hasHealthData]);

  // Handle Health Dashboard popup close - show Upload File popup next
  const handleHealthDashboardPopupClose = (): void => {
    setShowHealthDashboardPopup(false);
    const uploadFileDismissed = localStorage.getItem(
      "amach-upload-file-popup-dismissed",
    );
    if (!uploadFileDismissed) {
      setTimeout(() => {
        setShowUploadFilePopup(true);
      }, 300);
    }
  };

  // Handle "Don't show again" for Health Dashboard popup
  const handleHealthDashboardDontShowAgain = (): void => {
    localStorage.setItem("amach-health-dashboard-popup-dismissed", "true");
    setShowHealthDashboardPopup(false);
    const uploadFileDismissed = localStorage.getItem(
      "amach-upload-file-popup-dismissed",
    );
    if (!uploadFileDismissed) {
      setTimeout(() => {
        setShowUploadFilePopup(true);
      }, 300);
    }
  };

  // Handle "Don't show again" for Upload File popup
  const handleUploadFileDontShowAgain = (): void => {
    localStorage.setItem("amach-upload-file-popup-dismissed", "true");
    setShowUploadFilePopup(false);
  };

  // Handle banner dismissal
  const handleDismissBanner = (): void => {
    setShowWalletBanner(false);
    localStorage.setItem("amach-wallet-banner-dismissed", "true");
  };

  // Auto-populate profile from wallet when modal opens
  useEffect(() => {
    const populateProfileFromWallet = async (): Promise<void> => {
      if (
        !props.isOpen ||
        !isConnected ||
        isProfileComplete(userProfile) ||
        hasPopulatedProfileRef.current
      ) {
        return;
      }

      // Mark as populated before async operations
      hasPopulatedProfileRef.current = true;

      try {
        // Load fresh data from blockchain
        const loadResult = await loadProfileFromBlockchain();

        if (!loadResult.success) {
          console.warn(
            "⚠️ Failed to load profile from blockchain:",
            loadResult.error,
          );
          return;
        }

        // Use the profile data directly from the load result to avoid React state timing issues
        // This is especially important in production where state updates may be batched differently
        console.log("🔍 Load result profile data:", {
          hasProfile: !!loadResult.profile,
          hasNonce: !!loadResult.profile?.nonce,
          profileKeys: loadResult.profile
            ? Object.keys(loadResult.profile)
            : [],
        });

        const walletProfile = await getDecryptedProfile(loadResult.profile);

        console.log("🔍 Decrypted profile result:", {
          hasWalletProfile: !!walletProfile,
          walletProfileKeys: walletProfile ? Object.keys(walletProfile) : [],
        });

        if (walletProfile) {
          const rawProfile: RawUserProfileInput = {
            birthDate: walletProfile.birthDate,
            sex: walletProfile.sex,
            height: walletProfile.height,
            heightIn: (walletProfile as { heightIn?: number }).heightIn,
            heightCm: (walletProfile as { heightCm?: number }).heightCm,
            weight: walletProfile.weight,
            weightKg: (walletProfile as { weightKg?: number }).weightKg,
            weightLbs: (walletProfile as { weightLbs?: number }).weightLbs,
            age: (walletProfile as { age?: number }).age,
            name: (walletProfile as { name?: string }).name,
          };

          const normalized = normalizeUserProfile(rawProfile);

          setUserProfile(normalized);
          setProfile(normalized);

          console.log(
            "✅ Auto-populated AI companion profile from wallet:",
            normalized,
          );
        }
      } catch (error) {
        console.error("❌ Failed to populate profile from wallet:", error);
      }
    };

    populateProfileFromWallet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.isOpen, isConnected]); // Removed userProfile and setter functions from dependencies

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

  // Prevent clicks on the modal from closing it
  const handleModalClick = (e: React.MouseEvent): void => {
    e.stopPropagation();
  };

  // Helper to check if userProfile is complete
  function isProfileComplete(
    profile: unknown,
  ): profile is NormalizedUserProfile {
    if (typeof profile !== "object" || profile === null) {
      return false;
    }
    const obj = profile as NormalizedUserProfile;
    const hasHeight =
      (typeof obj.heightIn === "number" && obj.heightIn > 0) ||
      (typeof obj.heightCm === "number" && obj.heightCm > 0);
    const hasWeight =
      (typeof obj.weightLbs === "number" && obj.weightLbs > 0) ||
      (typeof obj.weightKg === "number" && obj.weightKg > 0);
    return (
      hasHeight &&
      hasWeight &&
      typeof obj.sex === "string" &&
      obj.sex.length > 0 &&
      (typeof obj.birthDate === "string" ||
        (typeof obj.age === "number" && obj.age > 0))
    );
  }

  // Lock background scroll and ensure viewport starts at top when open
  useEffect(() => {
    if (props.isOpen) {
      try {
        document.body.style.overflow = "hidden";
      } catch {}
      try {
        window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
      } catch {
        window.scrollTo(0, 0);
      }
      // Best-effort: close any open dropdowns by simulating outside click
      try {
        const evt = new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
        });
        document.body.dispatchEvent(evt);
      } catch {}
    } else {
      try {
        document.body.style.overflow = "";
      } catch {}
    }
    return (): void => {
      try {
        document.body.style.overflow = "";
      } catch {}
    };
  }, [props.isOpen]);

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
            <h2 className="text-base sm:text-xl font-black text-emerald-900">
              Amach Health
            </h2>
            <div className="flex items-center space-x-2">
              <button
                onClick={props.onClose}
                className="rounded-full p-2 text-amber-900 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                aria-label="Close dashboard"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>

        <div
          className="p-2 sm:p-4 md:p-6 overflow-auto relative"
          style={{ maxHeight: "calc(90vh - 60px)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* File Folder Tab Navigation - Always visible, locked tabs when no wallet */}
          <div className="flex mb-4 gap-0 w-full border-b border-emerald-200 relative z-10">
            <button
              className={`flex-1 px-4 py-2 text-sm sm:text-base font-semibold transition-colors focus:outline-none
                ${
                  activeTab === "chat"
                    ? "bg-white border-x border-t border-emerald-300 rounded-t-lg shadow-sm text-emerald-800 z-20"
                    : "bg-emerald-50 text-emerald-500 border-b border-r border-emerald-200 z-0"
                }
              `}
              onClick={() => setActiveTab("chat")}
            >
              Chat
            </button>
            <div className="flex-1 relative group">
              <button
                className={`w-full px-4 py-2 text-sm sm:text-base font-semibold transition-colors focus:outline-none
                  ${
                    activeTab === "goals"
                      ? "bg-white border-x border-t border-emerald-300 rounded-t-lg shadow-sm text-emerald-800 z-20"
                      : "bg-emerald-50 text-emerald-500 border-b border-r border-emerald-200 z-0"
                  }
                  ${!isConnected ? "opacity-50 cursor-not-allowed" : ""}
                `}
                onClick={() => isConnected && setActiveTab("goals")}
                disabled={!isConnected}
              >
                Goals
              </button>
              {!isConnected && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-2 bg-emerald-900/95 text-white text-xs rounded-md invisible group-hover:visible pointer-events-none whitespace-nowrap z-50">
                  🔒 Create a wallet to unlock Goals
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 -mb-0.5 border-4 border-transparent border-b-emerald-900/95"></div>
                </div>
              )}
            </div>
            <div className="flex-1 relative group">
              <button
                className={`w-full px-4 py-2 text-sm sm:text-base font-semibold transition-colors focus:outline-none
                  ${
                    activeTab === "timeline"
                      ? "bg-white border-x border-t border-emerald-300 rounded-t-lg shadow-sm text-emerald-800 z-20"
                      : "bg-emerald-50 text-emerald-500 border-b border-emerald-200 z-0"
                  }
                  ${!isConnected ? "opacity-50 cursor-not-allowed" : ""}
                `}
                onClick={() => isConnected && setActiveTab("timeline")}
                disabled={!isConnected}
              >
                Timeline
              </button>
              {!isConnected && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-2 bg-emerald-900/95 text-white text-xs rounded-md invisible group-hover:visible pointer-events-none whitespace-nowrap z-50">
                  🔒 Create a wallet to unlock Timeline
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 -mb-0.5 border-4 border-transparent border-b-emerald-900/95"></div>
                </div>
              )}
            </div>
          </div>
          {/* Tab Content */}
          <div className="flex-1 min-h-0 flex flex-col">
            {activeTab === "chat" ? (
              <>
                {/* Wallet Benefits Banner - Only show if not connected and not dismissed */}
                {!isConnected && showWalletBanner && (
                  <div className="mb-4 p-4 bg-gradient-to-r from-emerald-50 to-amber-50 rounded-lg border border-emerald-200 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <h4 className="font-semibold text-emerald-800 mb-2">
                          💡 Unlock Context-Powered AI
                        </h4>
                        <p className="text-sm text-emerald-700 mb-2">
                          Create a wallet to enable 100% private health data
                          storage. Your AI insights become more powerful with
                          your complete health context.
                        </p>
                        <a
                          href="/wallet-benefits"
                          className="text-sm text-emerald-600 hover:text-emerald-700 underline font-medium"
                        >
                          Learn more about wallet benefits →
                        </a>
                      </div>
                      <button
                        onClick={handleDismissBanner}
                        className="text-emerald-600 hover:text-emerald-800 transition-colors"
                        aria-label="Dismiss banner"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}

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

                    {showStats && (
                      <div className="mb-4">
                        <HealthStatCards />
                      </div>
                    )}
                  </div>
                )}

                {/* Health Data Availability Message */}
                {!hasHealthData && (
                  <div className="mb-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <p className="text-amber-800">
                      No health data available yet. Process your data in the{" "}
                      <button
                        ref={healthDashboardRef}
                        onClick={() => {
                          props.onClose();
                          // Open dashboard modal directly
                          setTimeout(() => {
                            setIsDashboardOpen(true);
                          }, 100);
                        }}
                        className="text-emerald-600 hover:text-emerald-700 underline font-medium cursor-pointer"
                      >
                        Health Dashboard
                      </button>{" "}
                      for personalized insights.
                    </p>
                  </div>
                )}
                <AiProvider>
                  <div className="flex-1 min-h-0 flex flex-col">
                    <CosaintChatUI uploadFileButtonRef={uploadFileRef} />
                  </div>
                </AiProvider>
              </>
            ) : activeTab === "goals" ? (
              <div className="flex-1 min-h-0 flex flex-col">
                <GoalsTab />
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col">
                <HealthTimelineTab />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Profile Input Modal */}
      <ProfileInputModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        onSubmit={(data) => {
          const totalInches = data.heightFeet * 12 + data.heightInches;
          const rawProfile: RawUserProfileInput = {
            age: data.age,
            birthDate: data.birthDate,
            sex: data.sex,
            heightIn: totalInches,
            weightLbs: data.weight,
          };
          const normalized = normalizeUserProfile(rawProfile);
          const mergedProfile: NormalizedUserProfile = {
            ...(userProfile ?? {}),
            ...normalized,
          };
          setUserProfile(mergedProfile);
          setProfile(mergedProfile);
          setShowProfileModal(false);
        }}
        initialProfile={userProfile as NormalizedUserProfile | null}
      />

      {/* Health Dashboard Guide Popup */}
      <GuidePopup
        isVisible={showHealthDashboardPopup && !!healthDashboardRef.current}
        onClose={handleHealthDashboardPopupClose}
        onDontShowAgain={handleHealthDashboardDontShowAgain}
        targetElementRef={healthDashboardRef}
        title="📊 Add Your Health Data"
        position="bottom"
        content={
          <div>
            <p className="mb-2">
              Add your Apple Health data in the{" "}
              <strong>Health Dashboard</strong> to get personalized AI insights.
            </p>
            <p className="mb-2">
              <strong>🔒 Your data is completely private</strong> - it&apos;s
              stored locally in your browser and never leaves your device.
            </p>
            <p className="text-xs text-amber-700 font-medium">
              ⚠️ Please don&apos;t use this feature on a public or shared
              computer.
            </p>
          </div>
        }
      />

      {/* Upload File Guide Popup */}
      <GuidePopup
        isVisible={showUploadFilePopup && !!uploadFileRef.current}
        onClose={() => setShowUploadFilePopup(false)}
        onDontShowAgain={handleUploadFileDontShowAgain}
        targetElementRef={uploadFileRef}
        title="📁 Upload Files for Context"
        position="bottom"
        content={
          <div>
            <p>
              You can also upload health reports, lab results, or other health
              documents using the{" "}
              <strong>&quot;Upload File to Context&quot;</strong> button. This
              helps the AI provide more personalized insights based on your
              complete health history.
            </p>
          </div>
        }
      />
    </div>
  );
};

export default AiCompanionModal;
