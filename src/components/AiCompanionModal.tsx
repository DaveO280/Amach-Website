"use client";

import HealthStatCards from "@/components/ai/HealthStatCards";
import { useHealthDataContext } from "@/components/HealthDataContextWrapper";
import { Button } from "@/components/ui/button";
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
import HealthReport from "./ai/HealthReport";
import HealthTimelineTab from "./ai/HealthTimelineTab";
import ProfileInputModal from "./ai/ProfileInputModal";

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

  // Track if we've already populated profile to prevent infinite loops
  const hasPopulatedProfileRef = useRef(false);

  // Access the health data provider to check for available data
  const { metricData, userProfile, setUserProfile, setProfile } =
    useHealthDataContext();

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
        const walletProfile = await getDecryptedProfile(loadResult.profile);

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
          className="p-2 sm:p-4 md:p-6 overflow-auto"
          style={{ maxHeight: "calc(90vh - 60px)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* File Folder Tab Navigation */}
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
            <button
              className={`flex-1 px-4 py-2 text-sm sm:text-base font-semibold transition-colors focus:outline-none
                ${
                  activeTab === "goals"
                    ? "bg-white border-x border-t border-emerald-300 rounded-t-lg shadow-sm text-emerald-800 z-20"
                    : "bg-emerald-50 text-emerald-500 border-b border-r border-emerald-200 z-0"
                }
              `}
              onClick={() => setActiveTab("goals")}
            >
              Goals
            </button>
            <button
              className={`flex-1 px-4 py-2 text-sm sm:text-base font-semibold transition-colors focus:outline-none
                ${
                  activeTab === "timeline"
                    ? "bg-white border-x border-t border-emerald-300 rounded-t-lg shadow-sm text-emerald-800 z-20"
                    : "bg-emerald-50 text-emerald-500 border-b border-emerald-200 z-0"
                }
              `}
              onClick={() => setActiveTab("timeline")}
            >
              Timeline
            </button>
          </div>
          {/* Tab Content */}
          <div className="flex-1 min-h-0 flex flex-col">
            {activeTab === "chat" ? (
              <>
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

                {/* Health Report Section */}
                {hasHealthData ? (
                  isProfileComplete(userProfile) ? (
                    <div className="space-y-4">
                      {isConnected && (
                        <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                          <p className="text-green-800 text-sm">
                            ✅ Using profile data from your wallet
                          </p>
                        </div>
                      )}
                      <HealthReport />
                    </div>
                  ) : (
                    <div className="flex flex-col space-y-4">
                      <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                        <p className="text-amber-800">
                          {isConnected
                            ? "Loading your profile from blockchain..."
                            : "Please enter your profile information to generate a personalized health report."}
                        </p>
                      </div>
                      <Button
                        onClick={() => setShowProfileModal(true)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white w-fit"
                        disabled={isConnected}
                      >
                        {isConnected
                          ? "Loading Profile..."
                          : "Generate Health Report"}
                      </Button>
                    </div>
                  )
                ) : (
                  <div className="mb-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <p className="text-amber-800">
                      No health data available yet. Process your data in the
                      Health Dashboard for personalized insights.
                    </p>
                  </div>
                )}
                <AiProvider>
                  <div className="flex-1 min-h-0 flex flex-col">
                    <CosaintChatUI />
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
    </div>
  );
};

export default AiCompanionModal;
